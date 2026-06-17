import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";
import { applyCreateLeadChildParticipation } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrgWithMeta: vi.fn().mockResolvedValue({ id: "parent-person-1" }),
}));

vi.mock("@/lib/bookingPersonCustomerResolve", () => ({
    ensureCustomerForPersonNative: vi.fn().mockResolvedValue({ customer_id: "customer-1" }),
}));

vi.mock("@/lib/bookingCustomerPersonLink", () => ({
    ensureCustomerPersonsPrimaryLink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({ work_unit_id: "wu-1", status_key: "open" }),
}));

vi.mock("@/lib/admin/actions/createLeadChildOcmPersistence", () => ({
    applyCreateLeadChildParticipation: vi.fn().mockResolvedValue(null),
}));

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

/** Documents actual create_lead DB writes for household intake audit (no broad multi-record commit). */
describe("create lead commit audit — household intake", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("writes primary parent, customer, opportunity, and optional first child only", async () => {
        const insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "opp-1" }, error: null }),
            }),
        });
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities") return { insert };
                if (table === "opportunity_persons") return { insert: vi.fn().mockResolvedValue({ error: null }) };
                if (table === "verticals") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                limit: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "vert-1" }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                return { insert: vi.fn(), select: vi.fn() };
            }),
        };

        const result = await executeCreateLeadAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            {
                merged: {
                    first_name: "Alex",
                    last_name: "Lyons",
                    email: "alex.lyons@test.com",
                    phone: "987988899",
                    child_first_name: "Jaxon",
                    child_last_name: "Lyons",
                    child_date_of_birth: "2013-11-23",
                    location_id: "site-1",
                },
                context: { department_id: "dept-1" },
            },
        );

        expect(result.ok).toBe(true);
        expect(findOrCreatePersonInOrgWithMeta).toHaveBeenCalledTimes(1);
        expect(ensureCustomerForPersonNative).toHaveBeenCalledTimes(1);
        expect(ensureCustomerPersonsPrimaryLink).toHaveBeenCalledTimes(1);
        expect(applyCreateLeadChildParticipation).toHaveBeenCalledTimes(1);
        expect(insert).toHaveBeenCalledTimes(1);
    });

    it("source audit: does not reference addresses or person_relationships tables", () => {
        const source = read("lib/admin/actions/entryLifecycleActions.ts");
        const childSource = read("lib/admin/actions/createLeadChildOcmPersistence.ts");
        expect(source).not.toMatch(/from\("addresses"\)/);
        expect(source).not.toMatch(/person_relationships/);
        expect(childSource).toMatch(/customer_members/);
        expect(childSource).toMatch(/opportunity_customer_members/);
    });
});

export const CREATE_LEAD_COMMIT_AUDIT = {
    creates: [
        "persons (primary parent/guardian)",
        "customers (household)",
        "customer_persons (primary_contact link)",
        "opportunities (lead)",
        "opportunity_persons (primary_guardian link)",
        "persons (first child, when child_first/last present)",
        "customer_members (child relationship, when child payload present)",
        "opportunity_customer_members (first child enrollment row, when child payload present)",
        "workflow_events (status + action_executed)",
    ],
    does_not_create: [
        "additional parent/guardian persons",
        "additional children beyond first payload",
        "addresses",
        "person_relationships rows",
        "contacts table rows on create path",
    ],
} as const;

describe("CREATE_LEAD_COMMIT_AUDIT reference", () => {
    it("documents expected vs actual scope for multi-member household intake", () => {
        expect(CREATE_LEAD_COMMIT_AUDIT.creates).toContain("customers (household)");
        expect(CREATE_LEAD_COMMIT_AUDIT.does_not_create).toContain("additional parent/guardian persons");
        expect(CREATE_LEAD_COMMIT_AUDIT.does_not_create).toContain("addresses");
    });
});
