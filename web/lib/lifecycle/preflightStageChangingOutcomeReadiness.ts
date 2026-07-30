/**
 * Preflight transition requirements before a stage-changing outcome commits.
 * Blocks atomically — no work/status/stage/work-lifecycle mutation when requirements fail.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateTransitionRequirementPreflight } from "@/lib/lifecycle/evaluateTransitionRequirementPreflight";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveStageTransitionExecutionTargets } from "@/lib/lifecycle/resolveStageTransitionExecutionTargets";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import type { EffectiveRequirementMissing } from "@/lib/lifecycle/requirementTimingTypes";

export type StageChangingOutcomeReadinessPreflight = {
    blocked: boolean;
    /** Operator-facing copy naming missing requirements. */
    message: string | null;
    blockingRequirements: EffectiveRequirementMissing[];
    destinationStageKey: string | null;
    transitionRef: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

export function formatTransitionReadinessBlockMessage(
    blocking: EffectiveRequirementMissing[],
): string {
    if (!blocking.length) return "Cannot move stage — requirements are incomplete.";
    const labels = [...new Set(blocking.map((b) => b.label.trim()).filter(Boolean))];
    if (labels.length === 1) {
        return `Cannot move stage — ${labels[0]} is required.`;
    }
    return `Cannot move stage — missing required fields: ${labels.join(", ")}.`;
}

/** Collect destination stage keys + transition refs from outcome move_to_stage targets. */
export function resolveStageChangingDestinationsFromOutcome(params: {
    plan: StageOperatingPlanV1;
    outcomeKey: string;
    attemptCount?: number | null;
}): Array<{ destinationStageKey: string; transitionRef: string | null }> {
    const rules = outcomeRulesForKey(params.plan, params.outcomeKey, {
        attemptCount: params.attemptCount ?? null,
    });
    const destinations: Array<{ destinationStageKey: string; transitionRef: string | null }> = [];
    const seen = new Set<string>();

    for (const rule of rules) {
        for (const target of rule.targets) {
            if (target.kind !== "move_to_stage") continue;
            const resolved = resolveStageTransitionExecutionTargets(params.plan, target);
            if (resolved.error) continue;
            for (const executable of resolved.targets) {
                if (executable.kind !== "move_to_stage") continue;
                const stageKey =
                    trimOrNull(executable.stage_key)
                    ?? trimOrNull(target.stage_key);
                if (!stageKey || seen.has(stageKey)) continue;
                seen.add(stageKey);
                destinations.push({
                    destinationStageKey: stageKey,
                    transitionRef: trimOrNull(executable.transition_ref) ?? trimOrNull(target.transition_ref),
                });
            }
        }
    }
    return destinations;
}

export async function preflightStageChangingOutcomeReadiness(params: {
    supabase: SupabaseClient;
    orgId: string;
    plan: StageOperatingPlanV1;
    outcomeKey: string;
    subject: StageOutcomeExecutionSubject;
    departmentMetadata: Record<string, unknown>;
    attemptCount?: number | null;
}): Promise<StageChangingOutcomeReadinessPreflight> {
    const destinations = resolveStageChangingDestinationsFromOutcome({
        plan: params.plan,
        outcomeKey: params.outcomeKey,
        attemptCount: params.attemptCount,
    });

    if (!destinations.length) {
        return {
            blocked: false,
            message: null,
            blockingRequirements: [],
            destinationStageKey: null,
            transitionRef: null,
        };
    }

    const fromStageKey = params.plan.stage_key.trim();
    const allBlocking: EffectiveRequirementMissing[] = [];
    let firstDestination: string | null = null;
    let firstTransition: string | null = null;

    for (const dest of destinations) {
        const preflight = await evaluateTransitionRequirementPreflight({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: params.subject.opportunity_id,
            departmentMetadata: params.departmentMetadata,
            fromBuilderStageKey: fromStageKey,
            toBuilderStageKey: dest.destinationStageKey,
            previousStatusKey: fromStageKey,
            nextStatusKey: dest.transitionRef ?? dest.destinationStageKey,
            nextStageLabel: dest.destinationStageKey,
            customerMemberId: params.subject.customer_member_id ?? null,
            opportunityCustomerMemberId: params.subject.opportunity_customer_member_id ?? null,
        });
        if (preflight.blockingRequirements.length) {
            if (!firstDestination) {
                firstDestination = dest.destinationStageKey;
                firstTransition = dest.transitionRef;
            }
            allBlocking.push(...preflight.blockingRequirements);
        }
    }

    if (!allBlocking.length) {
        return {
            blocked: false,
            message: null,
            blockingRequirements: [],
            destinationStageKey: firstDestination,
            transitionRef: firstTransition,
        };
    }

    // Dedupe by requirement key (+ scope) — EffectiveRequirementMissing has no ruleId.
    const byKey = new Map<string, EffectiveRequirementMissing>();
    for (const row of allBlocking) {
        const dedupeKey = `${row.scope}::${row.key}`;
        if (!byKey.has(dedupeKey)) byKey.set(dedupeKey, row);
    }
    const blocking = [...byKey.values()];

    return {
        blocked: true,
        message: formatTransitionReadinessBlockMessage(blocking),
        blockingRequirements: blocking,
        destinationStageKey: firstDestination,
        transitionRef: firstTransition,
    };
}
