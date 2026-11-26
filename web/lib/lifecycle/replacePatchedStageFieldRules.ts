/**
 * After deep-merging a lifecycle requirements PATCH into department metadata,
 * replace saved stage `field_rules` (and builder-stage rows) from the patch.
 *
 * Deep merge would otherwise keep stale `rule_meta_v1.by_rule_id` entries when
 * an operator clears timing back to the legacy default (omit from metadata).
 */

import { LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function replacePatchedStageFieldRules(
    mergedMetadata: Record<string, unknown>,
    metadataPatch: Record<string, unknown>,
): Record<string, unknown> {
    const patchProg = metadataPatch[LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY];
    const mergedProg = mergedMetadata[LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY];
    if (isPlainObject(patchProg) && isPlainObject(mergedProg)) {
        const patchStages = patchProg.stages;
        const mergedStages = mergedProg.stages;
        if (isPlainObject(patchStages) && isPlainObject(mergedStages)) {
            for (const [stageKey, stageVal] of Object.entries(patchStages)) {
                if (!isPlainObject(stageVal) || !("field_rules" in stageVal)) continue;
                const existing = mergedStages[stageKey];
                if (!isPlainObject(existing)) continue;
                mergedStages[stageKey] = {
                    ...existing,
                    field_rules: stageVal.field_rules,
                };
            }
        }
    }

    const patchBuilder = metadataPatch[LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY];
    const mergedBuilder = mergedMetadata[LIFECYCLE_BUILDER_STAGE_FIELD_RULES_METADATA_KEY];
    if (isPlainObject(patchBuilder) && isPlainObject(mergedBuilder)) {
        const patchByKey = patchBuilder.by_stage_key;
        const mergedByKey = mergedBuilder.by_stage_key;
        if (isPlainObject(patchByKey) && isPlainObject(mergedByKey)) {
            for (const [stageKey, row] of Object.entries(patchByKey)) {
                // Full row replace — authoritative dual-write including absent rule_meta_v1.
                mergedByKey[stageKey] = row;
            }
        }
    }

    return mergedMetadata;
}
