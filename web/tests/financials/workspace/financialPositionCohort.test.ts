/**
 * THE CROSS-HOUSEHOLD POSITION — what it refuses to show, and what it refuses to invent.
 *
 * The cohort projection is the only thing in the platform that TOTALS money across households, so
 * the two properties that matter are the two tested here: it never widens what an operator may
 * see, and it never computes a figure of its own — every number comes from
 * `computeCollectiblePosition`, the same arithmetic the account card renders.
 */
import { describe, expect, it } from "vitest";

import { resolveFinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import { computeCollectiblePosition } from "@/lib/financials/subsidy/collectiblePosition";

const ORG = "org-1";
const SITE_A = "site-a";
const SITE_B = "site-b";

type Row = Record<string, unknown>;
type Tables = Partial<Record<string, Row[]>>;

function fakeSupabase(tables: Tables) {
    function builder(table: string) {
        const eq: Record<string, unknown> = {};
        const isNull: string[] = [];
        const inSets: Array<[string, unknown[]]> = [];
        const gte: Record<string, string> = {};
        const lte: Record<string, string> = {};
        let limit: number | null = null;
        let range: { from: number; to: number } | null = null;

        const rows = () => {
            let out = [...(tables[table] ?? [])];
            for (const [col, val] of Object.entries(eq)) out = out.filter((r) => r[col] === val);
            for (const col of isNull) out = out.filter((r) => r[col] == null);
            for (const [col, values] of inSets) out = out.filter((r) => values.includes(r[col]));
            for (const [col, val] of Object.entries(gte)) out = out.filter((r) => String(r[col]) >= val);
            for (const [col, val] of Object.entries(lte)) out = out.filter((r) => String(r[col]) <= val);
            if (limit !== null) out = out.slice(0, limit);
            /*
             * RANGE IS INCLUSIVE AT BOTH ENDS, like PostgREST's. Applied after the filters and the
             * limit, because that is the order the server applies them in — a double that paged
             * before filtering would let a paged read pass while the real one skipped rows.
             */
            if (range !== null) out = out.slice(range.from, range.to + 1);
            return out;
        };

        const api = {
            select: () => api,
            order: () => api,
            eq(col: string, val: unknown) {
                eq[col] = val;
                return api;
            },
            is(col: string, val: unknown) {
                if (val === null) isNull.push(col);
                return api;
            },
            in(col: string, values: unknown[]) {
                inSets.push([col, values]);
                return api;
            },
            gte(col: string, val: string) {
                gte[col] = val;
                return api;
            },
            lte(col: string, val: string) {
                lte[col] = val;
                return api;
            },
            limit(n: number) {
                limit = n;
                return api;
            },
            /*
             * THE COHORT PAGES ITS CHARGE READ. PostgREST caps a response at `db-max-rows` — 1,000
             * here — whatever `limit()` asked for, and answers no error, so the cohort requests
             * successive ranges instead of trusting one limit. A double without `range` made every
             * case in this file fail on a missing function rather than on anything it asserts.
             */
            range(from: number, to: number) {
                range = { from, to };
                return api;
            },
            then(resolve: (v: unknown) => unknown) {
                return Promise.resolve({ data: rows(), error: null }).then(resolve);
            },
        };
        return api;
    }
    return { from: (table: string) => builder(table) } as never;
}

const charge = (over: Row = {}): Row => ({
    id: "charge-a",
    org_id: ORG,
    billable_source_type: "enrollment_agreement",
    billable_source_id: "agreement-a",
    amount_cents: 100_000,
    currency_code: "USD",
    status: "posted",
    service_date: "2026-09-01",
    posted_at: "2026-09-01T00:00:00.000Z",
    ...over,
});

const BASE_TABLES: Tables = {
    charges: [
        charge(),
        charge({ id: "charge-b", billable_source_id: "agreement-b", amount_cents: 50_000 }),
        // A household fee: no agreement, therefore no site.
        charge({ id: "charge-c", billable_source_type: "customer", billable_source_id: "customer-c", amount_cents: 20_000 }),
        // The job vertical is not childcare financial work.
        charge({ id: "charge-job", billable_source_type: "job", billable_source_id: "job-1", amount_cents: 999_000 }),
        // An enrolment whose agreement names no site: withheld, never widened to the org.
        charge({ id: "charge-orphan", billable_source_id: "agreement-nosite", amount_cents: 777_000 }),
    ],
    child_enrollment_agreements: [
        { id: "agreement-a", org_id: ORG, customer_id: "customer-a", site_location_id: SITE_A },
        { id: "agreement-b", org_id: ORG, customer_id: "customer-b", site_location_id: SITE_B },
        { id: "agreement-nosite", org_id: ORG, customer_id: "customer-d", site_location_id: null },
    ],
    customers: [
        { id: "customer-a", org_id: "org-1", name: "Alvarez" },
        { id: "customer-b", org_id: "org-1", name: "Bell" },
        { id: "customer-c", org_id: "org-1", name: "Chen" },
    ],
    financial_reduction_applications: [],
    payment_allocations: [],
    payments: [],
    financial_responsibility_allocations: [],
    financial_expected_funding: [],
    financial_subsidy_claim_lines: [],
    financial_subsidy_claims: [],
    financial_subsidy_variances: [],
};

const orgWide = { orgId: ORG, siteScope: "all" as const, allowedSiteLocationIds: [] };

describe("resolveFinancialPositionCohort — location", () => {
    it("shows an org-wide operator every childcare charge it can place, and no job charge", async () => {
        const cohort = await resolveFinancialPositionCohort(fakeSupabase(BASE_TABLES), orgWide);
        expect(cohort.rows.map((r) => r.position.chargeId).sort()).toEqual(["charge-a", "charge-b", "charge-c"]);
        // Households are named, so an accounts list reads as families rather than ids.
        expect(cohort.rows.find((r) => r.position.chargeId === "charge-a")!.householdName).toBe("Alvarez");
        // 100k + 50k + 20k. The job charge's 999k and the unplaceable 777k are not in it.
        expect(cohort.totals.outstandingCents).toBe(170_000);
    });

    it("withholds an enrolment charge whose agreement names no site rather than widening it", async () => {
        const cohort = await resolveFinancialPositionCohort(fakeSupabase(BASE_TABLES), orgWide);
        expect(cohort.rows.some((r) => r.position.chargeId === "charge-orphan")).toBe(false);
    });

    it("narrows to the selected site, and account-wide fees do not appear under a site heading", async () => {
        const cohort = await resolveFinancialPositionCohort(fakeSupabase(BASE_TABLES), {
            ...orgWide,
            activeSiteLocationId: SITE_A,
        });
        expect(cohort.rows.map((r) => r.position.chargeId)).toEqual(["charge-a"]);
        expect(cohort.totals.outstandingCents).toBe(100_000);
    });

    it("refuses a restricted operator another site's money, and the org-scoped fee as well", async () => {
        // A charge belonging to no site is not inside the sites this operator holds.
        const cohort = await resolveFinancialPositionCohort(fakeSupabase(BASE_TABLES), {
            orgId: ORG,
            siteScope: "restricted",
            allowedSiteLocationIds: [SITE_B],
        });
        expect(cohort.rows.map((r) => r.position.chargeId)).toEqual(["charge-b"]);
        expect(cohort.totals.outstandingCents).toBe(50_000);
    });

    it("a site filter can only narrow — asking for a site the operator does not hold returns nothing", async () => {
        const cohort = await resolveFinancialPositionCohort(fakeSupabase(BASE_TABLES), {
            orgId: ORG,
            siteScope: "restricted",
            allowedSiteLocationIds: [SITE_B],
            activeSiteLocationId: SITE_A,
        });
        expect(cohort.rows).toEqual([]);
        expect(cohort.totals.outstandingCents).toBe(0);
    });
});

describe("resolveFinancialPositionCohort — the totals are the canonical arithmetic, summed", () => {
    const TABLES: Tables = {
        ...BASE_TABLES,
        charges: [charge()],
        financial_reduction_applications: [
            { org_id: ORG, source_charge_id: "charge-a", amount_cents: -20_000 },
        ],
        payment_allocations: [
            { org_id: ORG, charge_id: "charge-a", allocated_amount_cents: 30_000, status: "active", payment_id: "pay-1" },
            // Reversed, and on a pending payment: neither settles anything.
            { org_id: ORG, charge_id: "charge-a", allocated_amount_cents: 10_000, status: "reversed", payment_id: "pay-1" },
            { org_id: ORG, charge_id: "charge-a", allocated_amount_cents: 5_000, status: "active", payment_id: "pay-pending" },
        ],
        payments: [
            { id: "pay-1", org_id: ORG, status: "posted", payer_entity_type: "agency" },
            { id: "pay-pending", org_id: ORG, status: "pending", payer_entity_type: "person" },
        ],
        financial_responsibility_allocations: [
            { id: "alloc-1", org_id: ORG, charge_id: "charge-a", assigned_amount_cents: 80_000, is_unassigned: false, share_id: "share-1", state: "active" },
            { id: "alloc-2", org_id: ORG, charge_id: "charge-a", assigned_amount_cents: 0, is_unassigned: true, share_id: "share-1", state: "active" },
        ],
        financial_expected_funding: [
            { org_id: ORG, state: "active", allocation_id: null, share_id: "share-1", basis: "fixed_amount", expected_amount_cents: 40_000, percent_basis_points: null },
        ],
        financial_subsidy_claim_lines: [
            { id: "line-1", org_id: ORG, charge_id: "charge-a", claim_id: "claim-1", claimed_amount_cents: 40_000 },
        ],
        financial_subsidy_claims: [{ id: "claim-1", org_id: ORG, state: "submitted" }],
        financial_subsidy_variances: [
            { org_id: ORG, claim_line_id: "line-1", variance_cents: -7_500, state: "open", resolution_kind: null },
        ],
    };

    it("agrees, figure for figure, with computeCollectiblePosition on the same facts", async () => {
        const cohort = await resolveFinancialPositionCohort(fakeSupabase(TABLES), orgWide);
        expect(cohort.rows).toHaveLength(1);

        /*
         * THE POINT OF THIS ASSERTION. The expected value is not a hand-computed number — it is
         * the canonical function called directly on the same facts. If the batched reading ever
         * feeds it something different from what the per-charge reading would, this fails, which
         * is the only durable guarantee that a workspace total and an account card agree.
         */
        const expected = computeCollectiblePosition({
            chargeId: "charge-a",
            currencyCode: "USD",
            chargeStatus: "posted",
            grossCents: 100_000,
            reductionsCents: -20_000,
            netCents: 80_000,
            applications: [
                { allocatedAmountCents: 30_000, status: "active", paymentStatus: "posted", payerEntityType: "agency" },
                { allocatedAmountCents: 10_000, status: "reversed", paymentStatus: "posted", payerEntityType: "agency" },
                { allocatedAmountCents: 5_000, status: "active", paymentStatus: "pending", payerEntityType: "person" },
            ],
            allocations: [
                { assignedAmountCents: 80_000, isUnassigned: false },
                { assignedAmountCents: 0, isUnassigned: true },
            ],
            expectedFunding: [{ basis: "fixed_amount", expectedAmountCents: 40_000, percentBasisPoints: null }],
            claimLines: [{ claimId: "claim-1", claimedAmountCents: 40_000, claimState: "submitted" }],
            variances: [{ varianceCents: -7_500, state: "open", resolutionKind: null }],
        });

        expect(cohort.rows[0]!.position).toEqual(expected);
        expect(cohort.totals.outstandingCents).toBe(expected.outstandingCents);
        expect(cohort.totals.currentlyCollectibleCents).toBe(expected.currentlyCollectibleCents);
        expect(cohort.totals.unresolvedVarianceCents).toBe(expected.unresolvedVarianceCents);
        expect(cohort.totals.grossChargesCents).toBe(100_000);
        expect(cohort.totals.netChargesCents).toBe(80_000);
    });

    it("counts share-anchored funding ONCE per charge, not once per party", async () => {
        // Two allocations hang off one share. Fanning out per allocation would double the
        // expected subsidy for exactly the families that have two payers.
        const cohort = await resolveFinancialPositionCohort(fakeSupabase(TABLES), orgWide);
        expect(cohort.totals.expectedSubsidyCents).toBe(40_000);
    });
});
