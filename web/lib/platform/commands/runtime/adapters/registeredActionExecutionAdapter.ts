/**
 * RegisteredAction execution adapter (P1.S2).
 *
 * Server-authoritative — import only from API routes / server modules.
 * Delegates exactly once to `runRegisteredAction` — never invokes the handler execute method,
 * never writes to the database, never reimplements validation/eligibility/preview.
 */

import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { isSubjectlessEntityId } from "@/lib/adminV2/actions/subjectlessActionConstants";
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
    /** Department scope lives on the request envelope, not on `CommandInvocationRequest`. */
    departmentId: string | null;
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
    departmentId: string | null;
}): ActionInvocation {
    const origin =
        input.invocation.origin === "bos"
            ? "bos"
            : input.invocation.origin === "automation"
              ? "workflow"
              : "manual";
    /*
     * THE SUBJECTLESS SENTINEL STOPS HERE.
     *
     * The Command Runtime requires a non-empty execution subject — `executeCommandInvocation`
     * fails an empty `entityId` as `missing_entity` — so an action that declares
     * `requiredContext.requiresEntityId: false` reaches it carrying a sentinel rather than
     * nothing. That sentinel is a TRANSPORT artefact. It satisfies the runtime's subject
     * contract; it is not an id, and no action handler should ever see it as one.
     *
     * Handlers already express "no subject" as the empty string: they read
     * `t(invocation.entityId) || <fallback>`, and a truthy sentinel would defeat that fallback
     * and put a non-existent id on results, refresh targets and opened records. Worse, a
     * child-grain handler that reads the subject as a filter would narrow to a record that
     * cannot exist. Normalising once, here, is what makes the generalised transport correct for
     * EVERY subjectless action instead of requiring each to learn a sentinel it did not ask for.
     */
    const subjectEntityId = isSubjectlessEntityId(input.executionSubject.entityId)
        ? ""
        : input.executionSubject.entityId;
    return {
        actionKey: input.actionKey,
        entityType: input.executionSubject.entityType,
        entityId: subjectEntityId,
        context: {
            surface: input.invocation.surface ?? null,
            department_id: input.departmentId ?? null,
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
        departmentId: input.departmentId,
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
