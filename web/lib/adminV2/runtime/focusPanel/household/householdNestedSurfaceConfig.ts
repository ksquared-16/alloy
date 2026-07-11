/**
 * Narrow adapter: PUBLISHED Household Surface config → runtime household field layout.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    HOUSEHOLD_SURFACE_ID,
    selectedFieldKeys,
    isNestedGroupEnabled,
    fieldVisibilityForNestedGroup,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    reconcileIdentityNestedConfigFromDocMetadata,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    HOUSEHOLD_DEFAULT_SECTION_ORDER,
    sortByNestedSectionOrder,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";

export function readHouseholdNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    if (!doc) return null;
    return reconcileIdentityNestedConfigFromDocMetadata(HOUSEHOLD_SURFACE_ID, doc.metadata as {
        nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined>;
    });
}

export function householdGroupFieldKeys(
    config: NestedSurfaceConfig | null,
    groupKey: string,
    options?: { includeHidden?: boolean },
): string[] {
    if (!config) return [];
    const alwaysOn =
        (HOUSEHOLD_REQUIRED_DRILL_IN_KEYS as readonly string[]).includes(groupKey)
        || (HOUSEHOLD_FIXED_GROUP_KEYS as readonly string[]).includes(groupKey)
        || groupKey === "other_parent_guardian";
    if (!alwaysOn && !isNestedGroupEnabled(config, groupKey)) return [];
    const keys = selectedFieldKeys(config, groupKey);
    if (options?.includeHidden) return keys;
    return keys.filter((fieldKey) =>
        fieldShouldRender(fieldVisibilityForNestedGroup(config, groupKey, fieldKey)),
    );
}

export function householdContactEditFieldPolicy(
    config: NestedSurfaceConfig | null,
    fieldKey: string,
): SurfaceFieldVisibility {
    if (!config) return "editable";
    return fieldVisibilityForNestedGroup(config, "contact_edit", fieldKey);
}

/** Fixed household drill-in groups that always appear when config is published. */
export const HOUSEHOLD_FIXED_GROUP_KEYS = [
    "primary_contact",
    "household_members",
    "children",
] as const;

/** Required runtime sections — never hidden by saved publish config. */
export const HOUSEHOLD_REQUIRED_DRILL_IN_KEYS = [
    "primary_contact",
    "children",
] as const;

type HouseholdDrillInGroupLike = {
    key: string;
    count: number;
    addressLine?: string | null;
};

/** Whether a built household group should render in drill-in for the published config. */
export function shouldShowHouseholdDrillInGroup(
    group: HouseholdDrillInGroupLike,
    config: NestedSurfaceConfig | null,
): boolean {
    if ((HOUSEHOLD_REQUIRED_DRILL_IN_KEYS as readonly string[]).includes(group.key)) {
        return true;
    }
    if ((HOUSEHOLD_FIXED_GROUP_KEYS as readonly string[]).includes(group.key)) {
        return true;
    }
    if (group.key === "other_parent_guardian") {
        return group.count > 0;
    }
    if (!config) {
        return group.count > 0 || Boolean(group.addressLine);
    }
    if (group.key === "emergency_contacts") {
        return householdEmergencySectionEnabled(config) || group.count > 0;
    }
    if (group.count > 0 || group.addressLine) {
        return true;
    }
    return isNestedGroupEnabled(config, group.key);
}

/** Order + filter household drill-in groups for runtime/composer parity. */
export function householdDrillInGroups<T extends HouseholdDrillInGroupLike>(
    builtGroups: T[],
    config: NestedSurfaceConfig | null,
): T[] {
    const visible = builtGroups.filter((g) => shouldShowHouseholdDrillInGroup(g, config));
    return sortByNestedSectionOrder(visible, config, HOUSEHOLD_DEFAULT_SECTION_ORDER);
}

export function householdEmergencySectionEnabled(config: NestedSurfaceConfig | null): boolean {
    if (!config) return false;
    return isNestedGroupEnabled(config, "emergency_contacts");
}
