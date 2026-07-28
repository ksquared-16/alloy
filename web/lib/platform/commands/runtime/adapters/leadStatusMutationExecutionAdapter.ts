/**
 * Lead Status Mutation Runtime adapter (P2.S1).
 *
 * Delegates exactly once to `executeMutation` — never calls the Lead Status domain
 * handler, RPCs, or status columns directly. Domain derives from capability/registry truth.
 */

import { resolveDomainForCommand } from "@/lib/mutations/domainRegistry";
import { executeMutation } from "@/lib/mutations/runtime";
import type {
    DecisionIntent,
    MutationOrigin,
    MutationResult,
} from "@/lib/mutations/types";
import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import type {
    CommandExecutionSubject,
    InvocationDelegationGuard,
} from "@/lib/platform/commands/runtime/commandExecutionTypes";
import { isLeadStatusMutationFacadeSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { isDestructiveOrReplacementCapability } from "@/lib/platform/commands/runtime/destructive";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { CommandSnapshot } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadStatusMutationExecutionDeps = {
    executeMutation?: typeof executeMutation;
};

export type LeadStatusMutationExecutionInput = {
    snapshot: CommandSnapshot;
    capability: PlatformCapabilityDefinition;
    /** Canonical command key after alias resolution — must be update_lead_status | close_lead. */
    commandKey: string;
    invocation: CommandInvocationRequest;
    executionSubject: CommandExecutionSubject;
    mode: "preview" | "execute";
    targetState: string;
    overrideReason?: string;
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
    guard: InvocationDelegationGuard;
    deps?: LeadStatusMutationExecutionDeps;
};

export type LeadStatusMutationExecutionOutput = {
    mutationResult: MutationResult;
    delegated: true;
    domainKey: "lead_status";
    decisionIntent: DecisionIntent;
};

function mapOrigin(origin: CommandInvocationRequest["origin"]): MutationOrigin {
    if (origin === "bos" || origin === "operator") return "operator";
    if (origin === "automation") return "automation";
    if (origin === "api") return "api";
    return "system";
}

/**
 * Normalize actions/execute payload fields into Mutation Runtime target_state.
 * Accepts target_state, status_key, or targetState without requiring a new client shape.
 */
export function resolveLeadStatusTargetState(
    inputValues: Record<string, unknown> | undefined
): string {
    if (!inputValues) return "";
    const candidates = [
        inputValues.target_state,
        inputValues.status_key,
        inputValues.targetState,
        inputValues.statusKey,
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.trim();
    }
    return "";
}

/**
 * Build DecisionIntent for Lead Status — domain from registry, not client.
 */
export function buildLeadStatusDecisionIntent(input: {
    commandKey: string;
    subjectId: string;
    subjectType: string;
    targetState: string;
    contextPayload?: Record<string, unknown>;
    operatorId?: string | null;
    origin: CommandInvocationRequest["origin"];
    overrideReason?: string;
}): DecisionIntent {
    const domain = resolveDomainForCommand(input.commandKey);
    if (!domain || domain.key !== "lead_status") {
        throw new Error(
            `[commandRuntime] Lead Status adapter refused non-lead_status domain for "${input.commandKey}"`
        );
    }
    // Ignore client domain spoof — always use registry domain.
    return {
        commandKey: input.commandKey,
        subjectId: input.subjectId,
        subjectType: input.subjectType.trim() || domain.subjectType,
        domain: domain.key,
        targetState: input.targetState,
        contextPayload: input.contextPayload,
        operatorId: input.operatorId ?? undefined,
        origin: mapOrigin(input.origin),
        overrideReason: input.overrideReason,
    };
}

/**
 * Delegate to Mutation Runtime exactly once for approved Lead Status commands.
 */
export async function executeLeadStatusMutationViaAdapter(
    input: LeadStatusMutationExecutionInput
): Promise<LeadStatusMutationExecutionOutput> {
    if (input.snapshot.executionDestination.owner !== "mutation_runtime") {
        throw new Error(
            "[commandRuntime] Lead Status adapter refused non-mutation_runtime destination"
        );
    }
    if (input.capability.executionOwner !== "mutation_runtime") {
        throw new Error(
            "[commandRuntime] Lead Status adapter refused capability owner mismatch"
        );
    }
    if (!isLeadStatusMutationFacadeSupported(input.commandKey)) {
        throw new Error(
            `[commandRuntime] Lead Status adapter refused unsupported key "${input.commandKey}"`
        );
    }
    if (isDestructiveOrReplacementCapability(input.capability.canonicalCommandKey)) {
        throw new Error(
            "[commandRuntime] Lead Status adapter refused destructive/replacement capability"
        );
    }
    if (
        input.capability.canonicalCommandKey !== "update_lead_status" &&
        input.capability.canonicalCommandKey !== "close_lead"
    ) {
        throw new Error(
            `[commandRuntime] Lead Status adapter refused canonical "${input.capability.canonicalCommandKey}"`
        );
    }

    const entityType = input.executionSubject.entityType.trim().toLowerCase();
    if (entityType !== "opportunity" && entityType !== "opportunities" && entityType !== "case") {
        throw new Error(
            `[commandRuntime] Lead Status adapter requires opportunity subject (got "${input.executionSubject.entityType}")`
        );
    }

    const intent = buildLeadStatusDecisionIntent({
        commandKey: input.commandKey,
        subjectId: input.executionSubject.entityId.trim(),
        subjectType: "opportunity",
        targetState: input.targetState,
        contextPayload: input.invocation.inputValues,
        operatorId: input.userId,
        origin: input.invocation.origin,
        overrideReason: input.overrideReason,
    });

    input.guard.markDelegated();

    const run = input.deps?.executeMutation ?? executeMutation;
    const mutationResult = await run(
        {
            supabase: input.supabase,
            orgId: input.orgId,
            departmentId: input.departmentId ?? null,
            workUnitId: input.workUnitId ?? null,
        },
        intent,
        { previewOnly: input.mode === "preview" }
    );

    return {
        mutationResult,
        delegated: true,
        domainKey: "lead_status",
        decisionIntent: intent,
    };
}
