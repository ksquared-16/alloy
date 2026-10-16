/**
 * W7-F022 — TUITION GENERATION PREVIEW AND EXECUTE AGREE.
 *
 * Measured on staging: Preview said "Generate 2 · $2,650.00"; Execute answered "0 newly generated …
 * 2 refused" with no reasons. Census: both occurrences resolved an obligation `no_charge` with
 * `no_charge_reason: template_retired` — the org's `tuition` template had been versioned (old row closed
 * 2026-10-07, successor from 2026-10-08) and Operational Consumption took the FIRST active row with the
 * key, the retired one. Preview never asked the template authority at all.
 *
 * Repairs: the version in effect is chosen; preview runs the SAME consumption resolution on the SAME
 * fact and refuses with the SAME reason; execute reports that reason per row; the run result names
 * every row; the scheduler records what it actually wrote.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { chooseTemplateVersion } from "@/lib/operationalConsumption/consumptionService";
import { draftReadinessOf } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const tpl = (over: Record<string, unknown>) =>
    ({ id: "x", template_key: "tuition", is_active: true, effective_start: "2026-01-01", effective_end: null, ...over }) as never;

describe("the template version in effect is the one consumption resolves", () => {
    /* Exactly staging's rows, in staging's order: the retired version first. */
    const staging = [
        tpl({ id: "9a4d0578", effective_start: "2026-01-01", effective_end: "2026-10-07" }),
        tpl({ id: "52400d60", effective_start: "2026-10-08", effective_end: null }),
    ];

    it("picks the successor, not the first row with the key", () => {
        expect((chooseTemplateVersion(staging, "tuition", "2026-10-16") as { id: string }).id).toBe("52400d60");
        expect((chooseTemplateVersion([...staging].reverse(), "tuition", "2026-10-16") as { id: string }).id).toBe("52400d60");
    });

    it("picks the version in effect on the evaluation date, also before a change", () => {
        expect((chooseTemplateVersion(staging, "tuition", "2026-10-01") as { id: string }).id).toBe("9a4d0578");
    });

    it("with none in effect, returns the newest so eligibility states the honest reason; inactive rows never count", () => {
        const onlyRetired = [tpl({ id: "old", effective_end: "2026-09-30" })];
        expect((chooseTemplateVersion(onlyRetired, "tuition", "2026-10-16") as { id: string }).id).toBe("old");
        expect(chooseTemplateVersion([tpl({ is_active: false })], "tuition", "2026-10-16")).toBeNull();
        expect(chooseTemplateVersion(staging, "late_pickup", "2026-10-16")).toBeNull();
    });

    it("both consumption call sites pass the evaluation date", () => {
        const svc = code("lib/operationalConsumption/consumptionService.ts");
        expect(svc).toMatch(/loadTemplateByKey\(supabase, orgId, eventType\.charge_template_key, today\)/);
        expect(svc).toMatch(/loadTemplateByKey\(supabase, orgId, dEventType\?\.charge_template_key \?\? null, ctx\.today\)/);
        expect(svc).not.toMatch(/templates\.find\(\(t\) => t\.template_key === templateKey && t\.is_active !== false\)/);
    });
});

describe("one readiness rule, read by preview and execute", () => {
    const obligation = (over: Record<string, unknown>) => ({
        obligations: [{ draftable: true, chargeTemplateId: "t", amountCents: 120000, status: "pending_review", explanation: {}, ...over }],
    });

    it("a resolved, draftable obligation with an amount will draft", () => {
        expect(draftReadinessOf(obligation({}))).toEqual({ ok: true });
    });

    it("staging's obligation — no_charge, template_retired — is refused with that reason, in words", () => {
        const r = draftReadinessOf(obligation({ status: "no_charge", draftable: true, chargeTemplateId: null, amountCents: null, explanation: { no_charge_reason: "template_retired" } }));
        expect(r).toMatchObject({ ok: false, reason: "template_retired" });
        expect((r as { detail: string }).detail).toMatch(/retired/);
    });

    it("no template at all is configuration_required; no amount is amount_not_resolvable", () => {
        expect(draftReadinessOf(obligation({ chargeTemplateId: null }))).toMatchObject({ ok: false, reason: "configuration_required" });
        expect(draftReadinessOf(obligation({ amountCents: null }))).toMatchObject({ ok: false, reason: "amount_not_resolvable" });
        expect(draftReadinessOf({ obligations: [] })).toMatchObject({ ok: false, reason: "no_obligation" });
    });

    it("execute reports the resolution's own reason, not a placeholder", () => {
        const gen = code("lib/financials/tuitionGeneration/generateTuitionCharges.ts");
        expect(gen).toMatch(/const readiness = draftReadinessOf\(drafted\.resolution\);/);
        expect(gen).not.toMatch(/reason: "configuration_required",\s*detail:\s*`No draft tuition charge was produced/);
        expect(gen).toMatch(/const fact = buildTuitionFact\(\{ assignmentId, decision, agreementId: term\.enrollmentAgreementId, period, periodKey: periodKeyOf \}\);/);
    });

    it("preview runs the SAME consumption resolution on the SAME fact before it says Will bill", () => {
        const preview = code("lib/financials/tuitionGeneration/previewTuitionGeneration.ts");
        expect(preview).toMatch(/await previewConsumption\(\s*supabase,\s*args\.orgId,\s*buildTuitionFact\(\{ assignmentId, decision: d, agreementId: d\.term\.enrollmentAgreementId, period, periodKey: periodKeyOf \}\),\s*today,\s*\)/);
        expect(preview).toMatch(/const readiness = draftReadinessOf\(consumption\.resolution\);\s*if \(!readiness\.ok\) \{\s*outcomes\.push\(\{ kind: "refused"/);
        const action = code("lib/adminV2/actions/definitions/tuitionGenerationActions.ts");
        expect(action).toMatch(/today: t\(payload\?\.today\) \|\| null,/);
    });
});

describe("a money-moving batch names every row it decided", () => {
    it("execute returns every outcome with the assignments' names", () => {
        const action = code("lib/adminV2/actions/definitions/tuitionGenerationActions.ts");
        for (const key of ["generated_outcomes", "unchanged_outcomes", "already_posted_outcomes", "not_due_outcomes", "refused_outcomes", "error_outcomes"]) {
            expect(action, key).toContain(key);
        }
        expect(action.match(/assignment_names: await nameAssignments\(/g)?.length).toBe(2);
    });

    it("the result panel shows Generated, Already generated, Not billed, Refused and Errored, named, with reasons", () => {
        const ui = code("app/adminV2/financials/sections/FinancialsTuitionBilling.tsx");
        for (const title of ['title: "Generated"', 'title: "Already generated"', 'title: "Not billed"', 'title: "Refused"', 'title: "Errored"']) {
            expect(ui, title).toContain(title);
        }
        expect(ui).toMatch(/o\.detail \?\? o\.message \?\? o\.reason \?\? "no reason recorded"/);
        expect(ui).toContain("data-financials-tuition-changed-since-preview");
    });
});

describe("the scheduler says what it wrote, not only what it processed", () => {
    it("records generated and refused charges, and the panel reads them", () => {
        expect(code("lib/financials/periodicBilling/periodicBillingHandler.ts")).toMatch(/charges_generated: evaluation\.outcomes\.reduce/);
        expect(code("lib/financials/periodicBilling/evaluatePeriodicBilling.ts")).toMatch(/const refusedCount = results\.reduce\(\(n, r\) => n \+ r\.counts\.refused \+ r\.counts\.errors, 0\);/);
        expect(code("app/api/admin/financials/periodic-billing-status/route.ts")).toContain("charges_generated");
        expect(code("app/adminV2/financials/sections/FinancialsTuitionBilling.tsx")).toMatch(/charges generated|charge\$\{last\.charges_generated === 1/);
    });

    it("automatic billing still calls the one generation authority", () => {
        expect(code("lib/financials/periodicBilling/evaluatePeriodicBilling.ts")).toMatch(/import \{ generateTuitionCharges, type TuitionGenerationResult \}/);
    });
});
