import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";

// Make the real executeCreateLeadAction reach a failing native insert, then throw —
// exactly how a stale/diverged customers schema surfaces (PGRST204).
const ensureCustomerForPersonNative = vi.fn();
vi.mock("@/lib/bookingPersonCustomerResolve", () => ({
    ensureCustomerForPersonNative: (...args: unknown[]) => ensureCustomerForPersonNative(...args),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrg: vi.fn().mockResolvedValue("person-1"),
    findOrCreatePersonInOrgWithMeta: vi.fn().mockResolvedValue({ id: "person-1" }),
}));

vi.mock("@/lib/bookingCustomerPersonLink", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/bookingCustomerPersonLink")>()),
    ensureCustomerPersonsPrimaryLink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

// Keep the status-config read hermetic: `open` is the configured default-on-create.
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "open", status_label: "Open", sort_order: 10, metadata: { default_on_create: true } },
    ]),
    resolveConfiguredDefaultCreateStatusKey: (defs: { status_key: string; metadata?: Record<string, unknown> | null }[]) =>
        defs.find((d) => d.metadata?.default_on_create === true)?.status_key ?? null,
}));

const CREATE_LEAD_DEF = {
    id: "def-create-lead",
    key: "create_lead",
    action_type: "create_lead",
    entity_type: "opportunity",
    payload_schema: {},
    workflow_id: null,
    org_id: null,
    is_active: true,
};

function supabaseForCreateLead() {
    return {
        from: vi.fn((table: string) => {
            if (table === "action_definitions") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                or: vi.fn().mockResolvedValue({ data: [CREATE_LEAD_DEF], error: null }),
                            }),
                        }),
                    }),
                };
            }
            return { select: vi.fn(), insert: vi.fn() };
        }),
    };
}

const ctx = { orgId: "org-1", userId: "user-1", accessScope: null };

function createLeadInput() {
    return {
        actionKey: "create_lead",
        entityType: "opportunity",
        entityId: "",
        // A resolvable owning work unit so the create proceeds to the customer insert (the failure
        // under test); without one, Create Lead now correctly fails closed before that step.
        context: { work_unit_id: "wu-1" },
        // vertical_id present so executeCreateLeadAction skips the verticals lookup.
        payload: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", vertical_id: "vert-1" },
    };
}

describe("executeAdminAction create_lead — operator-safe failure copy", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
        errorSpy.mockRestore();
    });

    it("returns admin-fix copy and 500 when the record model is out of sync (PGRST204)", async () => {
        ensureCustomerForPersonNative.mockRejectedValueOnce(
            new Error(
                "Customer insert failed: Could not find the 'status' column of 'customers' in the schema cache (code: PGRST204)"
            )
        );
        const sb = supabaseForCreateLead();

        const res = await executeAdminAction(sb as never, ctx as never, createLeadInput());

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(500);
            expect(res.error).toMatch(/record model is out of sync/i);
            expect(res.correlation_id).toBeTruthy();
        }
    });

    it("logs a searchable server-side line (action_key=create_lead + correlation_id) on failure", async () => {
        ensureCustomerForPersonNative.mockRejectedValueOnce(new Error("boom PGRST204"));
        const sb = supabaseForCreateLead();

        const res = await executeAdminAction(sb as never, ctx as never, createLeadInput());

        expect(res.ok).toBe(false);
        const logged = errorSpy.mock.calls.find(
            (c: unknown[]) => typeof c[0] === "string" && c[0].includes("create_lead execution threw")
        );
        expect(logged).toBeTruthy();
        expect(logged![1]).toEqual(
            expect.objectContaining({
                action_key: "create_lead",
                correlation_id: expect.any(String),
                schema_out_of_sync: true,
            })
        );
    });

    it("returns generic operator copy and 400 for non-schema failures", async () => {
        ensureCustomerForPersonNative.mockRejectedValueOnce(new Error("transient network blip"));
        const sb = supabaseForCreateLead();

        const res = await executeAdminAction(sb as never, ctx as never, createLeadInput());

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/review the information and try again/i);
        }
    });
});
