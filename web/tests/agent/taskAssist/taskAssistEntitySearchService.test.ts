import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runTaskAssistEntitySearch } from "@/lib/agent/taskAssist/taskAssistEntitySearchService";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const CUST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPP_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSON_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTACT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const openDim = {
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
};

let activeScope: { locationIds: string[] | null } = { locationIds: null };

vi.mock("@/lib/admin/accessScope", () => ({
    accessScopeRestrictsData: () => false,
    recordReadableWithoutDeptSiteLinkage: () => true,
    resolveRecordScopeConstraints: vi.fn(async () => ({
        workUnitIds: null,
        locationIds: null,
        impossible: false,
    })),
    applyRecordScopeConstraintsToQuery: vi.fn((q: unknown, c: { locationIds?: string[] | null }) => {
        activeScope = { locationIds: c.locationIds ?? null };
        return q;
    }),
}));

vi.mock("@/lib/admin/resolveQueueRecordScopeConstraints", () => ({
    resolveQueueRecordScopeConstraints: vi.fn(async (_s, _o, _d, siteId: string | null) => {
        if (siteId === "north-site") {
            return {
                recordScopeImpossible: false,
                recordScopeConstraints: {
                    workUnitIds: null,
                    locationIds: ["loc-north"],
                    impossible: false,
                },
            };
        }
        return {
            recordScopeImpossible: false,
            recordScopeConstraints: { workUnitIds: null, locationIds: null, impossible: false },
        };
    }),
}));

type Row = Record<string, unknown>;

function patternToken(pattern: string): string {
    return pattern.replace(/^%/, "").replace(/%$/, "").toLowerCase();
}

function rowMatchesIlike(row: Row, col: string, pattern: string): boolean {
    const token = patternToken(pattern);
    const val = String(row[col] ?? "").toLowerCase();
    return val.includes(token);
}

function createSearchSupabase(orgId: string, tables: Record<string, Row[]>) {
    const chain = (tableName: string): Record<string, unknown> => {
        let filters: Array<{ kind: string; col: string; val: unknown }> = [];
        let orExpr: string | null = null;
        let limitN = 20;

        const exec = (): { data: Row[]; error: null } => {
            let rows = (tables[tableName] ?? []).filter((r) => String(r.org_id ?? orgId) === orgId);
            for (const f of filters) {
                if (f.kind === "eq") {
                    rows = rows.filter((r) => r[f.col] === f.val);
                } else if (f.kind === "ilike") {
                    rows = rows.filter((r) => rowMatchesIlike(r, f.col, String(f.val)));
                } else if (f.kind === "in") {
                    const set = new Set(Array.isArray(f.val) ? f.val : []);
                    rows = rows.filter((r) => set.has(r[f.col]));
                }
            }
            if (orExpr && tableName === "opportunities") {
                const token = patternToken(orExpr.split(".ilike.")[1] ?? orExpr);
                rows = rows.filter(
                    (r) =>
                        String(r.name ?? "").toLowerCase().includes(token) ||
                        String(r.title ?? "").toLowerCase().includes(token)
                );
            }
            if (tableName === "opportunities" && activeScope.locationIds?.length) {
                const allowed = new Set(activeScope.locationIds.map(String));
                rows = rows.filter((r) => r.location_id && allowed.has(String(r.location_id)));
            }
            return { data: rows.slice(0, limitN), error: null };
        };

        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: (col: string, val: unknown) => {
                filters.push({ kind: "eq", col, val });
                return builder;
            },
            ilike: (col: string, val: unknown) => {
                filters.push({ kind: "ilike", col, val });
                return builder;
            },
            in: (col: string, val: unknown) => {
                filters.push({ kind: "in", col, val });
                return builder;
            },
            or: (expr: string) => {
                orExpr = expr;
                return builder;
            },
            not: () => builder,
            order: () => builder,
            limit: (n: number) => {
                limitN = n;
                return builder;
            },
            maybeSingle: async () => {
                const { data } = exec();
                return { data: data[0] ?? null, error: null };
            },
            then: (resolve: (v: unknown) => void) => resolve(exec()),
        };

        return builder;
    };

    return {
        from: (t: string) => chain(t),
    } as unknown as SupabaseClient;
}

describe("runTaskAssistEntitySearch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        activeScope = { locationIds: null };
    });

    it("finds opportunity via customer household when query says Mitchell family", async () => {
        const supabase = createSearchSupabase(ORG_A, {
            opportunities: [
                {
                    id: OPP_ID,
                    org_id: ORG_A,
                    name: "Mitchell household",
                    title: null,
                    customer_id: CUST_ID,
                    work_unit_id: null,
                    location_id: null,
                    opportunity_number: 42,
                    primary_person_id: null,
                    primary_contact_id: null,
                },
            ],
            customers: [
                { id: CUST_ID, org_id: ORG_A, name: "Mitchell household" },
            ],
            persons: [],
            contacts: [],
            customer_members: [],
        });

        const { q, variants, candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ORG_A,
            accessDim: openDim,
            rawQ: "Mitchell family",
        });

        expect(q).toBe("Mitchell");
        expect(variants.map((v) => v.toLowerCase())).toContain("mitchell household");
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.entity_id).toBe(OPP_ID);
        expect(candidates[0]?.source).toBe("customer_family");
    });

    it("finds opportunity via primary contact last name Mitchell", async () => {
        const supabase = createSearchSupabase(ORG_A, {
            opportunities: [
                {
                    id: OPP_ID,
                    org_id: ORG_A,
                    name: "Fall inquiry",
                    title: null,
                    customer_id: CUST_ID,
                    primary_person_id: null,
                    primary_contact_id: CONTACT_ID,
                },
            ],
            customers: [],
            contacts: [{ id: CONTACT_ID, org_id: ORG_A, first_name: "Sarah", last_name: "Mitchell" }],
            persons: [],
            customer_members: [],
        });

        const { candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ORG_A,
            accessDim: openDim,
            rawQ: "Mitchell",
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.source).toBe("primary_contact");
    });

    it("finds opportunity via primary person last name", async () => {
        const supabase = createSearchSupabase(ORG_A, {
            opportunities: [
                {
                    id: OPP_ID,
                    org_id: ORG_A,
                    name: "Tour follow-up",
                    customer_id: CUST_ID,
                    primary_person_id: PERSON_ID,
                    primary_contact_id: null,
                },
            ],
            persons: [{ id: PERSON_ID, org_id: ORG_A, first_name: "Sarah", last_name: "Mitchell", full_name: "Sarah Mitchell" }],
            customers: [],
            contacts: [],
            customer_members: [],
        });

        const { candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ORG_A,
            accessDim: openDim,
            rawQ: "Mitchell family",
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.source).toBe("primary_person");
    });

    it("does not return opportunities from another org", async () => {
        const supabase = createSearchSupabase(ORG_A, {
            opportunities: [
                {
                    id: OPP_ID,
                    org_id: ORG_B,
                    name: "Mitchell household",
                    customer_id: CUST_ID,
                },
            ],
            customers: [{ id: CUST_ID, org_id: ORG_B, name: "Mitchell household" }],
            persons: [],
            contacts: [],
            customer_members: [],
        });

        const { candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ORG_A,
            accessDim: openDim,
            rawQ: "Mitchell",
        });

        expect(candidates).toHaveLength(0);
    });

    it("respects workspace_site_id for customer bridge opportunities", async () => {
        const supabase = createSearchSupabase(ORG_A, {
            opportunities: [
                {
                    id: OPP_ID,
                    org_id: ORG_A,
                    name: "Mitchell household",
                    customer_id: CUST_ID,
                    location_id: "loc-north",
                },
                {
                    id: "opp-south",
                    org_id: ORG_A,
                    name: "Mitchell household South",
                    customer_id: "cust-south",
                    location_id: "loc-south",
                },
            ],
            customers: [
                { id: CUST_ID, org_id: ORG_A, name: "Mitchell household" },
                { id: "cust-south", org_id: ORG_A, name: "Mitchell household South" },
            ],
            persons: [],
            contacts: [],
            customer_members: [],
            locations: [
                { id: "loc-north", org_id: ORG_A, label: "North Campus" },
                { id: "loc-south", org_id: ORG_A, label: "South Campus" },
            ],
        });

        const { candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ORG_A,
            accessDim: openDim,
            rawQ: "Mitchell",
            workspaceSiteId: "north-site",
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.entity_id).toBe(OPP_ID);
        expect(candidates[0]?.disambiguation?.location_name).toBe("North Campus");
    });

    it("respects workspace_site_id for primary person bridge", async () => {
        const supabase = createSearchSupabase(ORG_A, {
            opportunities: [
                {
                    id: OPP_ID,
                    org_id: ORG_A,
                    name: "North inquiry",
                    customer_id: CUST_ID,
                    primary_person_id: PERSON_ID,
                    location_id: "loc-north",
                },
                {
                    id: "opp-south",
                    org_id: ORG_A,
                    name: "South inquiry",
                    customer_id: CUST_ID,
                    primary_person_id: PERSON_ID,
                    location_id: "loc-south",
                },
            ],
            persons: [{ id: PERSON_ID, org_id: ORG_A, first_name: "Sarah", last_name: "Mitchell", full_name: "Sarah Mitchell" }],
            customers: [],
            contacts: [],
            customer_members: [],
            locations: [
                { id: "loc-north", org_id: ORG_A, label: "North Campus" },
                { id: "loc-south", org_id: ORG_A, label: "South Campus" },
            ],
        });

        const { candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ORG_A,
            accessDim: openDim,
            rawQ: "Mitchell",
            workspaceSiteId: "north-site",
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.entity_id).toBe(OPP_ID);
        expect(candidates[0]?.source).toBe("primary_person");
    });

    it("dedupes same opportunity from multiple variants", async () => {
        const supabase = createSearchSupabase(ORG_A, {
            opportunities: [
                {
                    id: OPP_ID,
                    org_id: ORG_A,
                    name: "Mitchell household",
                    title: "Mitchell household",
                    customer_id: CUST_ID,
                },
            ],
            customers: [{ id: CUST_ID, org_id: ORG_A, name: "Mitchell household" }],
            persons: [],
            contacts: [],
            customer_members: [],
        });

        const { candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ORG_A,
            accessDim: openDim,
            rawQ: "Mitchell family",
        });

        expect(candidates).toHaveLength(1);
    });
});
