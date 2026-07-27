/**
 * executeCommandInvocation — Command Runtime execution entry (P1.S2 / P2.S1).
 *
 * Server-authoritative — import only from API routes / server modules.
 * Consumes prepareCommandInvocation, then delegates at most once to an enabled adapter.
 *
 * Exactly-once guarantee is per route/invocation guard — not distributed idempotency.
 */

import { randomUUID } from "crypto";
import type { ActionRuntimeContext } from "@/lib/adminV2/actions/actionTypes";
import {
    getPlatformCapability,
    tryResolvePlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import type { CapabilityExecutionOwner } from "@/lib/platform/commands/capabilityTypes";
import {
    executeChildEnrollmentMutationViaAdapter,
    type ChildEnrollmentMutationExecutionDeps,
} from "@/lib/platform/commands/runtime/adapters/childEnrollmentMutationExecutionAdapter";
import {
    executeLeadStatusMutationViaAdapter,
    resolveLeadStatusTargetState,
    type LeadStatusMutationExecutionDeps,
} from "@/lib/platform/commands/runtime/adapters/leadStatusMutationExecutionAdapter";
import {
    executeRegisteredActionViaAdapter,
    type RegisteredActionExecutionDeps,
} from "@/lib/platform/commands/runtime/adapters/registeredActionExecutionAdapter";
import {
    executeRelationshipViaAdapter,
    type RelationshipExecutionDeps,
} from "@/lib/platform/commands/runtime/adapters/relationshipExecutionAdapter";
import type {
    CommandExecutionFailureStatus,
    CommandExecutionResult,
    ExecuteCommandInvocationRequest,
    ExecuteCommandInvocationServerContext,
    InvocationDelegationGuard,
} from "@/lib/platform/commands/runtime/commandExecutionTypes";
import {
    isChildEnrollmentMutationFacadeSupported,
    isCommandRuntimeFacadeExecutionSupported,
    isExecutionOwnerEnabledForFacade,
    isLeadStatusMutationFacadeSupported,
    isRelationshipRuntimeFacadeSupported,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { assertCommandSnapshotInvariants } from "@/lib/platform/commands/runtime/commandRuntimeInvariants";
import {
    assertDestructiveCommitAllowed,
    isDestructiveOrReplacementCapability,
} from "@/lib/platform/commands/runtime/destructive";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";

export type ExecuteCommandInvocationOptions = {
    request: ExecuteCommandInvocationRequest;
    server: ExecuteCommandInvocationServerContext;
    deps?: RegisteredActionExecutionDeps &
        LeadStatusMutationExecutionDeps &
        ChildEnrollmentMutationExecutionDeps &
        RelationshipExecutionDeps;
};

function createDelegationGuard(invocationId: string): InvocationDelegationGuard {
    let delegated = false;
    return {
        invocationId,
        hasDelegated: () => delegated,
        markDelegated: () => {
            if (delegated) {
                throw new Error(
                    `[commandRuntime] duplicate delegation forbidden for invocation ${invocationId}`
                );
            }
            delegated = true;
        },
    };
}

function fail(input: {
    status: CommandExecutionFailureStatus;
    invocationId: string;
    code: string;
    operatorMessage: string;
    canonicalCapabilityKey?: string;
    executionOwner?: CapabilityExecutionOwner;
    delegated?: boolean;
    diagnostics?: { code: string; message: string }[];
    actionResult?: Extract<CommandExecutionResult, { ok: false }>["actionResult"];
    mutationResult?: Extract<CommandExecutionResult, { ok: false }>["mutationResult"];
}): Extract<CommandExecutionResult, { ok: false }> {
    return {
        ok: false,
        status: input.status,
        canonicalCapabilityKey: input.canonicalCapabilityKey,
        executionOwner: input.executionOwner,
        invocationId: input.invocationId,
        error: {
            code: input.code,
            operatorMessage: input.operatorMessage,
        },
        actionResult: input.actionResult,
        mutationResult: input.mutationResult,
        diagnostics: input.diagnostics ?? [
            { code: input.code, message: input.operatorMessage },
        ],
        delegated: input.delegated ?? false,
    };
}

function resolveCapability(commandKey: string): PlatformCapabilityDefinition | null {
    const resolved = tryResolvePlatformCapability(commandKey);
    if (resolved.status !== "known") return null;
    return (
        getPlatformCapability(resolved.capability.canonicalCommandKey) ??
        getPlatformCapability(resolved.capability.capabilityKey) ??
        resolved.capability
    );
}

/**
 * Execute (or preview) a Command through the facade when the owner/capability is enabled.
 * Ignores client-supplied actor on the invocation — server context is authoritative.
 */
export async function executeCommandInvocation(
    options: ExecuteCommandInvocationOptions
): Promise<CommandExecutionResult> {
    const { request, server, deps } = options;
    const invocationId = (request.invocationId ?? request.idempotencyKey ?? randomUUID()).trim();
    const guard = createDelegationGuard(invocationId);

    const invocation = {
        ...request.invocation,
        actor: {
            orgId: server.orgId,
            userId: server.userId ?? null,
        },
        commandKey: (request.invocation.commandKey ?? "").trim(),
    };

    if (!invocation.commandKey) {
        return fail({
            status: "invalid",
            invocationId,
            code: "missing_command_key",
            operatorMessage: "A command key is required.",
        });
    }

    if (request.mode !== "preview" && request.mode !== "execute") {
        return fail({
            status: "invalid",
            invocationId,
            code: "invalid_mode",
            operatorMessage: "Invalid execution mode.",
        });
    }

    // P4.S1: destructive/replacement commit is globally disabled (even before facade gate).
    {
        const earlyResolved = tryResolvePlatformCapability(invocation.commandKey);
        const earlyCanonical =
            earlyResolved.status === "known"
                ? earlyResolved.capability.canonicalCommandKey
                : invocation.commandKey;
        if (
            request.mode === "execute" &&
            isDestructiveOrReplacementCapability(earlyCanonical)
        ) {
            const guardResult = assertDestructiveCommitAllowed({
                capabilityKey: earlyCanonical,
            });
            return fail({
                status: "unsupported_owner",
                invocationId,
                canonicalCapabilityKey:
                    earlyResolved.status === "known" ? earlyCanonical : undefined,
                executionOwner:
                    earlyResolved.status === "known"
                        ? earlyResolved.capability.executionOwner
                        : undefined,
                code: guardResult.code,
                operatorMessage:
                    "This destructive or replacement command cannot be committed through the Command Runtime yet.",
                diagnostics: [
                    {
                        code: guardResult.code,
                        message: guardResult.message,
                    },
                ],
            });
        }
    }

    if (!isCommandRuntimeFacadeExecutionSupported(invocation.commandKey)) {
        const resolved = tryResolvePlatformCapability(invocation.commandKey);
        const owner =
            resolved.status === "known" ? resolved.capability.executionOwner : undefined;
        return fail({
            status: "unsupported_owner",
            invocationId,
            canonicalCapabilityKey:
                resolved.status === "known"
                    ? resolved.capability.canonicalCommandKey
                    : undefined,
            executionOwner: owner,
            code: "facade_execution_unsupported",
            operatorMessage: "This command cannot be executed through the Command Runtime yet.",
            diagnostics: [
                {
                    code: "facade_execution_unsupported",
                    message: `key=${invocation.commandKey} owner=${owner ?? "unknown"}`,
                },
            ],
        });
    }

    const prepared = prepareCommandInvocation(invocation);
    const snapshot = prepared.snapshot;
    const capability = resolveCapability(invocation.commandKey);

    if (!capability) {
        return fail({
            status: "unavailable",
            invocationId,
            code: "capability_missing",
            operatorMessage: "This command is not available.",
        });
    }

    assertCommandSnapshotInvariants(snapshot, capability);

    if (
        snapshot.maturity === "unavailable" ||
        snapshot.maturity === "placeholder" ||
        snapshot.maturity === "navigation_only" ||
        snapshot.maturity === "processing_only" ||
        snapshot.maturity === "workflow_only" ||
        snapshot.maturity === "configuration_maintenance"
    ) {
        return fail({
            status: "unavailable",
            invocationId,
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: snapshot.executionOwner,
            code: "capability_not_executable",
            operatorMessage: snapshot.operatorSafe.statusMessage,
            diagnostics: [...snapshot.diagnostics],
        });
    }

    // Adapted mutation keys are runnable for facade when capability-gated; RegisteredAction requires runnable.
    if (
        snapshot.executionOwner === "registered_action" &&
        (!snapshot.runnable || snapshot.maturity !== "executable")
    ) {
        return fail({
            status: "unavailable",
            invocationId,
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: snapshot.executionOwner,
            code: "capability_not_executable",
            operatorMessage: snapshot.operatorSafe.statusMessage,
        });
    }

    if (snapshot.authorizationEvaluated !== false || snapshot.authorizationGranted !== null) {
        return fail({
            status: "failed",
            invocationId,
            code: "invariant_authorization_claim",
            operatorMessage: "Something went wrong. Please try again.",
            diagnostics: [
                {
                    code: "invariant_authorization_claim",
                    message: "snapshot claimed authorization during preparation",
                },
            ],
        });
    }

    if (
        request.mode === "execute" &&
        request.confirmation &&
        request.confirmation.confirmed === false &&
        (snapshot.confirmationPolicy === "confirm" ||
            snapshot.confirmationPolicy === "strong_confirm" ||
            snapshot.confirmationPolicy === "typed_confirm")
    ) {
        return fail({
            status: "confirmation_required",
            invocationId,
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: snapshot.executionOwner,
            code: "confirmation_required",
            operatorMessage: "Confirm before continuing.",
        });
    }

    const entityType = (request.executionSubject.entityType ?? "").trim();
    const entityId = (request.executionSubject.entityId ?? "").trim();
    if (!entityType || !entityId) {
        return fail({
            status: "invalid",
            invocationId,
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: snapshot.executionOwner,
            code: "missing_entity",
            operatorMessage: "entity_type and entity_id are required.",
        });
    }

    // ── RegisteredAction (P1.S2) ────────────────────────────────────────────
    if (snapshot.executionDestination.owner === "registered_action") {
        if (!isExecutionOwnerEnabledForFacade("registered_action")) {
            return fail({
                status: "unsupported_owner",
                invocationId,
                canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                executionOwner: snapshot.executionOwner,
                code: "owner_gate_closed",
                operatorMessage: "This command cannot be executed through the Command Runtime yet.",
            });
        }

        const runtimeContext: ActionRuntimeContext = {
            orgId: server.orgId,
            userId: server.userId,
            accessScope: server.accessScope,
        };

        const adapted = await executeRegisteredActionViaAdapter({
            snapshot,
            capability,
            invocation,
            executionSubject: { entityType, entityId },
            mode: request.mode,
            supabase: server.supabase,
            runtimeContext,
            guard,
            deps,
        });

        if (!adapted.actionResult.ok) {
            return {
                ok: false,
                status: "blocked",
                canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                executionOwner: "registered_action",
                invocationId,
                error: {
                    code: adapted.actionResult.blockers?.[0]?.code ?? "action_failed",
                    operatorMessage: adapted.actionResult.error || "Action failed",
                },
                actionResult: adapted.actionResult,
                diagnostics: [
                    {
                        code: "registered_action_failed",
                        message: `status=${adapted.actionResult.status}`,
                    },
                ],
                delegated: true,
            };
        }

        return {
            ok: true,
            status: request.mode === "preview" ? "previewed" : "committed",
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: "registered_action",
            invocationId,
            actionResult: adapted.actionResult,
            diagnostics: [
                {
                    code: "delegated_registered_action",
                    message: `mode=${request.mode} key=${adapted.registeredActionKey}`,
                },
            ],
        };
    }

    // ── Mutation Runtime (P2.S1 Lead Status / P2.S2 Child Enrollment) ────────
    if (snapshot.executionDestination.owner === "mutation_runtime") {
        const overrideReason =
            typeof invocation.inputValues?.override_reason === "string"
                ? invocation.inputValues.override_reason
                : typeof invocation.inputValues?.overrideReason === "string"
                  ? invocation.inputValues.overrideReason
                  : undefined;

        const sharedMutationInput = {
            snapshot,
            capability,
            commandKey: invocation.commandKey,
            invocation,
            executionSubject: { entityType, entityId },
            mode: request.mode,
            overrideReason,
            supabase: server.supabase,
            orgId: server.orgId,
            userId: server.userId,
            departmentId: request.departmentId ?? null,
            workUnitId: request.workUnitId ?? invocation.workUnitId ?? null,
            guard,
            deps,
        } as const;

        if (isLeadStatusMutationFacadeSupported(invocation.commandKey)) {
            const targetState = resolveLeadStatusTargetState(invocation.inputValues);
            if (!targetState) {
                return fail({
                    status: "invalid",
                    invocationId,
                    canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                    executionOwner: snapshot.executionOwner,
                    code: "missing_target_state",
                    operatorMessage: "target_state is required.",
                });
            }

            let adapted;
            try {
                adapted = await executeLeadStatusMutationViaAdapter({
                    ...sharedMutationInput,
                    targetState,
                });
            } catch (e) {
                const message = e instanceof Error ? e.message : "Mutation adapter failed";
                return fail({
                    status: "failed",
                    invocationId,
                    canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                    executionOwner: "mutation_runtime",
                    code: "mutation_adapter_error",
                    operatorMessage: "Something went wrong. Please try again.",
                    delegated: guard.hasDelegated(),
                    diagnostics: [{ code: "mutation_adapter_error", message }],
                });
            }

            return mapMutationAdapterResult({
                adapted,
                snapshot,
                invocationId,
                mode: request.mode,
                commandKey: invocation.commandKey,
                diagnosticCode: "delegated_lead_status_mutation",
            });
        }

        if (isChildEnrollmentMutationFacadeSupported(invocation.commandKey)) {
            let adapted;
            try {
                adapted = await executeChildEnrollmentMutationViaAdapter(sharedMutationInput);
            } catch (e) {
                const message = e instanceof Error ? e.message : "Mutation adapter failed";
                // Pre-delegation validation errors (subject/target) are invalid, not failed.
                const preDelegation =
                    !guard.hasDelegated() &&
                    (message.includes("target_state") ||
                        message.includes("requires") ||
                        message.includes("Unsupported"));
                return fail({
                    status: preDelegation ? "invalid" : "failed",
                    invocationId,
                    canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                    executionOwner: "mutation_runtime",
                    code: preDelegation ? "invalid_enrollment_intent" : "mutation_adapter_error",
                    operatorMessage: preDelegation
                        ? message.replace(/^\[commandRuntime\]\s*/, "")
                        : "Something went wrong. Please try again.",
                    delegated: guard.hasDelegated(),
                    diagnostics: [{ code: "mutation_adapter_error", message }],
                });
            }

            return mapMutationAdapterResult({
                adapted,
                snapshot,
                invocationId,
                mode: request.mode,
                commandKey: invocation.commandKey,
                diagnosticCode: "delegated_child_enrollment_mutation",
            });
        }

        return fail({
            status: "unsupported_owner",
            invocationId,
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: snapshot.executionOwner,
            code: "mutation_capability_not_adapted",
            operatorMessage: "This command cannot be executed through the Command Runtime yet.",
        });
    }

    // ── Relationship Runtime (P3.S1) ────────────────────────────────────────
    if (snapshot.executionDestination.owner === "relationship_runtime") {
        if (!isRelationshipRuntimeFacadeSupported(invocation.commandKey)) {
            return fail({
                status: "unsupported_owner",
                invocationId,
                canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                executionOwner: snapshot.executionOwner,
                code: "relationship_capability_not_adapted",
                operatorMessage: "This command cannot be executed through the Command Runtime yet.",
            });
        }

        let adapted;
        try {
            adapted = await executeRelationshipViaAdapter({
                snapshot,
                capability,
                commandKey: invocation.commandKey,
                invocation,
                executionSubject: { entityType, entityId },
                mode: request.mode,
                supabase: server.supabase,
                orgId: server.orgId,
                userId: server.userId,
                guard,
                deps,
            });
        } catch (e) {
            const raw = e instanceof Error ? e.message : "Relationship adapter failed";
            const message = raw.replace(/^\[commandRuntime\]\s*/, "");
            const preDelegation = !guard.hasDelegated();
            // Domain executor throws operator-safe messages (parity with
            // /api/admin/relationship-actions/execute). Never leak stacks.
            const operatorMessage =
                message && !/stack|at\s+\S+\s+\(|postgres|sqlstate/i.test(message)
                    ? message
                    : "Something went wrong. Please try again.";
            return fail({
                status: preDelegation ? "invalid" : "failed",
                invocationId,
                canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                executionOwner: "relationship_runtime",
                code: preDelegation ? "invalid_relationship_intent" : "relationship_executor_error",
                operatorMessage,
                delegated: guard.hasDelegated(),
                diagnostics: [
                    {
                        code: preDelegation
                            ? "invalid_relationship_intent"
                            : "relationship_executor_error",
                        message: raw,
                    },
                ],
            });
        }

        return {
            ok: true,
            status: "committed",
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: "relationship_runtime",
            invocationId,
            relationshipResult: adapted.relationshipResult,
            diagnostics: [
                {
                    code: "delegated_relationship_action",
                    message: `key=${adapted.actionKey} links=${adapted.relationshipResult.links_written}`,
                },
            ],
        };
    }

    return fail({
        status: "unsupported_owner",
        invocationId,
        canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
        executionOwner: snapshot.executionOwner,
        code: "owner_not_enabled",
        operatorMessage: "This command cannot be executed through the Command Runtime yet.",
    });
}

function mapMutationAdapterResult(input: {
    adapted: {
        mutationResult: import("@/lib/mutations/types").MutationResult;
        domainKey: string;
    };
    snapshot: { canonicalCapabilityKey: string };
    invocationId: string;
    mode: "preview" | "execute";
    commandKey: string;
    diagnosticCode: string;
}): CommandExecutionResult {
    const { adapted, snapshot, invocationId, commandKey, diagnosticCode } = input;

    if (adapted.mutationResult.status === "blocked") {
        return {
            ok: false,
            status: "blocked",
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: "mutation_runtime",
            invocationId,
            error: {
                code: adapted.mutationResult.blockedCode,
                operatorMessage: adapted.mutationResult.blockedReason,
            },
            mutationResult: adapted.mutationResult,
            diagnostics: [
                {
                    code: "mutation_blocked",
                    message: `domain=${adapted.domainKey} code=${adapted.mutationResult.blockedCode}`,
                },
            ],
            delegated: true,
        };
    }

    if (adapted.mutationResult.status === "previewed") {
        return {
            ok: true,
            status: "previewed",
            canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
            executionOwner: "mutation_runtime",
            invocationId,
            mutationResult: adapted.mutationResult,
            diagnostics: [
                {
                    code: diagnosticCode,
                    message: `mode=preview key=${commandKey}`,
                },
            ],
        };
    }

    return {
        ok: true,
        status: "committed",
        canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
        executionOwner: "mutation_runtime",
        invocationId,
        mutationResult: adapted.mutationResult,
        diagnostics: [
            {
                code: diagnosticCode,
                message: `mode=execute key=${commandKey} mutationId=${adapted.mutationResult.mutationId}`,
            },
        ],
    };
}

export type { CommandExecutionResult, ExecuteCommandInvocationRequest };
