import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MutationResult } from "@/lib/mutations/types";
import {
    buildChildEnrollmentDecisionIntent,
    CHILD_ENROLLMENT_ENROLLED_TARGET_STATE,
    CHILD_ENROLLMENT_WAITLIST_TARGET_STATE,
    resolveChildEnrollmentTargetState,
} from "@/lib/platform/commands/runtime/adapters/childEnrollmentMutationExecutionAdapter";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import {
    isChildEnrollmentMutationFacadeSupported,
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

describe("Child Enrollment Mutation adapter (P2.S2)", () => {
    const supabase = {} as SupabaseClient;
    let mutationSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mutationSpy = vi.fn(async (_ctx, intent, opts) => {
            if (opts?.previewOnly) {
                return {
                    status: "previewed",
                    preview: {
                        commandKey: intent.commandKey,
                        domain: "enrollment_status",
                        subjectId: intent.subjectId,
                        subjectType: "opportunity_customer_member",
                        previousState: "inquiry",
                        targetState: intent.targetState,
                        warnings: [],
                        readinessGaps: [],
                        sideEffects: [],
                    },
                } satisfies MutationResult;
            }
            return {
                status: "committed",
                mutationId: "mut-enroll-1",
                commandKey: intent.commandKey,
                domain: "enrollment_status",
                subjectId: intent.subjectId,
                subjectType: "opportunity_customer_member",
                previousState: "inquiry",
                newState: intent.targetState,
                warnings: [{ code: "w1", message: "note", severity: "info" }],
                sideEffects: [],
                committedAt: "2026-07-27T00:00:00.000Z",
            } satisfies MutationResult;
        });
    });

    it("maps all three keys to enrollment_status DecisionIntent", () => {
        for (const key of [
            "update_child_enrollment_status",
            "waitlist_child",
            "enroll_child",
        ] as const) {
            const intent = buildChildEnrollmentDecisionIntent({
                commandKey: key,
                subjectId: "ocm-1",
                subjectType: "opportunity_customer_member",
                targetState: key === "enroll_child" ? "enrolled" : "waitlisted",
                origin: "operator",
            });
            expect(intent.domain).toBe("enrollment_status");
            expect(intent.commandKey).toBe(key);
        }
    });

    it("uses fixed waitlisted / enrolled targets and ignores conflicting client state", () => {
        const waitlist = resolveChildEnrollmentTargetState({
            commandKey: "waitlist_child",
            inputValues: { target_state: "enrolled" },
        });
        expect(waitlist).toEqual({
            targetState: CHILD_ENROLLMENT_WAITLIST_TARGET_STATE,
            strategy: "fixed_waitlist",
        });

        const enroll = resolveChildEnrollmentTargetState({
            commandKey: "enroll_child",
            inputValues: { status_key: "waitlisted" },
        });
        expect(enroll).toEqual({
            targetState: CHILD_ENROLLMENT_ENROLLED_TARGET_STATE,
            strategy: "fixed_enrolled",
        });

        const update = resolveChildEnrollmentTargetState({
            commandKey: "update_child_enrollment_status",
            inputValues: { target_state: "approved" },
        });
        expect(update).toEqual({ targetState: "approved", strategy: "supplied" });
    });

    it("executes the three capabilities through Mutation Runtime once", async () => {
        const cases = [
            {
                key: "update_child_enrollment_status",
                payload: { target_state: "waitlisted" },
                expected: "waitlisted",
            },
            {
                key: "waitlist_child",
                payload: { target_state: "enrolled" },
                expected: "waitlisted",
            },
            {
                key: "enroll_child",
                payload: { status_key: "waitlisted" },
                expected: "enrolled",
            },
        ] as const;

        for (const c of cases) {
            mutationSpy.mockClear();
            const result = await executeCommandInvocation({
                request: {
                    invocation: invocation({
                        commandKey: c.key,
                        inputValues: {
                            ...c.payload,
                            domain: "lead_status",
                            execution_owner: "registered_action",
                        },
                        actor: { orgId: "spoof", userId: "spoof" },
                    }),
                    mode: "execute",
                    executionSubject: {
                        entityType: "opportunity_customer_member",
                        entityId: "ocm-1",
                    },
                    invocationId: `inv-${c.key}`,
                },
                server: { orgId: "org-real", userId: "user-real", supabase },
                deps: { executeMutation: mutationSpy },
            });
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.executionOwner).toBe("mutation_runtime");
                expect(result.mutationResult?.status).toBe("committed");
            }
            expect(mutationSpy).toHaveBeenCalledTimes(1);
            expect(mutationSpy.mock.calls[0][0]).toEqual(
                expect.objectContaining({ orgId: "org-real" })
            );
            expect(mutationSpy.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    commandKey: c.key,
                    domain: "enrollment_status",
                    targetState: c.expected,
                    subjectId: "ocm-1",
                    operatorId: "user-real",
                })
            );
        }
    });

    it("preview delegates without commit", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "waitlist_child",
                    inputValues: {},
                }),
                mode: "preview",
                executionSubject: {
                    entityType: "opportunity_customer_member",
                    entityId: "ocm-1",
                },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { executeMutation: mutationSpy },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.status).toBe("previewed");
        expect(mutationSpy.mock.calls[0][2]).toEqual({ previewOnly: true });
        expect(mutationSpy.mock.calls[0][1].targetState).toBe("waitlisted");
    });

    it("rejects incompatible subject type before delegation", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "enroll_child",
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

    it("rejects mark_lost and Lead Status keys on this adapter support set", () => {
        expect(isChildEnrollmentMutationFacadeSupported("mark_lost")).toBe(false);
        expect(isChildEnrollmentMutationFacadeSupported("close_lead")).toBe(false);
        expect(isLeadStatusMutationFacadeSupported("waitlist_child")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("mark_lost")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("move_to_waitlist")).toBe(false);
    });

    it("prepares with mutation_runtime destination", () => {
        for (const key of [
            "update_child_enrollment_status",
            "waitlist_child",
            "enroll_child",
        ] as const) {
            const snap = prepareCommandInvocation(invocation({ commandKey: key }));
            expect(snap.snapshot.executionOwner).toBe("mutation_runtime");
            expect(snap.snapshot.executionDestination.owner).toBe("mutation_runtime");
        }
    });

    it("forbids adapter from importing RPC / domain handler / direct writes", () => {
        const source = readFileSync(
            resolve(
                process.cwd(),
                "lib/platform/commands/runtime/adapters/childEnrollmentMutationExecutionAdapter.ts"
            ),
            "utf8"
        );
        expect(source).toContain("executeMutation");
        expect(source).not.toMatch(/from \"@\/lib\/mutations\/domains\/enrollmentStatus\"/);
        expect(source).not.toMatch(/execute_enrollment_status_mutation/);
        expect(source).not.toMatch(/from \"@\/lib\/supabase/);
        expect(source).not.toMatch(/\.from\(/);
        expect(source).not.toMatch(/executeAdminAction/);
        expect(source).not.toMatch(/runRegisteredAction/);
    });
});
