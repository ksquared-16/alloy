import { parsePlacementPriorityLayerStrict } from "@/lib/orchestration/placement/placementConfigSchema";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";

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
    }

    return { ok: true };
}
