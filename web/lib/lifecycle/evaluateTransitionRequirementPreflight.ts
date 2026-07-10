/**
 * Evaluate explicit stage_exit requirements during transition preflight.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { buildOpportunityCompletionContextFromDb } from "@/lib/completion/loadRecordForEffectiveRequirements";
import { canonicalOperatorStageForStatusKey } from "@/lib/lifecycle/enrollmentOperatorStage";
import { effectiveFieldRulesStoredForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { evaluateRequirementsForTransition } from "@/lib/lifecycle/requirementTimingEvaluation";
import type { EffectiveRequirementMissing } from "@/lib/lifecycle/requirementTimingTypes";

export type TransitionRequirementPreflight = {
    missingRequirements: EffectiveRequirementMissing[];
    blockingRequirements: EffectiveRequirementMissing[];
};

export async function evaluateTransitionRequirementPreflight(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    departmentMetadata: Record<string, unknown>;
    fromBuilderStageKey: string | null;
    toBuilderStageKey: string | null;
    previousStatusKey: string | null;
    nextStatusKey: string;
    nextStageLabel?: string | null;
}): Promise<TransitionRequirementPreflight> {
    const empty: TransitionRequirementPreflight = {
        missingRequirements: [],
        blockingRequirements: [],
    };

    const fromStageKey = params.fromBuilderStageKey?.trim() ?? "";
    const toStageKey = params.toBuilderStageKey?.trim() ?? params.nextStatusKey.trim();
    if (!fromStageKey || !toStageKey) return empty;

    const operatorStage: LifecycleOperatorStage | null =
        canonicalOperatorStageForStatusKey(fromStageKey)
        ?? canonicalOperatorStageForStatusKey(params.previousStatusKey ?? "")
        ?? "lead";

    const stored = effectiveFieldRulesStoredForBuilderStage(
        fromStageKey,
        params.departmentMetadata,
        operatorStage,
    );
    const ruleMeta = stored.rule_meta_v1 ?? null;

    if (!ruleMeta?.by_rule_id || !Object.keys(ruleMeta.by_rule_id).length) {
        return empty;
    }

    const ctx = await buildOpportunityCompletionContextFromDb(params.supabase, {
        orgId: params.orgId,
        opportunityId: params.opportunityId,
        phase: "status_change",
        status_from: params.previousStatusKey,
        status_to: params.nextStatusKey,
    });
    if (!ctx) return empty;

    ctx.surface = "stage_transition_preflight";
    ctx.related = {
        ...ctx.related,
        department_metadata: params.departmentMetadata,
    };

    const evaluation = evaluateRequirementsForTransition({
        ctx,
        operatorStage,
        publishedRules: stored,
        ruleMeta,
        fromStageKey,
        toStageKey,
        transitionKey: params.nextStatusKey,
        toStageLabel: params.nextStageLabel,
    });

    return {
        missingRequirements: evaluation.missing,
        blockingRequirements: evaluation.blocking,
    };
}
