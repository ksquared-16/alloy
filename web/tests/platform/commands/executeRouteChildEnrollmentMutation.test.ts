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
vi.mock("@/lib/lifecycle/applyChildWaitlistViaOutcomeRuntime", () => ({
    applyChildWaitlistViaOutcomeRuntime: vi.fn(async () => ({
        ok: true as const,
        opportunity_id: "opp-1",
        customer_member_id: "child-1",
    })),
    resolveChildWaitlistSubjectFromOcm: vi.fn(async () => ({
        opportunity_id: "opp-1",
        customer_member_id: "child-1",
        opportunity_customer_member_id: "ocm-1",
    })),
}));
vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: vi.fn(async () => "dept-1"),
}));

import { applyChildWaitlistViaOutcomeRuntime } from "@/lib/lifecycle/applyChildWaitlistViaOutcomeRuntime";
import { POST } from "@/app/api/admin/actions/execute/route";

function jsonReq(body: unknown): Parameters<typeof POST>[0] {
    return new Request("https://alloy.test/api/admin/actions/execute", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/admin/actions/execute Child Enrollment cutover (P2.S2)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        executeMutation.mockImplementation(async (_ctx, intent) => ({
            status: "committed",
            mutationId: "mut-enroll-route",
            commandKey: intent.commandKey,
            domain: "enrollment_status",
            subjectId: intent.subjectId,
            subjectType: "opportunity_customer_member",
            previousState: "inquiry",
            newState: intent.targetState,
            warnings: [],
            sideEffects: [],
            committedAt: "2026-07-27T00:00:00.000Z",
        }));
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
        vi.mocked(applyChildWaitlistViaOutcomeRuntime).mockResolvedValue({
            ok: true,
            opportunity_id: "opp-1",
            customer_member_id: "child-1",
        });
    });

    it.each([
        ["update_child_enrollment_status", { target_state: "waitlisted" }, "waitlisted"],
        ["enroll_child", { status_key: "waitlisted" }, "enrolled"],
    ] as const)("routes %s through facade → executeMutation once", async (key, payload, expected) => {
        const res = await POST(
            jsonReq({
                action_key: key,
                entity_type: "opportunity_customer_member",
                entity_id: "ocm-1",
                payload: {
                    ...payload,
                    domain: "lead_status",
                    execution_owner: "registered_action",
                },
                context: {
                    actor: { orgId: "spoof" },
                    org_id: "spoof",
                    department_id: "dept-1",
                },
            })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.execution_result.kind).toBe("mutation");
        expect(body.data.execution_result.mutation_result.newState).toBe(expected);
        expect(executeMutation).toHaveBeenCalledTimes(1);
        expect(executeAdminAction).not.toHaveBeenCalled();
        expect(runRegisteredAction).not.toHaveBeenCalled();
        expect(executeMutation.mock.calls[0][1]).toEqual(
            expect.objectContaining({
                commandKey: key,
                domain: "enrollment_status",
                targetState: expected,
                operatorId: "user-1",
            })
        );
    });

    it("routes waitlist_child through child Enrollment facade → outcome progression (not Mutation Runtime)", async () => {
        const res = await POST(
            jsonReq({
                action_key: "waitlist_child",
                entity_type: "opportunity_customer_member",
                entity_id: "ocm-1",
                payload: { target_state: "enrolled" },
                context: {
                    actor: { orgId: "spoof" },
                    org_id: "spoof",
                    department_id: "dept-1",
                },
            })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.execution_result.kind).toBe("mutation");
        expect(body.data.execution_result.mutation_result.newState).toBe("waitlisted");
        expect(applyChildWaitlistViaOutcomeRuntime).toHaveBeenCalledTimes(1);
        expect(executeMutation).not.toHaveBeenCalled();
        expect(executeAdminAction).not.toHaveBeenCalled();
        expect(runRegisteredAction).not.toHaveBeenCalled();
    });

    it("routes move_to_waitlist alias through waitlist_child outcome progression", async () => {
        const res = await POST(
            jsonReq({
                action_key: "move_to_waitlist",
                entity_type: "opportunity_customer_member",
                entity_id: "ocm-1",
                payload: {},
                context: { department_id: "dept-1" },
            })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.execution_result.mutation_result.newState).toBe("waitlisted");
        expect(applyChildWaitlistViaOutcomeRuntime).toHaveBeenCalledTimes(1);
        expect(executeMutation).not.toHaveBeenCalled();
    });

    it("keeps Lead Status close_lead on P2.S1 path", async () => {
        await POST(
            jsonReq({
                action_key: "close_lead",
                entity_type: "opportunity",
                entity_id: "opp-1",
                payload: { target_state: "lost" },
            })
        );
        expect(executeMutation).toHaveBeenCalledTimes(1);
        expect(executeMutation.mock.calls[0][1].domain).toBe("lead_status");
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("keeps RegisteredAction create_lead on P1.S2 path", async () => {
        await POST(
            jsonReq({
                action_key: "create_lead",
                entity_type: "opportunity",
                payload: {},
            })
        );
        expect(runRegisteredAction).toHaveBeenCalledTimes(1);
        expect(executeMutation).not.toHaveBeenCalled();
    });

    it("keeps mark_lost and relationship keys on compatibility path", async () => {
        await POST(
            jsonReq({
                action_key: "mark_lost",
                entity_type: "opportunity",
                entity_id: "opp-1",
                payload: {},
            })
        );
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(executeMutation).not.toHaveBeenCalled();

        vi.clearAllMocks();
        executeAdminAction.mockResolvedValue({
            ok: true,
            correlation_id: "fallback-cid",
            execution_result: { kind: "compat" },
        });
        await POST(
            jsonReq({
                action_key: "add_family_member",
                entity_type: "person",
                entity_id: "person-1",
                payload: {},
            })
        );
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(executeMutation).not.toHaveBeenCalled();
    });
});
