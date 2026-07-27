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

vi.mock("@/lib/adminV2/actions/actionExecutor", () => ({
    runRegisteredAction: (...args: unknown[]) => runRegisteredAction(...args),
}));
vi.mock("@/lib/admin/actions/executeAdminAction", () => ({
    executeAdminAction: (...args: unknown[]) => executeAdminAction(...args),
}));
vi.mock("@/lib/mutations/runtime", () => ({
    executeMutation: (...args: unknown[]) => executeMutation(...args),
}));

import { POST } from "@/app/api/admin/actions/execute/route";

function jsonReq(body: unknown): Parameters<typeof POST>[0] {
    return new Request("https://alloy.test/api/admin/actions/execute", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/admin/actions/execute Lead Status Mutation cutover (P2.S1)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        executeMutation.mockResolvedValue({
            status: "committed",
            mutationId: "mut-route-1",
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
    });

    it.each(["update_lead_status", "close_lead"] as const)(
        "routes %s through Command Runtime → executeMutation once",
        async (key) => {
            const res = await POST(
                jsonReq({
                    action_key: key,
                    entity_type: "opportunity",
                    entity_id: "opp-1",
                    payload: {
                        target_state: "lost",
                        domain: "enrollment_status",
                        execution_owner: "registered_action",
                    },
                    context: {
                        surface: "record_header",
                        actor: { orgId: "spoof", userId: "spoof" },
                        org_id: "spoof-org",
                        department_id: "dept-1",
                    },
                })
            );
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.ok).toBe(true);
            expect(body.data.execution_result.kind).toBe("mutation");
            expect(body.data.execution_result.mutation_result.status).toBe("committed");
            expect(body.data.affected_id).toBe("opp-1");
            expect(body.correlation_id).toBe("mut-route-1");
            expect(executeMutation).toHaveBeenCalledTimes(1);
            expect(executeAdminAction).not.toHaveBeenCalled();
            expect(runRegisteredAction).not.toHaveBeenCalled();
            expect(executeMutation.mock.calls[0][0]).toEqual(
                expect.objectContaining({ orgId: "org-1", departmentId: "dept-1" })
            );
            expect(executeMutation.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    commandKey: key,
                    domain: "lead_status",
                    targetState: "lost",
                    operatorId: "user-1",
                })
            );
        }
    );

    it("does not fall back after Mutation Runtime blocked result", async () => {
        executeMutation.mockResolvedValueOnce({
            status: "blocked",
            commandKey: "close_lead",
            domain: "lead_status",
            subjectId: "opp-1",
            blockedReason: "No state change",
            blockedCode: "no_state_change",
        });
        const res = await POST(
            jsonReq({
                action_key: "close_lead",
                entity_type: "opportunity",
                entity_id: "opp-1",
                payload: { target_state: "lost" },
            })
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("ACTION_BLOCKED");
        expect(executeMutation).toHaveBeenCalledTimes(1);
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("preview uses Mutation Runtime previewOnly", async () => {
        executeMutation.mockResolvedValueOnce({
            status: "previewed",
            preview: {
                commandKey: "update_lead_status",
                domain: "lead_status",
                subjectId: "opp-1",
                subjectType: "opportunity",
                previousState: "new",
                targetState: "tour",
                warnings: [],
                readinessGaps: [],
                sideEffects: [],
            },
        });
        const res = await POST(
            jsonReq({
                action_key: "update_lead_status",
                entity_type: "opportunity",
                entity_id: "opp-1",
                mode: "preview",
                payload: { target_state: "tour" },
            })
        );
        expect(res.status).toBe(200);
        expect(executeMutation.mock.calls[0][2]).toEqual({ previewOnly: true });
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("keeps RegisteredAction create_lead on P1.S2 path", async () => {
        const res = await POST(
            jsonReq({
                action_key: "create_lead",
                entity_type: "opportunity",
                payload: {},
            })
        );
        expect(res.status).toBe(200);
        expect(runRegisteredAction).toHaveBeenCalledTimes(1);
        expect(executeMutation).not.toHaveBeenCalled();
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("keeps tour-domain complete_tour on compatibility path", async () => {
        await POST(
            jsonReq({
                action_key: "complete_tour",
                entity_type: "opportunity",
                entity_id: "opp-1",
                payload: {},
            })
        );
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(executeMutation).not.toHaveBeenCalled();
    });
});
