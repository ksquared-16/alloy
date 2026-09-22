/**
 * THE AUTHORITY'S OWN PERIOD FILTER, exercised rather than assumed.
 *
 * A sibling lock asserts that the periodic-billing handler PASSES its due period keys. That lock
 * is satisfied by a recording fake, so it says nothing about whether `generateTuitionCharges`
 * honours them — and a planted defect that ignored the filter entirely passed it cleanly. This
 * drives the real function.
 *
 * The span deliberately contains two weekly periods and the filter names one. The named period
 * already carries a POSTED charge, so generation answers from it and never enters the write
 * pipeline; the unnamed period must produce NO outcome at all. If the filter were ignored, the
 * second period would reach the pipeline this fake cannot serve and the outcome set would differ.
 */
import { describe, expect, it } from "vitest";

import { generateTuitionCharges } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";

const ORG = "org-1";
const ASSIGNMENT = "ocm-1";
const AGREEMENT = "agr-1";

function client(charges: Array<Record<string, unknown>>) {
    const terms = [{
        id: "term-1", org_id: ORG,
        opportunity_customer_member_id: ASSIGNMENT, customer_member_id: "cm-1",
        enrollment_agreement_id: AGREEMENT, term_kind: "tuition",
        amount_cents: 19_500, currency_code: "USD", cadence_key: "weekly",
        effective_start: "2026-09-22", effective_end: null,
        source_entity: "commercial_tuition_rates", source_id: "rate-1",
        variant_id: null, offering_id: null, program_key: "school_age", location_id: null,
        payer_type: "private_pay", state: "accepted", override_reason: null,
        recommended_source_id: null, config_version: "v1", resolution_key: "rk",
        accepted_by: null, accepted_at: "2026-09-22T00:00:00Z", superseded_at: null,
    }];
    const rowsFor = (t: string) =>
        t === "enrollment_pricing_terms" ? terms
        : t === "charges" ? charges
        : [];
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

/* Posted on the first weekly period, so that period is answered without writing. */
const posted = [{
    id: "chg-posted", billable_source_id: AGREEMENT, service_date: "2026-09-22",
    status: "posted", amount_cents: 19_500,
}];

describe("generateTuitionCharges honours periodKeys", () => {
    it("bills only the named period, leaving the rest of the span alone", async () => {
        const r = await generateTuitionCharges(client(posted), {
            orgId: ORG, periodKey: "2026-09", cadenceKey: "weekly",
            opportunityCustomerMemberIds: [ASSIGNMENT],
            periodKeys: ["2026-09-22~2026-09-28"],
            today: "2026-09-22",
        });
        const keys = r.outcomes.map((o) => o.periodKey);
        expect(keys, "only the named period produced an outcome").toEqual(["2026-09-22~2026-09-28"]);
        expect(keys, "the unbegun week in the same span was not touched")
            .not.toContain("2026-09-29~2026-10-05");
        expect(r.counts.alreadyPosted).toBe(1);
        expect(r.counts.generated).toBe(0);
    });

    it("without a filter the whole span is in scope — an operator asking for September means September", async () => {
        const r = await generateTuitionCharges(client(posted), {
            orgId: ORG, periodKey: "2026-09", cadenceKey: "weekly",
            opportunityCustomerMemberIds: [ASSIGNMENT],
            today: "2026-09-22",
        });
        const keys = r.outcomes.map((o) => o.periodKey);
        expect(keys.length, "more than the one named period").toBeGreaterThan(1);
        expect(keys).toContain("2026-09-22~2026-09-28");
        expect(keys).toContain("2026-09-29~2026-10-05");
    });

    it("an empty filter is treated as no filter, never as 'bill nothing'", async () => {
        const r = await generateTuitionCharges(client(posted), {
            orgId: ORG, periodKey: "2026-09", cadenceKey: "weekly",
            opportunityCustomerMemberIds: [ASSIGNMENT], periodKeys: [],
            today: "2026-09-22",
        });
        expect(r.outcomes.length).toBeGreaterThan(1);
    });
});
