import { householdAuthoringGroupKey } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { presentationGroupKeyForInstance } from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import {
    CHILDREN_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
    resolveNestedGroupConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

const DEFAULT_GROUP_BY_SURFACE: Record<string, string> = {
    [HOUSEHOLD_SURFACE_ID]: "primary_contact",
    [CHILDREN_SURFACE_ID]: "roster",
};

/** Effective Builder section key — preserves selection or falls back to surface default. */
export function resolveIdentityBuilderSectionKey(
    surfaceId: string,
    selectedGroupKey: string | null,
): string | null {
    if (selectedGroupKey) return selectedGroupKey;
    return DEFAULT_GROUP_BY_SURFACE[surfaceId] ?? null;
}

/** Field-authoring group key for nested layout panels (Parent/Guardian role template, etc.). */
export function resolveIdentityAuthoringGroupKey(
    surfaceId: string,
    config: NestedSurfaceConfig,
    sectionKey: string,
): string {
    if (surfaceId === HOUSEHOLD_SURFACE_ID) {
        const presentationKey = presentationGroupKeyForInstance(config, sectionKey);
        return householdAuthoringGroupKey(presentationKey);
    }
    return sectionKey;
}

export function resolveIdentityBuilderGroupConfig(
    config: NestedSurfaceConfig,
    surfaceId: string,
    selectedGroupKey: string | null,
) {
    const sectionKey = resolveIdentityBuilderSectionKey(surfaceId, selectedGroupKey);
    if (!sectionKey) return { sectionKey: null, groupConfig: null, authoringGroupKey: null };
    const groupConfig = resolveNestedGroupConfig(config, sectionKey);
    const authoringGroupKey = resolveIdentityAuthoringGroupKey(surfaceId, config, sectionKey);
    return { sectionKey, groupConfig, authoringGroupKey };
}
