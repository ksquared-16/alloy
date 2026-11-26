import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";

vi.mock("@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter", () => ({
    ingestCreateLeadThroughProcessing: vi.fn(),
    opportunityIdFromAttempt: vi.fn(),
}));

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({ work_unit_id: "wu-1", status_key: "open" }),
}));

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "open", status_label: "Open", sort_order: 10, metadata: { default_on_create: true } },
    ]),
    resolveConfiguredDefaultCreateStatusKey: (defs: { status_key: string; metadata?: Record<string, unknown> | null }[]) =>
        defs.find((d) => d.metadata?.default_on_create === true)?.status_key ?? null,
}));

import { ingestCreateLeadThroughProcessing } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";

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
        context: { work_unit_id: "wu-1" },
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

    it("returns admin-fix copy and 500 when Processing intake throws schema errors", async () => {
        vi.mocked(ingestCreateLeadThroughProcessing).mockRejectedValueOnce(
            new Error(
                "Could not find the 'status' column of 'customers' in the schema cache (code: PGRST204)",
            ),
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

    it("treats a chk_pcs_source_kind CHECK violation as a system failure, not operator input", async () => {
        // Mirrors the exact staging failure when the deployed source_kind vocabulary
        // predates create_lead: the operator's information is fine — the schema is stale.
        vi.mocked(ingestCreateLeadThroughProcessing).mockRejectedValueOnce(
            new Error(
                'new row for relation "processing_case_sources" violates check constraint "chk_pcs_source_kind"',
            ),
        );
        const sb = supabaseForCreateLead();

        const res = await executeAdminAction(sb as never, ctx as never, createLeadInput());

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(500);
            // Non-blaming: must NOT tell the operator to review their information.
            expect(res.error).not.toMatch(/review the information/i);
            expect(res.error).toMatch(/system issue, not the information you entered/i);
            // Must not leak DB/constraint details.
            expect(res.error).not.toMatch(/chk_pcs_source_kind|processing_case_sources|constraint/i);
        }
        // Classified as schema-out-of-sync in the searchable server log.
        const logged = errorSpy.mock.calls.find(
            (c: unknown[]) => typeof c[0] === "string" && c[0].includes("create_lead execution threw"),
        );
        expect(logged?.[1]).toEqual(expect.objectContaining({ schema_out_of_sync: true }));
    });

    it("logs a searchable server-side line (action_key=create_lead + correlation_id) on failure", async () => {
        vi.mocked(ingestCreateLeadThroughProcessing).mockRejectedValueOnce(new Error("boom PGRST204"));
        const sb = supabaseForCreateLead();

        const res = await executeAdminAction(sb as never, ctx as never, createLeadInput());

        expect(res.ok).toBe(false);
        const logged = errorSpy.mock.calls.find(
            (c: unknown[]) => typeof c[0] === "string" && c[0].includes("create_lead execution threw"),
        );
        expect(logged).toBeTruthy();
        expect(logged![1]).toEqual(
            expect.objectContaining({
                action_key: "create_lead",
                correlation_id: expect.any(String),
                schema_out_of_sync: true,
            }),
        );
    });

    it("returns generic operator copy and 400 for non-schema Processing intake failures", async () => {
        vi.mocked(ingestCreateLeadThroughProcessing).mockResolvedValueOnce({
            ok: false,
            error: "transient network blip",
            status: 400,
        });
        const sb = supabaseForCreateLead();

        const res = await executeAdminAction(sb as never, ctx as never, createLeadInput());

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.status).toBe(400);
            expect(res.error).toMatch(/transient network blip/i);
        }
    });
});
