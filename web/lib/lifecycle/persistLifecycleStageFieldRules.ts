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
import { filterFieldRuleIdsToPalette } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import { deepMergeJsonObjects } from "@/lib/json/deepMergeJsonObjects";
import {
    parseRuleLevelsV1,
    type LifecycleStageFieldRulesStored,
} from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import { parseRuleMetaV1 } from "@/lib/lifecycle/requirementTimingMeta";
import { replacePatchedStageFieldRules } from "@/lib/lifecycle/replacePatchedStageFieldRules";
import { mergeCategoryFDepartmentMetadata } from "@/lib/lifecycle/mergeCategoryFDepartmentMetadata";

export async function persistLifecycleStageFieldRules(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        stageKey: string;
        fieldRules: LifecycleStageFieldRules | LifecycleStageFieldRulesStored;
        existingMetadata: Record<string, unknown>;
    }
): Promise<Record<string, unknown>> {
    const stage = params.stageKey.trim();
    const orgFieldDefs = await loadOrgFieldDefinitionsForLifecycle(supabase, params.orgId);
    const mergedPalette = mergeLifecycleFieldPaletteForBuilderStage(stage, orgFieldDefs);
    const required = filterFieldRuleIdsToPalette(params.fieldRules.required_rule_ids, mergedPalette);
    const recommended = filterFieldRuleIdsToPalette(params.fieldRules.recommended_rule_ids, mergedPalette);

    const explicit_rule_levels_v1 = parseRuleLevelsV1(
        "rule_levels_v1" in params.fieldRules ? params.fieldRules.rule_levels_v1 : undefined
    );
    const explicit_rule_meta_v1 = parseRuleMetaV1(
        "rule_meta_v1" in params.fieldRules ? params.fieldRules.rule_meta_v1 : undefined
    );

    const operator = asOperatorStageKey(stage);
    const builderPatch = buildBuilderStageFieldRulesPatch({
        builderStageKey: stage,
        required_rule_ids: required,
        recommended_rule_ids: recommended,
        existingMetadata: params.existingMetadata,
        mergedPalette,
        explicit_rule_levels_v1,
        explicit_rule_meta_v1,
    });
    let metadataPatch: Record<string, unknown>;
    if (operator) {
        // Dual-write: progression is the operator source of truth; keep builder_stage
        // in sync so Create Lead / readiness cannot read a stale shadow row.
        metadataPatch = deepMergeJsonObjects(
            buildLifecycleFieldRulesOverridePatch({
                stage: operator,
                required_rule_ids: required,
                recommended_rule_ids: recommended,
                existingMetadata: params.existingMetadata,
                mergedPalette,
                explicit_rule_levels_v1,
                explicit_rule_meta_v1,
            }),
            builderPatch,
        );
    } else {
        metadataPatch = builderPatch;
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
    metadata = replacePatchedStageFieldRules(
        deepMergeJsonObjects(metadata, metadataPatch),
        metadataPatch,
    );
    if (builderReset) metadata = deepMergeJsonObjects(metadata, builderReset);
    metadata = mergeCategoryFDepartmentMetadata(params.existingMetadata, metadata);

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
