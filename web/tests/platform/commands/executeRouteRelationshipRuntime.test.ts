import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminAuth", () => ({
    requireAdminOrOps: vi.fn(async () => null),
}));
vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(async () => ({
        ok: true,
        orgId: "org-1",
        userId: "user-1",
    })),
    adminContextFailureResponse: vi.fn(),
}));
vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/admin/accessScope", () => ({
    scopeDimensionsFromAccess: vi.fn(() => null),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));
vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
}));
vi.mock("@/lib/admin/actions/cacheTags", () => ({
    adminActionsOrgTag: () => "tag",
}));

const runRegisteredAction = vi.fn();
const executeAdminAction = vi.fn();
const executeMutation = vi.fn();
const executeRelationshipAction = vi.fn();

vi.mock("@/lib/adminV2/actions/actionExecutor", () => ({
    runRegisteredAction: (...args: unknown[]) => runRegisteredAction(...args),
}));
vi.mock("@/lib/admin/actions/executeAdminAction", () => ({
    executeAdminAction: (...args: unknown[]) => executeAdminAction(...args),
}));
vi.mock("@/lib/mutations/runtime", () => ({
    executeMutation: (...args: unknown[]) => executeMutation(...args),
}));
vi.mock("@/lib/admin/relationship/executeRelationshipAction", () => ({
    executeRelationshipAction: (...args: unknown[]) => executeRelationshipAction(...args),
}));

import { POST } from "@/app/api/admin/actions/execute/route";

function jsonReq(body: unknown): Parameters<typeof POST>[0] {
    return new Request("https://alloy.test/api/admin/actions/execute", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/admin/actions/execute Relationship Runtime cutover (P3.S1)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        executeRelationshipAction.mockResolvedValue({
            ok: true,
            actionKey: "add_parent_guardian",
            role_key: "guardian",
            person_id: "person-1",
            child_person_id: "child-1",
            contact_id: "c1",
            customer_member_id: "cm-1",
            links_written: 1,
            links_skipped_invalid_role: 0,
            affected_children: [],
            affected_record_preview: [],
            scoped_contact_links: [],
            refresh_hints: { entityType: "child", entityId: "child-1" },
        });
        executeAdminAction.mockResolvedValue({
            ok: true,
            correlation_id: "fallback-cid",
            execution_result: { kind: "compat" },
        });
        runRegisteredAction.mockResolvedValue({
            ok: true,
            correlationId: "ra-cid",
            result: {
                actionKey: "create_lead",
                entityType: "opportunity",
                entityId: "create-lead",
                affectedId: "opp-new",
                detail: { created: true },
            },
        });
        executeMutation.mockResolvedValue({
            status: "committed",
            mutationId: "mut-1",
            commandKey: "close_lead",
            domain: "lead_status",
            subjectId: "opp-1",
            subjectType: "opportunity",
            previousState: "new",
            newState: "lost",
            warnings: [],
            sideEffects: [],
            committedAt: "2026-07-27T00:00:00.000Z",
        });
    });

    it.each([
        "add_parent_guardian",
        "link_existing_person",
        "add_emergency_contact",
        "add_authorized_pickup",
        "add_billing_contact",
    ] as const)(
        "routes %s through Command Runtime → executeRelationshipAction once",
        async (key) => {
            const fixedRole =
                key === "add_parent_guardian"
                    ? "guardian"
                    : key === "add_emergency_contact"
                      ? "emergency_contact"
                      : key === "add_authorized_pickup"
                        ? "authorized_pickup"
                        : key === "add_billing_contact"
                          ? "billing_contact"
                          : "emergency_contact";
            executeRelationshipAction.mockResolvedValueOnce({
                ok: true,
                actionKey: key,
                role_key: fixedRole,
                person_id: "person-1",
                child_person_id: "child-1",
                contact_id: "c1",
                customer_member_id: "cm-1",
                links_written: 1,
                links_skipped_invalid_role: 0,
                affected_children: [],
                affected_record_preview: [],
                scoped_contact_links: [],
                refresh_hints: { entityType: "child", entityId: "child-1" },
            });
            const res = await POST(
                jsonReq({
                    action_key: key,
                    entity_type: "child",
                    entity_id: "child-1",
                    payload: {
                        source_customer_id: "cust-1",
                        selected_person_id: "person-1",
                        role_key: "guardian",
                        relationship_kind: "sibling",
                        execution_owner: "mutation_runtime",
                        org_id: "spoof-org",
                        actor: { userId: "spoof" },
                    },
                    context: {
                        surface: "child_drawer",
                        actor: { orgId: "spoof", userId: "spoof" },
                        org_id: "spoof-org",
                        execution_owner: "registered_action",
                    },
                })
            );
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.ok).toBe(true);
            expect(body.data.execution_result.kind).toBe("relationship");
            expect(body.data.execution_result.relationship_result.ok).toBe(true);
            expect(body.data.execution_result.relationship_result.person_id).toBe("person-1");
            expect(body.data.affected_id).toBe("person-1");
            expect(executeRelationshipAction).toHaveBeenCalledTimes(1);
            expect(executeAdminAction).not.toHaveBeenCalled();
            expect(runRegisteredAction).not.toHaveBeenCalled();
            expect(executeMutation).not.toHaveBeenCalled();
            expect(executeRelationshipAction.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    actionKey: key,
                    orgId: "org-1",
                    actorUserId: "user-1",
                    selectedPersonId: "person-1",
                    sourceCustomerId: "cust-1",
                })
            );
            if (key !== "link_existing_person") {
                expect(executeRelationshipAction.mock.calls[0][1].roleKey).toBe(fixedRole);
            }
        }
    );

    it("does not fall back after Relationship Framework failure", async () => {
        executeRelationshipAction.mockRejectedValueOnce(
            new Error("Person not found for this organization.")
        );
        const res = await POST(
            jsonReq({
                action_key: "link_existing_person",
                entity_type: "child",
                entity_id: "child-1",
                payload: {
                    source_customer_id: "cust-1",
                    selected_person_id: "person-x",
                    role_key: "emergency_contact",
                },
            })
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.message).toBe("Person not found for this organization.");
        expect(executeRelationshipAction).toHaveBeenCalledTimes(1);
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("rejects invalid relationship intent before delegation (no fallback)", async () => {
        const res = await POST(
            jsonReq({
                action_key: "add_parent_guardian",
                entity_type: "child",
                entity_id: "child-1",
                payload: { source_customer_id: "cust-1" },
            })
        );
        expect(res.status).toBe(400);
        expect(executeRelationshipAction).not.toHaveBeenCalled();
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("keeps RegisteredAction and Mutation paths unchanged", async () => {
        await POST(
            jsonReq({
                action_key: "create_lead",
                entity_type: "opportunity",
                payload: {},
            })
        );
        expect(runRegisteredAction).toHaveBeenCalledTimes(1);
        expect(executeRelationshipAction).not.toHaveBeenCalled();

        vi.clearAllMocks();
        executeMutation.mockResolvedValue({
            status: "committed",
            mutationId: "mut-1",
            commandKey: "close_lead",
            domain: "lead_status",
            subjectId: "opp-1",
            subjectType: "opportunity",
            previousState: "new",
            newState: "lost",
            warnings: [],
            sideEffects: [],
            committedAt: "2026-07-27T00:00:00.000Z",
        });
        await POST(
            jsonReq({
                action_key: "close_lead",
                entity_type: "opportunity",
                entity_id: "opp-1",
                payload: { target_state: "lost" },
            })
        );
        expect(executeMutation).toHaveBeenCalledTimes(1);
        expect(executeRelationshipAction).not.toHaveBeenCalled();
    });

    it("keeps unadapted Relationship / Tour / Processing on compatibility path", async () => {
        for (const key of [
            "add_child",
            "link_existing_child",
            "make_primary_contact",
            "cancel_tour",
            "processing.create_lead",
        ]) {
            vi.clearAllMocks();
            executeAdminAction.mockResolvedValue({
                ok: true,
                correlation_id: "fallback-cid",
                execution_result: { kind: "compat" },
            });
            await POST(
                jsonReq({
                    action_key: key,
                    entity_type: "child",
                    entity_id: "child-1",
                    payload: {},
                })
            );
            expect(executeAdminAction).toHaveBeenCalledTimes(1);
            expect(executeRelationshipAction).not.toHaveBeenCalled();
            expect(executeMutation).not.toHaveBeenCalled();
            expect(runRegisteredAction).not.toHaveBeenCalled();
        }
    });

    it("unknown keys retain safe compatibility behavior", async () => {
        executeAdminAction.mockResolvedValueOnce({
            ok: false,
            correlation_id: "unk",
            error: "Unknown action",
            status: 404,
        });
        const res = await POST(
            jsonReq({
                action_key: "totally_unknown_xyz",
                entity_type: "child",
                entity_id: "child-1",
            })
        );
        expect(res.status).toBe(404);
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(executeRelationshipAction).not.toHaveBeenCalled();
    });
});
