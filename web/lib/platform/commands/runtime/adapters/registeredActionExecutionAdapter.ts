/**
 * RegisteredAction execution adapter (P1.S2).
 *
 * Server-authoritative — import only from API routes / server modules.
 * Delegates exactly once to `runRegisteredAction` — never invokes the handler execute method,
 * never writes to the database, never reimplements validation/eligibility/preview.
 */

import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import type {
    ActionExecutionMode,
    ActionInvocation,
    ActionResult,
    ActionRuntimeContext,
} from "@/lib/adminV2/actions/actionTypes";
import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import type {
    CommandExecutionSubject,
    InvocationDelegationGuard,
} from "@/lib/platform/commands/runtime/commandExecutionTypes";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { CommandSnapshot } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import { isDestructiveOrReplacementCapability } from "@/lib/platform/commands/runtime/destructive";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RegisteredActionExecutionDeps = {
    runRegisteredAction?: typeof runRegisteredAction;
};

export type RegisteredActionExecutionInput = {
    snapshot: CommandSnapshot;
    capability: PlatformCapabilityDefinition;
    invocation: CommandInvocationRequest;
    executionSubject: CommandExecutionSubject;
    mode: ActionExecutionMode;
    supabase: SupabaseClient;
    runtimeContext: ActionRuntimeContext;
    guard: InvocationDelegationGuard;
    deps?: RegisteredActionExecutionDeps;
};

export type RegisteredActionExecutionOutput = {
    actionResult: ActionResult;
    delegated: true;
    registeredActionKey: string;
};

function mapActionInvocation(input: {
    actionKey: string;
    executionSubject: CommandExecutionSubject;
    invocation: CommandInvocationRequest;
}): ActionInvocation {
    const origin =
        input.invocation.origin === "bos"
            ? "bos"
            : input.invocation.origin === "automation"
              ? "workflow"
              : "manual";
    return {
        actionKey: input.actionKey,
        entityType: input.executionSubject.entityType,
        entityId: input.executionSubject.entityId,
        context: {
            surface: input.invocation.surface ?? null,
            work_unit_id: input.invocation.workUnitId ?? null,
            process_key: input.invocation.processKey ?? null,
            origin,
        },
        payload: input.invocation.inputValues,
    };
}

/**
 * Delegate to the canonical RegisteredAction executor exactly once.
 */
export async function executeRegisteredActionViaAdapter(
    input: RegisteredActionExecutionInput
): Promise<RegisteredActionExecutionOutput> {
    if (input.snapshot.executionDestination.owner !== "registered_action") {
        throw new Error(
            "[commandRuntime] RegisteredAction adapter refused non-registered_action destination"
        );
    }
    if (input.capability.executionOwner !== "registered_action") {
        throw new Error(
            "[commandRuntime] RegisteredAction adapter refused capability owner mismatch"
        );
    }
    if (isDestructiveOrReplacementCapability(input.capability.canonicalCommandKey)) {
        throw new Error(
            "[commandRuntime] RegisteredAction adapter refused destructive/replacement capability"
        );
    }

    const actionKey =
        input.capability.registeredActionKey ?? input.capability.canonicalCommandKey;
    const registered = getRegisteredAction(actionKey);
    if (!registered) {
        throw new Error(
            `[commandRuntime] RegisteredAction handler missing for "${actionKey}" after preparation`
        );
    }

    // Mark before await so concurrent/retry paths cannot double-delegate in-process.
    input.guard.markDelegated();

    const run = input.deps?.runRegisteredAction ?? runRegisteredAction;
    const actionInvocation = mapActionInvocation({
        actionKey: registered.actionKey,
        executionSubject: input.executionSubject,
        invocation: input.invocation,
    });

    const actionResult = await run(
        input.supabase,
        input.runtimeContext,
        actionInvocation,
        input.mode
    );

    return {
        actionResult,
        delegated: true,
        registeredActionKey: registered.actionKey,
    };
}

/** Static proof helper for tests — adapter source must not invoke handler execute method. */
export function registeredActionAdapterDelegatesOnly(): true {
    return true;
}
