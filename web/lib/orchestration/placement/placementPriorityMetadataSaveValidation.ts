import { parsePlacementPriorityLayerStrict } from "@/lib/orchestration/placement/placementConfigSchema";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";
import {
    effectivePriorityRuleEnabledSet,
    validatePriorityRuleEnabledKeysForProfile,
    validatePriorityRuleOrderForProfile,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";

/**
 * Validates merged work-unit **metadata** after PATCH deep-merge, before persisting.
 * Ensures `placement_priority_v1` is structurally valid, **`profile_id`** is registered when set,
 * and **`profile_revision`** (when provided) matches the preset.
 */
export function validateMergedWorkUnitMetadataForPlacementSave(
    merged: Record<string, unknown>
): { ok: true } | { ok: false; error: string } {
    const parsed = parsePlacementPriorityLayerStrict(merged);
    if (!parsed.ok) {
        const msg = parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
        return { ok: false, error: `Invalid placement_priority_v1 (${msg})` };
    }
    const layer = parsed.value;
    if (layer == null) {
        return { ok: true };
    }

    const pid = typeof layer.profile_id === "string" ? layer.profile_id.trim() : "";
    if (layer.priority_rule_order?.length && !pid) {
        return { ok: false, error: "placement_priority_v1.priority_rule_order requires profile_id." };
    }
    if (layer.enabled === true && !pid) {
        return { ok: false, error: "When placement_priority_v1.enabled is true, profile_id must be set to a registered preset id." };
    }

    if (pid) {
        const preset = getPlacementProfileFromRegistry(pid);
        if (!preset) {
            return {
                ok: false,
                error: `Unknown placement profile_id "${pid}". It must match a preset registered in the codebase.`,
            };
        }
        const rev = typeof layer.profile_revision === "string" ? layer.profile_revision.trim() : "";
        if (rev && rev !== preset.revision) {
            return {
                ok: false,
                error: `placement_priority_v1.profile_revision "${rev}" does not match preset "${pid}" (expected "${preset.revision}").`,
            };
        }
        const pro = layer.priority_rule_order;
        const pEn = layer.priority_rule_enabled_keys;
        if (pEn != null && pEn.length > 0 && (!pro || pro.length === 0)) {
            return { ok: false, error: "placement_priority_v1.priority_rule_enabled_keys requires priority_rule_order." };
        }
        if (pro != null && pro.length > 0) {
            const ro = validatePriorityRuleOrderForProfile(preset, pro);
            if (!ro.ok) {
                return { ok: false, error: ro.error };
            }
            const eff = effectivePriorityRuleEnabledSet(pro, pEn, preset.fallback_bucket_key);
            const ve = validatePriorityRuleEnabledKeysForProfile(preset, pro, eff);
            if (!ve.ok) {
                return { ok: false, error: ve.error };
            }
        }
    }

    return { ok: true };
}
