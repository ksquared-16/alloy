/**
 * BP V2 D4 — `financialReadScope` decisions a real database cannot produce on demand. The live suite
 * (`tests/financials/live/financialDetailSiteScope.live.test.ts`) proves the routes on real records.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    financialItemReadable,
    financialReadScopeFromAccess,
    financialSourceReadable,
    householdFinancialsReadable,
} from "@/lib/financials/workspace/financialReadScope";

const ORG = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const RESTRICTED_A = { siteScope: "restricted" as const, allowedSiteLocationIds: [A] };
const ALL = { siteScope: "all" as const, allowedSiteLocationIds: [] };

type Tables = Record<string, Array<Record<string, unknown>>>;
/** A tiny PostgREST fake: eq/in/limit filters over in-memory rows; counts every read. */
function fake(tables: Tables, opts: { failTable?: string } = {}) {
    let reads = 0;
    const client = {
        from(table: string) {
            const filters: Array<(r: Record<string, unknown>) => boolean> = [];
            let lim = Infinity;
            const run = () => {
                reads++;
                if (opts.failTable === table) return { data: null, error: { message: "permission denied" } };
                return { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, lim), error: null };
            };
            const q: Record<string, unknown> = {
                select: () => q,
                eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
                in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
                limit: (n: number) => ((lim = n), q),
                maybeSingle: async () => {
                    const r = run();
                    return { data: r.data ? (r.data[0] ?? null) : null, error: r.error };
                },
                then: (res: (v: unknown) => unknown) => res(run()),
            };
            return q;
        },
    };
    return { client: client as unknown as SupabaseClient, reads: () => reads };
}

const agreementAt = (id: string, site: string, customer = "hh1") => ({ id, org_id: ORG, site_location_id: site, customer_id: customer });

describe("D4 — scope comes from the actor's access, and an unknown mode never widens", () => {
    it("maps access to scope", () => {
        expect(financialReadScopeFromAccess({ siteScope: "all", allowedSiteLocationIds: null })).toEqual(ALL);
        expect(financialReadScopeFromAccess({ siteScope: "restricted", allowedSiteLocationIds: [A] })).toEqual(RESTRICTED_A);
        expect(financialReadScopeFromAccess({ siteScope: "unexpected", allowedSiteLocationIds: null })).toEqual({ siteScope: "restricted", allowedSiteLocationIds: [] });
    });

    it("an unrestricted actor is answered without a single read", async () => {
        const f = fake({});
        expect(await financialItemReadable(f.client, { orgId: ORG, scope: ALL, table: "charges", id: "c1" })).toBe("readable");
        expect(await householdFinancialsReadable(f.client, { orgId: ORG, scope: ALL, customerId: "hh1" })).toBe("readable");
        expect(f.reads()).toBe(0);
    });
});

describe("D4 — one item: located by its billable source, exactly as the lists locate it", () => {
    const tables: Tables = {
        charges: [
            { id: "atA", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "agA" },
            { id: "atB", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "agB" },
            { id: "household", org_id: ORG, billable_source_type: "customer", billable_source_id: "hh1" },
            { id: "job", org_id: ORG, billable_source_type: "job", billable_source_id: "j1" },
            { id: "nosource", org_id: ORG, billable_source_type: null, billable_source_id: null },
            { id: "brokenAgreement", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "agNoSite" },
        ],
        child_enrollment_agreements: [agreementAt("agA", A), agreementAt("agB", B), { id: "agNoSite", org_id: ORG, site_location_id: null }],
    };
    it.each([
        ["atA", "readable"],
        ["atB", "out_of_scope"],
        ["household", "out_of_scope"],
        ["job", "not_governed"],
        ["nosource", "out_of_scope"],
        ["brokenAgreement", "out_of_scope"],
        ["unknown", "missing"],
    ])("charge %s → %s for an actor restricted to site A", async (id, verdict) => {
        expect(await financialItemReadable(fake(tables).client, { orgId: ORG, scope: RESTRICTED_A, table: "charges", id })).toBe(verdict);
    });

    it("a read failure fails closed (never readable)", async () => {
        const f = fake(tables, { failTable: "charges" });
        expect(await financialItemReadable(f.client, { orgId: ORG, scope: RESTRICTED_A, table: "charges", id: "atA" })).toBe("out_of_scope");
    });

    it("a ledger-style row already in hand is decided from its own source columns", async () => {
        const f = fake(tables);
        expect(await financialSourceReadable(f.client, { orgId: ORG, scope: RESTRICTED_A, source: { billable_source_type: "enrollment_agreement", billable_source_id: "agA" } })).toBe("readable");
        expect(await financialSourceReadable(f.client, { orgId: ORG, scope: RESTRICTED_A, source: { billable_source_type: "customer", billable_source_id: "hh1" } })).toBe("out_of_scope");
    });
});

describe("D4 — one household's presentation: every location its money occupies must be visible", () => {
    const base = (extra: Partial<Tables> = {}): Tables => ({
        customers: [{ id: "hh1", org_id: ORG }, { id: "hh2", org_id: ORG }],
        customer_members: [{ id: "kid1", org_id: ORG, customer_id: "hh1" }, { id: "kid2", org_id: ORG, customer_id: "hh2" }],
        opportunity_customer_members: [{ id: "ocm1", org_id: ORG, customer_member_id: "kid1" }],
        child_enrollment_agreements: [agreementAt("agA", A, "hh1")],
        charges: [],
        payments: [],
        ...extra,
    });

    it("all money at the actor's site → readable (by household, child, or opportunity child)", async () => {
        const c = fake(base()).client;
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, customerId: "hh1" })).toBe("readable");
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, customerMemberId: "kid1" })).toBe("readable");
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, opportunityCustomerMemberId: "ocm1" })).toBe("readable");
    });

    it("an agreement at another site → refused as a whole (a total would include it)", async () => {
        const c = fake(base({ child_enrollment_agreements: [agreementAt("agA", A, "hh1"), agreementAt("agB", B, "hh1")] })).client;
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, customerId: "hh1" })).toBe("out_of_scope");
    });

    it.each([
        ["a household-sourced charge", { charges: [{ id: "f", org_id: ORG, billable_source_type: "customer", billable_source_id: "hh1" }] }],
        ["a household-sourced payment", { payments: [{ id: "p", org_id: ORG, billable_source_type: "customer", billable_source_id: "hh1" }] }],
    ])("%s (org-scoped money) → refused to a restricted actor", async (_l, extra) => {
        expect(await householdFinancialsReadable(fake(base(extra)).client, { orgId: ORG, scope: RESTRICTED_A, customerId: "hh1" })).toBe("out_of_scope");
    });

    it("a household with no location at all is inside no site", async () => {
        const c = fake(base({ child_enrollment_agreements: [] })).client;
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, customerId: "hh1" })).toBe("out_of_scope");
    });

    it("forged or foreign keys cannot widen: mismatched child, unknown household, unknown child", async () => {
        const c = fake(base()).client;
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, customerId: "hh1", customerMemberId: "kid2" })).toBe("missing");
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, customerId: "nope" })).toBe("missing");
        expect(await householdFinancialsReadable(c, { orgId: ORG, scope: RESTRICTED_A, customerMemberId: "nope" })).toBe("missing");
    });

    it("a read failure on any location source fails closed", async () => {
        for (const t of ["child_enrollment_agreements", "charges", "payments"]) {
            expect(await householdFinancialsReadable(fake(base(), { failTable: t }).client, { orgId: ORG, scope: RESTRICTED_A, customerId: "hh1" }), t).toBe("out_of_scope");
        }
    });
});
