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
    executeLeadStatusMutationViaAdapter,
    resolveLeadStatusTargetState,
    type LeadStatusMutationExecutionDeps,
} from "@/lib/platform/commands/runtime/adapters/leadStatusMutationExecutionAdapter";
import {
    executeRegisteredActionViaAdapter,
    type RegisteredActionExecutionDeps,
} from "@/lib/platform/commands/runtime/adapters/registeredActionExecutionAdapter";
import type {
    CommandExecutionFailureStatus,
    CommandExecutionResult,
    ExecuteCommandInvocationRequest,
    ExecuteCommandInvocationServerContext,
    InvocationDelegationGuard,
} from "@/lib/platform/commands/runtime/commandExecutionTypes";
import {
    isCommandRuntimeFacadeExecutionSupported,
    isExecutionOwnerEnabledForFacade,
    isLeadStatusMutationFacadeSupported,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { assertCommandSnapshotInvariants } from "@/lib/platform/commands/runtime/commandRuntimeInvariants";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";

export type ExecuteCommandInvocationOptions = {
    request: ExecuteCommandInvocationRequest;
    server: ExecuteCommandInvocationServerContext;
    deps?: RegisteredActionExecutionDeps & LeadStatusMutationExecutionDeps;
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

    // ── Lead Status Mutation Runtime (P2.S1) ────────────────────────────────
    if (snapshot.executionDestination.owner === "mutation_runtime") {
        if (!isLeadStatusMutationFacadeSupported(invocation.commandKey)) {
            return fail({
                status: "unsupported_owner",
                invocationId,
                canonicalCapabilityKey: snapshot.canonicalCapabilityKey,
                executionOwner: snapshot.executionOwner,
                code: "mutation_capability_not_adapted",
                operatorMessage: "This command cannot be executed through the Command Runtime yet.",
            });
        }

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

        const overrideReason =
            typeof invocation.inputValues?.override_reason === "string"
                ? invocation.inputValues.override_reason
                : typeof invocation.inputValues?.overrideReason === "string"
                  ? invocation.inputValues.overrideReason
                  : undefined;

        let adapted;
        try {
            adapted = await executeLeadStatusMutationViaAdapter({
                snapshot,
                capability,
                commandKey: invocation.commandKey,
                invocation,
                executionSubject: { entityType, entityId },
                mode: request.mode,
                targetState,
                overrideReason,
                supabase: server.supabase,
                orgId: server.orgId,
                userId: server.userId,
                departmentId: request.departmentId ?? null,
                workUnitId: request.workUnitId ?? invocation.workUnitId ?? null,
                guard,
                deps,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Mutation adapter failed";
            // If guard already marked, still report delegated so route never falls back.
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
                        code: "delegated_lead_status_mutation",
                        message: `mode=preview key=${invocation.commandKey}`,
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
                    code: "delegated_lead_status_mutation",
                    message: `mode=execute key=${invocation.commandKey} mutationId=${adapted.mutationResult.mutationId}`,
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

export type { CommandExecutionResult, ExecuteCommandInvocationRequest };
