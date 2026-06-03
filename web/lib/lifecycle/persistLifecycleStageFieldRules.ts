/**
 * Persist lifecycle stage field rules to department metadata (builder + operator paths).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    buildLifecycleFieldRulesOverridePatch,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    buildBuilderStageFieldRulesPatch,
    buildBuilderStageFieldRulesResetPatch,
} from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { mergeLifecycleFieldPaletteForBuilderStage } from "@/lib/lifecycle/lifecycleBuilderStagePalette";
import { validateFieldRuleIdsAgainstPalette } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import { deepMergeJsonObjects } from "@/lib/json/deepMergeJsonObjects";

export async function persistLifecycleStageFieldRules(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        stageKey: string;
        fieldRules: LifecycleStageFieldRules;
        existingMetadata: Record<string, unknown>;
    }
): Promise<Record<string, unknown>> {
    const stage = params.stageKey.trim();
    const orgFieldDefs = await loadOrgFieldDefinitionsForLifecycle(supabase, params.orgId);
    const mergedPalette = mergeLifecycleFieldPaletteForBuilderStage(stage, orgFieldDefs);
    const required = validateFieldRuleIdsAgainstPalette(params.fieldRules.required_rule_ids, mergedPalette);
    const recommended = validateFieldRuleIdsAgainstPalette(
        params.fieldRules.recommended_rule_ids,
        mergedPalette
    );
    if (!required || !recommended) {
        throw new Error("Invalid field rules for this stage.");
    }

    const operator = asOperatorStageKey(stage);
    let metadataPatch: Record<string, unknown>;
    if (operator) {
        metadataPatch = buildLifecycleFieldRulesOverridePatch({
            stage: operator,
            required_rule_ids: required,
            recommended_rule_ids: recommended,
            existingMetadata: params.existingMetadata,
            mergedPalette,
        });
    } else {
        metadataPatch = buildBuilderStageFieldRulesPatch({
            builderStageKey: stage,
            required_rule_ids: required,
            recommended_rule_ids: recommended,
            existingMetadata: params.existingMetadata,
        });
    }

    const hasRules = required.length > 0 || recommended.length > 0;
    const builderReset =
        !hasRules && !operator
            ? buildBuilderStageFieldRulesResetPatch({
                  builderStageKey: stage,
                  existingMetadata: params.existingMetadata,
              })
            : null;

    let metadata = params.existingMetadata;
    metadata = deepMergeJsonObjects(metadata, metadataPatch);
    if (builderReset) metadata = deepMergeJsonObjects(metadata, builderReset);

    const { data: updated, error } = await supabase
        .from("departments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", params.departmentId)
        .eq("org_id", params.orgId)
        .select("metadata")
        .single();
    if (error) throw new Error(error.message);
    const next =
        updated?.metadata !== null &&
        typeof updated.metadata === "object" &&
        !Array.isArray(updated.metadata)
            ? (updated.metadata as Record<string, unknown>)
            : metadata;
    return next;
}
