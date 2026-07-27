import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

vi.mock("@/lib/adminV2/actions/actionExecutor", () => ({
    runRegisteredAction: (...args: unknown[]) => runRegisteredAction(...args),
}));
vi.mock("@/lib/admin/actions/executeAdminAction", () => ({
    executeAdminAction: (...args: unknown[]) => executeAdminAction(...args),
}));

import { POST } from "@/app/api/admin/actions/execute/route";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";

function jsonReq(body: unknown): Parameters<typeof POST>[0] {
    return new Request("https://alloy.test/api/admin/actions/execute", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/admin/actions/execute Command Runtime cutover (P1.S2)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        executeAdminAction.mockResolvedValue({
            ok: true,
            correlation_id: "fallback-cid",
            execution_result: { kind: "compat" },
        });
    });

    it.each([...REGISTERED_ACTION_CAPABILITY_KEYS])(
        "routes %s through Command Runtime → runRegisteredAction once",
        async (key) => {
            const res = await POST(
                jsonReq({
                    action_key: key,
                    entity_type: "opportunity",
                    entity_id: key === "create_lead" ? undefined : "opp-1",
                    payload: {},
                    context: {
                        surface: "record_header",
                        execution_owner: "mutation_runtime",
                        actor: { orgId: "spoof", userId: "spoof" },
                        org_id: "spoof-org",
                    },
                })
            );
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.ok).toBe(true);
            expect(body.data.execution_result).toEqual({ created: true });
            expect(body.correlation_id).toBe("ra-cid");
            expect(runRegisteredAction).toHaveBeenCalledTimes(1);
            expect(executeAdminAction).not.toHaveBeenCalled();
            // Server actor, not spoofed context actor/org
            expect(runRegisteredAction.mock.calls[0][1]).toEqual(
                expect.objectContaining({ orgId: "org-1", userId: "user-1" })
            );
        }
    );

    it("preserves preview mode through the facade", async () => {
        runRegisteredAction.mockResolvedValueOnce({
            ok: true,
            correlationId: "prev-cid",
            result: {
                actionKey: "create_lead",
                entityType: "opportunity",
                entityId: "create-lead",
                affectedId: null,
                detail: { mode: "preview" },
            },
        });
        const res = await POST(
            jsonReq({
                action_key: "create_lead",
                entity_type: "opportunity",
                mode: "preview",
                payload: {},
            })
        );
        expect(res.status).toBe(200);
        expect(runRegisteredAction).toHaveBeenCalledTimes(1);
        expect(runRegisteredAction.mock.calls[0][3]).toBe("preview");
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("does not fall back after RegisteredAction failure", async () => {
        runRegisteredAction.mockResolvedValueOnce({
            ok: false,
            correlationId: "ra-fail",
            status: 400,
            error: "Not eligible",
            blockers: [{ code: "not_eligible", message: "Not eligible" }],
        });
        const res = await POST(
            jsonReq({
                action_key: "update_status",
                entity_type: "opportunity",
                entity_id: "opp-1",
                payload: {},
            })
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("ACTION_BLOCKED");
        expect(runRegisteredAction).toHaveBeenCalledTimes(1);
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("keeps relationship keys on executeAdminAction compatibility path", async () => {
        const res = await POST(
            jsonReq({
                action_key: "add_parent_guardian",
                entity_type: "child",
                entity_id: "child-1",
                payload: {},
            })
        );
        expect(res.status).toBe(200);
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(runRegisteredAction).not.toHaveBeenCalled();
    });

    it("keeps mark_lost on compatibility path (alias debt — not P2 cutover)", async () => {
        await POST(
            jsonReq({
                action_key: "mark_lost",
                entity_type: "opportunity",
                entity_id: "opp-1",
                payload: {},
            })
        );
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(runRegisteredAction).not.toHaveBeenCalled();
    });

    it("unknown keys keep safe compatibility failure behavior", async () => {
        executeAdminAction.mockResolvedValueOnce({
            ok: false,
            correlation_id: "unk",
            error: "Unknown action",
            status: 404,
        });
        const res = await POST(
            jsonReq({
                action_key: "totally_unknown_xyz",
                entity_type: "opportunity",
                entity_id: "opp-1",
            })
        );
        expect(res.status).toBe(404);
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(runRegisteredAction).not.toHaveBeenCalled();
    });

    it("route source uses facade gate and forbids post-delegation fallback", () => {
        const src = readFileSync(
            resolve(process.cwd(), "app/api/admin/actions/execute/route.ts"),
            "utf8"
        );
        expect(src).toContain("executeCommandInvocation");
        expect(src).toContain("isCommandRuntimeFacadeExecutionSupported");
        expect(src).toContain("requireAdminOrOps");
        expect(src).toMatch(/if \(delegated\)/);
        expect(src).toContain("executeAdminAction");
    });
});
