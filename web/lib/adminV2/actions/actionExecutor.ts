/**
 * Action Runtime executor (Phase 2/3/4).
 *
 * Single server-authoritative entrypoint for running a registered action. Manual UI
 * and BOS-confirmed proposals call this same path. The executor enforces the contract
 * in order: registered → context → payload schema → eligibility → (preview | execute).
 *
 * Mutations themselves are delegated to invariant-owning modules by each registered
 * action's `execute` handler — the executor never writes directly.
 */

import { randomUUID } from "crypto";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import {
    normalizeActionEntityType,
    type ActionEligibility,
    type ActionEntityType,
    type ActionExecutionMode,
    type ActionHandlerDeps,
    type ActionInvocation,
    type ActionPreview,
    type ActionResult,
    type ActionRuntimeContext,
    type RegisteredAction,
} from "@/lib/adminV2/actions/actionTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolveActionEligibilityResponse = {
    actionKey: string;
    registered: boolean;
    eligibility: ActionEligibility;
    preview: ActionPreview | null;
};

function contextError(status: number, error: string, blockerCode: string): ActionResult {
    return {
        ok: false,
        correlationId: randomUUID(),
        status,
        error,
        blockers: [{ code: blockerCode, message: error }],
    };
}

function checkContext(action: RegisteredAction, invocation: ActionInvocation): ActionResult | null {
    const entityType = normalizeActionEntityType(invocation.entityType) as ActionEntityType;
    if (
        action.supportedEntityTypes.length > 0 &&
        !action.supportedEntityTypes.includes(entityType)
    ) {
        return contextError(
            400,
            `Action "${action.actionKey}" does not support entity type "${invocation.entityType}".`,
            "unsupported_entity_type"
        );
    }
    const processKey = invocation.context?.process_key?.trim();
    if (
        action.supportedProcessKeys.length > 0 &&
        processKey &&
        !action.supportedProcessKeys.includes(processKey)
    ) {
        return contextError(
            400,
            `Action "${action.actionKey}" does not support process "${processKey}".`,
            "unsupported_process"
        );
    }
    if (action.requiredContext.requiresEntityId && !invocation.entityId.trim()) {
        return contextError(400, `Action "${action.actionKey}" requires a target record.`, "missing_entity");
    }
    return null;
}

function buildDeps(
    supabase: SupabaseClient,
    ctx: ActionRuntimeContext,
    invocation: ActionInvocation,
    payload: Record<string, unknown>
): ActionHandlerDeps {
    return { supabase, ctx, invocation, payload };
}

/**
 * Resolve eligibility (and optionally a preview) for an action without executing it.
 * Read-only. Unknown keys return a not-registered, ineligible response with a blocker.
 */
export async function resolveActionEligibility(
    supabase: SupabaseClient,
    ctx: ActionRuntimeContext,
    invocation: ActionInvocation,
    opts?: { includePreview?: boolean }
): Promise<ResolveActionEligibilityResponse> {
    const action = getRegisteredAction(invocation.actionKey);
    if (!action) {
        return {
            actionKey: invocation.actionKey,
            registered: false,
            eligibility: {
                eligible: false,
                blockers: [
                    {
                        code: "unregistered_action",
                        message: `Action "${invocation.actionKey}" is not registered with an executable handler.`,
                    },
                ],
                availableTransitions: [],
                requiredInputs: [],
            },
            preview: null,
        };
    }

    const validated = action.validatePayload(invocation.payload);
    const payload = validated.ok ? validated.value : { ...(invocation.payload ?? {}) };
    const deps = buildDeps(supabase, ctx, invocation, payload);

    const eligibility = await action.resolveEligibility(deps);
    const preview = opts?.includePreview ? await action.buildPreview(deps) : null;
    return { actionKey: action.actionKey, registered: true, eligibility, preview };
}

/**
 * Run a registered action. The single execution path for manual + BOS invocations.
 */
export async function runRegisteredAction(
    supabase: SupabaseClient,
    ctx: ActionRuntimeContext,
    invocation: ActionInvocation,
    mode: ActionExecutionMode = "execute"
): Promise<ActionResult> {
    const action = getRegisteredAction(invocation.actionKey);
    if (!action) {
        return contextError(
            404,
            `Action "${invocation.actionKey}" is not registered with an executable handler.`,
            "unregistered_action"
        );
    }

    const contextFail = checkContext(action, invocation);
    if (contextFail) return contextFail;

    const validated = action.validatePayload(invocation.payload);
    if (!validated.ok) {
        return {
            ok: false,
            correlationId: randomUUID(),
            status: 400,
            error: validated.blockers[0]?.message ?? "Invalid payload.",
            blockers: validated.blockers,
        };
    }
    const deps = buildDeps(supabase, ctx, invocation, validated.value);

    if (mode === "preview") {
        const eligibility = await action.resolveEligibility(deps);
        const preview = await action.buildPreview(deps);
        return {
            ok: true,
            correlationId: randomUUID(),
            result: {
                actionKey: action.actionKey,
                entityType: invocation.entityType,
                entityId: invocation.entityId,
                affectedId: null,
                detail: { mode: "preview", eligibility, preview },
            },
        };
    }

    // Execute path: eligibility is the gate. Blockers stop execution with structured errors.
    const eligibility = await action.resolveEligibility(deps);
    if (!eligibility.eligible) {
        return {
            ok: false,
            correlationId: randomUUID(),
            status: 400,
            error: eligibility.blockers[0]?.message ?? "This action is not currently available.",
            blockers: eligibility.blockers,
        };
    }

    return action.execute(deps);
}
