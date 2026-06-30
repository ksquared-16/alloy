/**
 * Mutation Runtime — canonical four-phase executor.
 *
 * Phases: Resolve → Evaluate → Preview → Commit
 *
 * Every operational mutation an operator performs goes through this runtime.
 * Domain-specific logic (which table, which RPC) lives in the domain handler.
 * The runtime owns phase orchestration; domains own data access.
 *
 * Doctrine: docs/platform/modules/operational-mutation-platform.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { getDomainHandlerForCommand } from "@/lib/mutations/domainRegistry";
import type { ResolvedState } from "@/lib/mutations/domainRegistry";
import type {
    DecisionIntent,
    EvaluationResult,
    EvaluationWarning,
    MutationPreview,
    MutationResult,
    SideEffectSpec,
} from "@/lib/mutations/types";

export type { ResolvedState };

export type MutationRuntimeContext = {
    supabase: SupabaseClient;
    orgId: string;
    departmentId?: string | null;
    workUnitId?: string | null;
};

// ─── Phase 1: Resolve ────────────────────────────────────────────────────────

export async function resolvePhase(
    ctx: MutationRuntimeContext,
    intent: DecisionIntent
): Promise<{ ok: true; resolved: ResolvedState } | { ok: false; error: string }> {
    const handler = getDomainHandlerForCommand(intent.commandKey);
    if (!handler) {
        return { ok: false, error: `Unknown command: ${intent.commandKey}` };
    }

    const result = await handler.resolve({ supabase: ctx.supabase, orgId: ctx.orgId }, intent);
    if ("error" in result) {
        return { ok: false, error: result.error };
    }

    return {
        ok: true,
        resolved: {
            domain: handler.domain,
            entityType: handler.entityType,
            currentState: result.currentState,
            availableTargets: result.availableTargets,
        },
    };
}

// ─── Phase 2: Evaluate ───────────────────────────────────────────────────────

export async function evaluatePhase(
    ctx: MutationRuntimeContext,
    intent: DecisionIntent,
    resolved: ResolvedState
): Promise<EvaluationResult> {
    const warnings: EvaluationWarning[] = [];

    // 2a. Structural validity — does target status exist for this org?
    const statusCheck = await assertAllowedStatusKey(
        ctx.supabase,
        ctx.orgId,
        resolved.entityType,
        intent.targetState
    );
    if (!statusCheck.ok) {
        return {
            ok: false,
            blocked: true,
            reason: statusCheck.message,
            code: "invalid_target_status",
        };
    }

    // 2b. Transition rules
    const transitionCheck = await validateStatusTransition({
        supabase: ctx.supabase,
        orgId: ctx.orgId,
        entityType: resolved.entityType,
        entityId: intent.subjectId,
        departmentId: ctx.departmentId,
        workUnitId: ctx.workUnitId,
        actionKey: intent.commandKey,
        fromStatusKey: resolved.currentState,
        toStatusKey: intent.targetState,
        payload: intent.contextPayload,
    });
    if (!transitionCheck.ok) {
        return {
            ok: false,
            blocked: true,
            reason: transitionCheck.message,
            code: "transition_blocked",
        };
    }

    // 2c. No-op guard
    if (resolved.currentState === intent.targetState) {
        return {
            ok: false,
            blocked: true,
            reason: "Record is already in this status.",
            code: "no_state_change",
        };
    }

    return { ok: true, warnings };
}

// ─── Phase 3: Preview ────────────────────────────────────────────────────────

export function buildPreview(
    intent: DecisionIntent,
    resolved: ResolvedState,
    warnings: EvaluationWarning[],
    readinessGaps: string[] = []
): MutationPreview {
    const sideEffects: SideEffectSpec[] = [];
    return {
        commandKey: intent.commandKey,
        domain: intent.domain,
        subjectId: intent.subjectId,
        subjectType: intent.subjectType,
        previousState: resolved.currentState,
        targetState: intent.targetState,
        warnings,
        readinessGaps,
        sideEffects,
    };
}

// ─── Phase 4: Commit ─────────────────────────────────────────────────────────

export async function commitPhase(
    ctx: MutationRuntimeContext,
    intent: DecisionIntent,
    resolved: ResolvedState,
    warnings: EvaluationWarning[]
): Promise<MutationResult> {
    const handler = getDomainHandlerForCommand(intent.commandKey);
    if (!handler) {
        return {
            status: "blocked",
            commandKey: intent.commandKey,
            domain: intent.domain,
            subjectId: intent.subjectId,
            blockedReason: `No handler for command: ${intent.commandKey}`,
            blockedCode: "resolve_failed",
        };
    }
    return handler.commit(ctx, intent, resolved, warnings);
}

// ─── Main entry point ────────────────────────────────────────────────────────

export type MutationRuntimeOptions = {
    previewOnly?: boolean;
};

export async function executeMutation(
    ctx: MutationRuntimeContext,
    intent: DecisionIntent,
    opts: MutationRuntimeOptions = {}
): Promise<MutationResult> {
    // Phase 1: Resolve
    const resolveResult = await resolvePhase(ctx, intent);
    if (!resolveResult.ok) {
        return {
            status: "blocked",
            commandKey: intent.commandKey,
            domain: intent.domain,
            subjectId: intent.subjectId,
            blockedReason: resolveResult.error,
            blockedCode: "resolve_failed",
        };
    }

    // Phase 2: Evaluate
    const evalResult = await evaluatePhase(ctx, intent, resolveResult.resolved);
    if (!evalResult.ok) {
        return {
            status: "blocked",
            commandKey: intent.commandKey,
            domain: intent.domain,
            subjectId: intent.subjectId,
            blockedReason: evalResult.reason,
            blockedCode: evalResult.code,
        };
    }

    // Phase 2b: Optional domain-specific readiness check
    const handler = getDomainHandlerForCommand(intent.commandKey);
    let readinessGaps: string[] = [];
    if (handler?.evaluateReadiness) {
        const gaps = await handler.evaluateReadiness(
            { supabase: ctx.supabase, orgId: ctx.orgId },
            intent,
            resolveResult.resolved
        );
        readinessGaps = gaps.map((g) => g.message);
    }

    // Phase 3: Preview
    const preview = buildPreview(intent, resolveResult.resolved, evalResult.warnings, readinessGaps);
    if (opts.previewOnly) {
        return { status: "previewed", preview };
    }

    // Block commit if readiness gaps exist
    if (readinessGaps.length > 0) {
        return {
            status: "blocked",
            commandKey: intent.commandKey,
            domain: intent.domain,
            subjectId: intent.subjectId,
            blockedReason: readinessGaps[0] ?? "Required information missing.",
            blockedCode: "readiness_blocked",
        };
    }

    // Phase 4: Commit
    return commitPhase(ctx, intent, resolveResult.resolved, evalResult.warnings);
}
