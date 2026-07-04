import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "open", status_label: "Open", sort_order: 10, metadata: { default_on_create: true } },
    ]),
    resolveConfiguredDefaultCreateStatusKey: (defs: { status_key: string; metadata?: Record<string, unknown> | null }[]) =>
        defs.find((d) => d.metadata?.default_on_create === true)?.status_key ?? null,
}));

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockImplementation((_supabase, payload) => {
        return Promise.resolve(payload);
    }),
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
    // The binding resolves the owning work unit + the operator-configured entry-stage status
    // (canonical `open` here) — never the legacy hardcoded new_inquiry key.
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({
        work_unit_id: "wu-enrollment",
        status_key: "open",
    }),
}));

vi.mock("@/lib/admin/actions/createLeadChildOcmPersistence", () => ({
    applyCreateLeadChildParticipation: vi.fn().mockResolvedValue({
        customer_member_id: "member-child",
        ocm_id: "ocm-child",
    }),
}));

vi.mock("@/lib/admin/actions/executeCreateLeadHouseholdCommit", () => ({
    applyCreateLeadHouseholdMemberCommit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/actions/applyCreateLeadLayoutRuntimePersistence", () => ({
    applyCreateLeadLayoutRuntimePersistence: vi.fn().mockResolvedValue(undefined),
}));

describe("create lead lifecycle binding status_key", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("applies the binding's configured entry status on opportunity insert", async () => {
        const insertPayloads: Record<string, unknown>[] = [];
        const supabase = {
            from(table: string) {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                limit: () => ({
                                    maybeSingle: async () =>
                                        table === "verticals" ? { data: { id: "vert-1" }, error: null } : { data: null, error: null },
                                }),
                            }),
                        }),
                    }),
                    insert: (payload: Record<string, unknown>) => {
                        insertPayloads.push({ table, ...payload });
                        const id =
                            table === "opportunities" ? "opp-new"
                            : table === "opportunity_persons" ? "op-1"
                            : "row-1";
                        return {
                            select: () => ({
                                single: async () => ({ data: { id }, error: null }),
                            }),
                        };
                    },
                };
            },
        };

        const result = await executeCreateLeadAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            {
                merged: {
                    first_name: "Jane",
                    last_name: "Doe",
                    email: "jane@example.com",
                    phone: "555-0100",
                    vertical_id: "vert-1",
                },
                context: { department_id: "dept-enrollment", work_unit_id: null, surface: "right_rail" },
            },
        );

        expect(result.ok).toBe(true);
        const oppInsert = insertPayloads.find((row) => row.table === "opportunities");
        expect(oppInsert?.status_key).toBe("open");
        expect(oppInsert?.work_unit_id).toBe("wu-enrollment");
        expect(oppInsert).not.toHaveProperty("status");
    });
});
