import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MutationResult } from "@/lib/mutations/types";
import {
    buildLeadStatusDecisionIntent,
    resolveLeadStatusTargetState,
} from "@/lib/platform/commands/runtime/adapters/leadStatusMutationExecutionAdapter";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import {
    COMMAND_RUNTIME_EXECUTION_BY_OWNER,
    isCommandRuntimeFacadeExecutionSupported,
    isLeadStatusMutationFacadeSupported,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

function invocation(
    partial: Partial<CommandInvocationRequest> & Pick<CommandInvocationRequest, "commandKey">
): CommandInvocationRequest {
    return {
        origin: "operator",
        operationalContext: "focus_panel",
        surface: "record_header",
        ...partial,
    };
}

function committedMutation(commandKey: string): MutationResult {
    return {
        status: "committed",
        mutationId: "mut-1",
        commandKey,
        domain: "lead_status",
        subjectId: "opp-1",
        subjectType: "opportunity",
        previousState: "new",
        newState: "lost",
        warnings: [{ code: "w1", message: "warn", severity: "info" }],
        sideEffects: [{ kind: "task", description: "follow up" }],
        committedAt: "2026-07-27T00:00:00.000Z",
    };
}

describe("Lead Status Mutation adapter (P2.S1)", () => {
    const supabase = {} as SupabaseClient;
    let mutationSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mutationSpy = vi.fn(async (_ctx, intent, opts) => {
            if (opts?.previewOnly) {
                return {
                    status: "previewed",
                    preview: {
                        commandKey: intent.commandKey,
                        domain: "lead_status",
                        subjectId: intent.subjectId,
                        subjectType: "opportunity",
                        previousState: "new",
                        targetState: intent.targetState,
                        warnings: [],
                        readinessGaps: [],
                        sideEffects: [],
                    },
                } satisfies MutationResult;
            }
            return committedMutation(intent.commandKey);
        });
    });

    it("maps update_lead_status and close_lead to lead_status DecisionIntent", () => {
        for (const key of ["update_lead_status", "close_lead"] as const) {
            const intent = buildLeadStatusDecisionIntent({
                commandKey: key,
                subjectId: "opp-1",
                subjectType: "opportunity",
                targetState: "lost",
                origin: "operator",
                operatorId: "user-1",
            });
            expect(intent.domain).toBe("lead_status");
            expect(intent.commandKey).toBe(key);
            expect(intent.targetState).toBe("lost");
        }
    });

    it("normalizes target_state from payload field variants", () => {
        expect(resolveLeadStatusTargetState({ target_state: "lost" })).toBe("lost");
        expect(resolveLeadStatusTargetState({ status_key: "won" })).toBe("won");
        expect(resolveLeadStatusTargetState({ targetState: "tour" })).toBe("tour");
        expect(resolveLeadStatusTargetState({})).toBe("");
    });

    it("ignores client domain spoof when building intent", () => {
        const intent = buildLeadStatusDecisionIntent({
            commandKey: "close_lead",
            subjectId: "opp-1",
            subjectType: "opportunity",
            targetState: "lost",
            origin: "api",
            contextPayload: { domain: "enrollment_status" },
        });
        expect(intent.domain).toBe("lead_status");
    });

    it("executes update_lead_status and close_lead through Mutation Runtime once", async () => {
        for (const key of ["update_lead_status", "close_lead"] as const) {
            mutationSpy.mockClear();
            const result = await executeCommandInvocation({
                request: {
                    invocation: invocation({
                        commandKey: key,
                        inputValues: { target_state: "lost" },
                        actor: { orgId: "spoof", userId: "spoof" },
                    }),
                    mode: "execute",
                    executionSubject: { entityType: "opportunity", entityId: "opp-1" },
                    invocationId: `inv-${key}`,
                },
                server: { orgId: "org-real", userId: "user-real", supabase },
                deps: { executeMutation: mutationSpy },
            });
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.executionOwner).toBe("mutation_runtime");
                expect(result.status).toBe("committed");
                expect(result.mutationResult?.status).toBe("committed");
                if (result.mutationResult?.status === "committed") {
                    expect(result.mutationResult.mutationId).toBe("mut-1");
                    expect(result.mutationResult.warnings).toHaveLength(1);
                    expect(result.mutationResult.sideEffects).toHaveLength(1);
                }
            }
            expect(mutationSpy).toHaveBeenCalledTimes(1);
            expect(mutationSpy.mock.calls[0][0]).toEqual(
                expect.objectContaining({ orgId: "org-real" })
            );
            expect(mutationSpy.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    commandKey: key,
                    domain: "lead_status",
                    targetState: "lost",
                    operatorId: "user-real",
                })
            );
            expect(mutationSpy.mock.calls[0][2]).toEqual({ previewOnly: false });
        }
    });

    it("preview delegates without commit", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "update_lead_status",
                    inputValues: { status_key: "tour" },
                }),
                mode: "preview",
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { executeMutation: mutationSpy },
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.status).toBe("previewed");
            expect(result.mutationResult?.status).toBe("previewed");
        }
        expect(mutationSpy).toHaveBeenCalledTimes(1);
        expect(mutationSpy.mock.calls[0][2]).toEqual({ previewOnly: true });
    });

    it("maps blocked MutationResult without fallback", async () => {
        mutationSpy.mockResolvedValueOnce({
            status: "blocked",
            commandKey: "close_lead",
            domain: "lead_status",
            subjectId: "opp-1",
            blockedReason: "Transition not allowed",
            blockedCode: "transition_blocked",
        } satisfies MutationResult);
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "close_lead",
                    inputValues: { target_state: "lost" },
                }),
                mode: "execute",
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { executeMutation: mutationSpy },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.delegated).toBe(true);
            expect(result.error.code).toBe("transition_blocked");
            expect(result.error.operatorMessage).toBe("Transition not allowed");
            expect(result.diagnostics.some((d) => d.code === "mutation_blocked")).toBe(true);
            expect(result.error.operatorMessage).not.toContain("mutation_blocked");
        }
    });

    it("rejects missing target_state before delegation", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "update_lead_status",
                    inputValues: {},
                }),
                mode: "execute",
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { executeMutation: mutationSpy },
        });
        expect(result.ok).toBe(false);
        expect(mutationSpy).not.toHaveBeenCalled();
    });

    it("rejects child enrollment commands on the Lead Status adapter", async () => {
        for (const key of ["waitlist_child", "enroll_child", "update_child_enrollment_status"]) {
            expect(isLeadStatusMutationFacadeSupported(key)).toBe(false);
        }
        // Lead Status path must not claim these keys; gate routes them to enrollment adapter.
        expect(isCommandRuntimeFacadeExecutionSupported("waitlist_child")).toBe(true);
    });

    it("keeps update_status on RegisteredAction and mutation_runtime owner gate closed globally", () => {
        expect(COMMAND_RUNTIME_EXECUTION_BY_OWNER.mutation_runtime).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("update_status")).toBe(true);
        const prep = prepareCommandInvocation(invocation({ commandKey: "update_status" }));
        expect(prep.snapshot.executionOwner).toBe("registered_action");
        const close = prepareCommandInvocation(invocation({ commandKey: "close_lead" }));
        expect(close.snapshot.executionOwner).toBe("mutation_runtime");
    });

    it("forbids adapter from importing RPC / domain handler / direct writes", () => {
        const source = readFileSync(
            resolve(process.cwd(), "lib/platform/commands/runtime/adapters/leadStatusMutationExecutionAdapter.ts"),
            "utf8"
        );
        expect(source).toContain("executeMutation");
        expect(source).not.toMatch(/from \"@\/lib\/mutations\/domains\/leadStatus\"/);
        expect(source).not.toMatch(/execute_lead_status_mutation/);
        expect(source).not.toMatch(/from \"@\/lib\/supabase/);
        expect(source).not.toMatch(/\.from\(/);
        expect(source).not.toMatch(/executeAdminAction/);
        expect(source).not.toMatch(/runRegisteredAction/);
    });
});
