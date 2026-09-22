/**
 * THE OPERATOR PREVIEW MAY NOT OVERSTATE MUTATION.
 *
 * Measured on deployed staging: the preview offered "Generate 5 · $925.00" for five weekly periods
 * that already carried draft charges, and "Generate 1 · $1,450.00" for a month already POSTED.
 * Execution would have created nothing. An activation census built on that preview concluded
 * switching automatic billing on would bill $2,375.00 when the true figure was zero — a preview
 * that overstates mutation makes every safety decision downstream of it wrong in the dangerous
 * direction.
 *
 * These drive the real preview against real-shaped rows and assert the vocabulary it returns.
 */
import { describe, expect, it } from "vitest";

import { previewTuitionGeneration } from "@/lib/financials/tuitionGeneration/previewTuitionGeneration";

const ORG = "org-1";
const ASSIGNMENT = "ocm-1";
const AGREEMENT = "agr-1";

function client(opts: { terms: Record<string, unknown>[]; charges: Record<string, unknown>[] }) {
    const rowsFor = (t: string) =>
        t === "enrollment_pricing_terms" ? opts.terms : t === "charges" ? opts.charges : [];
    return {
        from: (table: string) => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self; chain.eq = self; chain.is = self; chain.in = self; chain.order = self;
            chain.then = (r: (v: unknown) => unknown) => r({ data: rowsFor(table), error: null });
            return chain;
        },
    } as never;
}

const term = (over: Record<string, unknown> = {}) => ({
    id: "term-1", org_id: ORG,
    opportunity_customer_member_id: ASSIGNMENT, customer_member_id: "cm-1",
    enrollment_agreement_id: AGREEMENT, term_kind: "tuition",
    amount_cents: 145_000, currency_code: "USD", cadence_key: "monthly",
    effective_start: "2026-09-01", effective_end: null,
    source_entity: "rate_plan", source_id: "rp-1", variant_id: null, offering_id: null,
    program_key: null, location_id: null, payer_type: "family", state: "accepted",
    override_reason: null, recommended_source_id: null, config_version: null,
    resolution_key: "rk-1", accepted_by: null, accepted_at: "2026-09-01T00:00:00Z",
    superseded_at: null, ...over,
});

const charge = (serviceDate: string, status: string, cents = 145_000) => ({
    id: `chg-${serviceDate}-${status}`, billable_source_id: AGREEMENT,
    service_date: serviceDate, status, amount_cents: cents,
});

const preview = (charges: Record<string, unknown>[], cadence = "monthly") =>
    previewTuitionGeneration(client({ terms: [term(cadence === "monthly" ? {} : { cadence_key: cadence, amount_cents: 18_500 })], charges }),
        { orgId: ORG, periodKey: "2026-09", cadenceKey: cadence });

describe("preview tells the economic truth about what a run would do", () => {
    it("an unbilled period is offered as work", async () => {
        const r = await preview([]);
        expect(r.counts.generated).toBe(1);
        expect(r.counts.unchanged).toBe(0);
        expect(r.counts.alreadyPosted).toBe(0);
    });

    it("a period that already carries a DRAFT is unchanged, not generated", async () => {
        const r = await preview([charge("2026-09-01", "draft")]);
        expect(r.counts.generated, "no work would be created").toBe(0);
        expect(r.counts.unchanged).toBe(1);
        const o = r.outcomes.find((x) => x.kind === "unchanged");
        expect(o && "chargeId" in o ? o.chargeId : null, "and it names the charge that already stands")
            .toBe("chg-2026-09-01-draft");
    });

    it("a period already POSTED is already_posted, not generated", async () => {
        const r = await preview([charge("2026-09-01", "posted")]);
        expect(r.counts.generated).toBe(0);
        expect(r.counts.alreadyPosted).toBe(1);
        expect(r.counts.unchanged).toBe(0);
    });

    it("posted beats a stray draft for the same period", async () => {
        const r = await preview([charge("2026-09-01", "draft"), charge("2026-09-01", "posted")]);
        expect(r.counts.alreadyPosted).toBe(1);
        expect(r.counts.generated).toBe(0);
    });

    it("the deployed weekly case: five drafts means five unchanged, not five generated", async () => {
        /* The exact shape measured on staging for Certa Certhouse. */
        const drafts = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]
            .map((d) => charge(d, "draft", 18_500));
        const r = await preview(drafts, "weekly");
        expect(r.counts.generated, "this is the figure that said $925.00 would be billed").toBe(0);
        expect(r.counts.unchanged).toBe(5);
    });

    it("counts are derived from the outcomes, so a new kind cannot be miscounted", async () => {
        const r = await preview([charge("2026-09-01", "draft")]);
        const total = r.counts.generated + r.counts.unchanged + r.counts.alreadyPosted
            + r.counts.notDue + r.counts.refused + r.counts.errors;
        expect(total).toBe(r.outcomes.length);
    });

    it("preview and the outstanding-period reader share one convergence authority", () => {
        // Not two readings of "already billed" that agree today and drift tomorrow.
        const src = (rel: string) => require("node:fs").readFileSync(`${process.cwd()}/${rel}`, "utf8") as string;
        for (const f of [
            "lib/financials/tuitionGeneration/previewTuitionGeneration.ts",
            "lib/financials/periodicBilling/readOutstandingBillingPeriods.ts",
        ]) {
            expect(src(f), `${f} must read convergence from the shared module`)
                .toContain("readTuitionChargeConvergence");
        }
    });
});
