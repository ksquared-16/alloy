import { describe, expect, it } from "vitest";
import { buildCommercialExecutionPreview } from "@/lib/commercial/execution/preview/buildPreview";
import { parseCommercialContext, parseFundingPlan, parseHorizon } from "@/lib/commercial/execution/preview/parsePreviewRequest";
import { validateCommercialExport } from "@/lib/commercial/execution/export";
import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";

/**
 * Phase 8 — Simulator as the first consumer of Commercial Execution. Golden/
 * snapshot equivalence over the pure preview builder + request parsers. No DB,
 * no writes, no financial truth.
 */

const exp: CommercialExport = {
    orgId: "org-1",
    version: { version: "v1", effectiveOn: "2026-09-01" },
    programs: [{ programKey: "toddler", label: "Toddler", isActive: true }],
    offerings: [{ id: "off-1", programKey: "toddler", label: "Full Day", attendanceType: "full_day", effective: { start: "2026-01-01", end: null }, isActive: true }],
    variants: [{ id: "var-1", offeringId: "off-1", label: "5 days/week", quantityType: "days", quantityValue: 5, isActive: true }],
    tuitionRates: [{ id: "rate-1", variantId: "var-1", cadenceKey: "monthly", payerType: "private_pay", locationId: null, rateCents: 180000, notOffered: false, effective: { start: "2026-01-01", end: null }, revenueCategoryId: "rev-1" }],
    products: [{ id: "prod-reg", commercialType: "fee", name: "Registration", scope: { programKey: "toddler", locationId: null }, amountCents: 15000, cadenceKey: null, revenueCategoryId: "rev-1", behavior: { required: true }, effective: { start: null, end: null }, isActive: true }],
    cadences: [{ cadenceKey: "monthly", label: "Monthly", isActive: true }],
    revenueCategories: [{ id: "rev-1", label: "Tuition Revenue", glAccountId: "gl-1", isActive: true }],
    policies: [],
};
const glIds = new Set(["gl-1"]);

const body = {
    program_key: "toddler",
    variant_id: "var-1",
    cadence_key: "monthly",
    payer_intent: "private_pay",
    as_of: "2026-09-01",
    period_start: "2026-09-01",
    mode: "hypothetical",
    subject_type: "prospect",
    subject_id: "pros-1",
    horizon: { start: "2026-09-01", end: "2026-11-30" },
};

function buildFromBody(over: Record<string, unknown> = {}) {
    const ctxR = parseCommercialContext({ ...body, ...over });
    if (!ctxR.ok) throw new Error(ctxR.error);
    const hR = parseHorizon({ ...body, ...over });
    if (!hR.ok) throw new Error(hR.error);
    const pR = parseFundingPlan({ ...body, ...over });
    if (!pR.ok) throw new Error(pR.error);
    const validation = validateCommercialExport(exp, glIds);
    return buildCommercialExecutionPreview(exp, validation, ctxR.value, { plan: pR.value ?? undefined, horizon: hR.value ?? undefined });
}

describe("request parsing", () => {
    it("requires program_key and as_of", () => {
        expect(parseCommercialContext({ as_of: "2026-09-01" }).ok).toBe(false);
        expect(parseCommercialContext({ program_key: "toddler" }).ok).toBe(false);
        expect(parseCommercialContext(body).ok).toBe(true);
    });
    it("validates the horizon", () => {
        expect(parseHorizon({ horizon: { start: "2026-11-01", end: "2026-09-01" } }).ok).toBe(false);
        expect(parseHorizon({}).ok).toBe(true); // absent is fine
    });
    it("parses a funding plan with allocations", () => {
        const r = parseFundingPlan({ funding_plan: { primary: { party_type: "household", source: "private_pay" }, allocations: [{ payer: { party_type: "agency", source: "government_subsidy" }, basis: "percentage", value: 70, target: "tuition" }] } });
        expect(r.ok).toBe(true);
        expect(r.ok && r.value?.allocations?.[0].value).toBe(70);
    });
});

describe("preview builder — content & deltas", () => {
    it("previews from Commercial Execution and creates no financial truth", () => {
        const p = buildFromBody();
        expect(p.mode).toBe("hypothetical");
        expect(p.resolution.status).toBe("resolved");
        expect(p.resolution.lines.find((l) => l.kind === "tuition")?.net.amountCents).toBe(180000);
        expect(p.schedule).not.toBeNull();
        // No billing vocabulary / financial truth keys anywhere in the preview.
        expect(JSON.stringify(p)).not.toMatch(/obligation|draft_charge|invoice|ledger|posted/i);
    });

    it("documents expected deltas in notes (policy + funding + pricing source)", () => {
        const notes = buildFromBody().notes.join(" ");
        expect(notes).toMatch(/no commercial_policies/i);
        expect(notes).toMatch(/no plan supplied/i);
        expect(notes).toMatch(/commercial_tuition_rates/i);
    });

    it("surfaces null-accounting as a warning when the revenue category is unmapped", () => {
        const noRev: CommercialExport = { ...exp, revenueCategories: [{ id: "rev-1", label: "Tuition Revenue", glAccountId: null, isActive: true }] };
        const ctxR = parseCommercialContext(body);
        const validation = validateCommercialExport(noRev, glIds);
        const p = buildCommercialExecutionPreview(noRev, validation, (ctxR as { value: import("@/lib/commercial/execution/executionTypes").CommercialContext }).value);
        expect(p.warnings.some((w) => w.code === "accounting_unmapped_gl_account")).toBe(true);
        expect(p.notes.join(" ")).toMatch(/null revenue category \/ GL account/i);
    });
});

describe("determinism / golden snapshot", () => {
    it("is deterministic across identical inputs", () => {
        const a = buildFromBody();
        const b = buildFromBody();
        expect(a.resolution.resolutionKey).toBe(b.resolution.resolutionKey);
        expect(a.schedule!.occurrences.map((o) => o.occurrenceKey)).toEqual(b.schedule!.occurrences.map((o) => o.occurrenceKey));
    });

    it("matches the golden schedule (dates + amounts + recognition)", () => {
        const p = buildFromBody();
        const golden = p.schedule!.occurrences.map((o) => ({ kind: o.kind, dueOn: o.dueOn, amount: o.amount.amountCents, recognition: o.recognition }));
        expect(golden).toEqual([
            { kind: "tuition", dueOn: "2026-09-01", amount: 180000, recognition: "deferred" },
            { kind: "tuition", dueOn: "2026-10-01", amount: 180000, recognition: "deferred" },
            { kind: "tuition", dueOn: "2026-11-01", amount: 180000, recognition: "deferred" },
            { kind: "fee", dueOn: "2026-09-01", amount: 15000, recognition: "immediate" },
        ]);
    });
});
