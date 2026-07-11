/**
 * Canonical compatibility adapters for identity nested-surface configuration.
 *
 * - `child_surface` → `children_surface`
 * - `fieldModes` → `fieldPolicies`
 * - `selectedFieldKeys` without placements → stable default placements
 * - `displayOptions` → avatar/badge section behavior
 */

import type { NestedSurfaceFieldMode } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import {
    defaultNestedSurfaceConfig,
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
    type NestedSurfaceGroupConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    normalizeFieldVisibility,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    generateDefaultIdentityFieldPlacements,
} from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import type {
    IdentitySectionConfig,
    IdentitySurfaceConfig,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

export const CHILD_SURFACE_COMPAT_ID = "child_surface" as const;
export const CHILDREN_SURFACE_CANONICAL_ID = "children_surface" as const;
export const HOUSEHOLD_SURFACE_CANONICAL_ID = "household_surface" as const;
export const HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID = "household_contact_surface" as const;

const LEGACY_CONTACT_TO_CANONICAL_FIELD: Record<string, string> = {
    "person.first_name": "contact.first_name",
    "person.last_name": "contact.last_name",
    "person.email": "contact.email",
    "person.phone": "contact.phone",
};

const HOUSEHOLD_SECTION_SOURCES: Record<string, IdentitySectionConfig["source"]> = {
    primary_contact: { type: "relationship_role", roleKeys: ["primary_contact", "primary"] },
    other_parent_guardian: { type: "relationship_role", roleKeys: ["parent", "guardian"] },
    household_members: { type: "relationship_role", roleKeys: ["additional", "contact"] },
    children: { type: "related_entity", entityType: "child" },
    emergency_contacts: { type: "relationship_role", roleKeys: ["emergency_contact"] },
    authorized_pickups: { type: "relationship_role", roleKeys: ["authorized_pickup"] },
    billing_contact: { type: "relationship_role", roleKeys: ["billing_contact"] },
};

function fieldModeToPolicy(mode: NestedSurfaceFieldMode | undefined): SurfaceFieldVisibility | undefined {
    if (!mode) return undefined;
    if (mode.displayed === false) return "hidden";
    if (mode.editable === true) return "editable";
    if (mode.editable === false) return "read-only";
    return undefined;
}

/** Reconcile legacy `fieldModes` into canonical `fieldPolicies` without discarding layouts. */
export function reconcileFieldModesToPolicies(group: NestedSurfaceGroupConfig): NestedSurfaceGroupConfig {
    const policies = { ...(group.fieldPolicies ?? {}) };
    const modes = group.fieldModes ?? {};
    for (const [fieldRef, mode] of Object.entries(modes)) {
        if (policies[fieldRef]) continue;
        const mapped = fieldModeToPolicy(mode);
        if (mapped) policies[fieldRef] = mapped;
    }
    return Object.keys(policies).length > 0 ? { ...group, fieldPolicies: policies } : group;
}

/**
 * Adapt legacy `household_contact_surface.contact_fields` into the canonical
 * `household_surface.contact_edit` group. Canonical values always win when both
 * paths are published.
 */
export function adaptHouseholdContactSurfaceToHouseholdSurface(
    legacyContactSurface: NestedSurfaceConfig | null,
    householdSurface: NestedSurfaceConfig | null,
): NestedSurfaceConfig {
    const canonical = reconcileNestedSurfaceConfig(
        HOUSEHOLD_SURFACE_CANONICAL_ID,
        householdSurface ?? defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_CANONICAL_ID),
    );
    const legacyGroup = legacyContactSurface?.groups.find((group) => group.key === "contact_fields");
    if (!legacyGroup) return canonical;

    const canonicalGroup = canonical.groups.find((group) => group.key === "contact_edit");
    if (!canonicalGroup) return canonical;
    const canonicalWasPublished = householdSurface?.groups.some((group) => group.key === "contact_edit") ?? false;

    const selectedFieldKeys = legacyGroup.selectedFieldKeys
        .map((fieldRef) => LEGACY_CONTACT_TO_CANONICAL_FIELD[fieldRef])
        .filter((fieldRef): fieldRef is string => Boolean(fieldRef));
    const legacyPolicies: Record<string, SurfaceFieldVisibility> = {};
    const legacyLabels: Record<string, string> = {};
    const legacyWidths: NestedSurfaceGroupConfig["fieldLayoutWidths"] = {};
    for (const [legacyRef, canonicalRef] of Object.entries(LEGACY_CONTACT_TO_CANONICAL_FIELD)) {
        const policy = fieldModeToPolicy(legacyGroup.fieldModes?.[legacyRef])
            ?? legacyGroup.fieldPolicies?.[legacyRef];
        if (policy) legacyPolicies[canonicalRef] = policy;
        const label = legacyGroup.fieldLabels?.[legacyRef];
        if (label) legacyLabels[canonicalRef] = label;
        const width = legacyGroup.fieldLayoutWidths?.[legacyRef];
        if (width) legacyWidths[canonicalRef] = width;
    }

    const merged: NestedSurfaceGroupConfig = {
        ...canonicalGroup,
        selectedFieldKeys:
            canonicalWasPublished
                ? canonicalGroup.selectedFieldKeys
                : selectedFieldKeys.length > 0
                    ? selectedFieldKeys
                    : canonicalGroup.selectedFieldKeys,
        fieldPolicies: { ...legacyPolicies, ...(canonicalGroup.fieldPolicies ?? {}) },
        fieldLabels: { ...legacyLabels, ...(canonicalGroup.fieldLabels ?? {}) },
        fieldLayoutWidths: { ...legacyWidths, ...(canonicalGroup.fieldLayoutWidths ?? {}) },
    };
    return {
        ...canonical,
        groups: canonical.groups.map((group) =>
            group.key === "contact_edit"
                ? {
                      ...merged,
                      fieldPlacements: generateDefaultIdentityFieldPlacements(merged),
                  }
                : group,
        ),
    };
}

/** @deprecated Import from identityFieldPlacement.ts in new code. */
export const generateDefaultPlacementsForGroup = generateDefaultIdentityFieldPlacements;

/** Adapt legacy `child_surface` config onto canonical `children_surface` shape. */
export function adaptChildSurfaceToChildrenSurface(
    childSurface: NestedSurfaceConfig | null,
    childrenSurface: NestedSurfaceConfig | null,
): NestedSurfaceConfig {
    const canonical = reconcileNestedSurfaceConfig(
        CHILDREN_SURFACE_CANONICAL_ID,
        childrenSurface ?? defaultNestedSurfaceConfig(CHILDREN_SURFACE_CANONICAL_ID),
    );
    if (!childSurface) return canonical;

    const childByKey = new Map(childSurface.groups.map((group) => [group.key, group]));
    const mergedGroups = canonical.groups.map((group) => {
        const legacy = childByKey.get(group.key);
        if (!legacy) return reconcileFieldModesToPolicies(group);
        const selectedFieldKeys =
            legacy.selectedFieldKeys.length > 0 ? [...legacy.selectedFieldKeys] : group.selectedFieldKeys;
        const merged = reconcileFieldModesToPolicies({
            ...group,
            selectedFieldKeys,
            expandedFieldKeys: legacy.expandedFieldKeys ?? group.expandedFieldKeys,
            fieldPlacements: legacy.fieldPlacements ?? group.fieldPlacements,
            fieldPolicies: { ...group.fieldPolicies, ...legacy.fieldPolicies },
            fieldLabels: { ...group.fieldLabels, ...legacy.fieldLabels },
            fieldLayoutWidths: { ...group.fieldLayoutWidths, ...legacy.fieldLayoutWidths },
            fieldModes: { ...group.fieldModes, ...legacy.fieldModes },
            displayOptions: legacy.displayOptions ?? group.displayOptions,
            enabled: legacy.enabled ?? group.enabled,
        });
        return {
            ...merged,
            fieldPlacements: generateDefaultPlacementsForGroup(merged),
        };
    });

    return { ...canonical, groups: mergedGroups };
}

function avatarFromDisplayOptions(
    group: NestedSurfaceGroupConfig,
): IdentitySectionConfig["avatar"] {
    const showAvatar = group.displayOptions?.showAvatar !== false;
    return {
        visible: showAvatar,
        source: "photo_or_initials",
    };
}

function badgeFromDisplayOptions(
    group: NestedSurfaceGroupConfig,
): IdentitySectionConfig["badge"] {
    if (group.key === "primary_contact") {
        return { source: "relationship_label", fallbackLabel: "Primary" };
    }
    return { source: "relationship_label" };
}

/** Project one nested group into shared identity section config. */
export function identitySectionFromNestedGroup(
    surfaceId: string,
    group: NestedSurfaceGroupConfig,
    label: string,
): IdentitySectionConfig {
    const reconciled = reconcileFieldModesToPolicies(group);
    const placements = generateDefaultPlacementsForGroup(reconciled);
    const summaryFields = placements.filter((placement) => placement.tier === "summary");
    const expandedFields = placements.filter((placement) => placement.tier === "expanded");

    return {
        key: group.key,
        label: group.sectionLabel?.trim() || label,
        source: HOUSEHOLD_SECTION_SOURCES[group.key] ?? { type: "record" },
        allowMultiple: group.key !== "primary_contact",
        avatar: avatarFromDisplayOptions(reconciled),
        badge: badgeFromDisplayOptions(reconciled),
        summaryFields,
        expandedFields,
        emptyState: group.enabled === false ? { label: `No ${label.toLowerCase()} configured` } : undefined,
    };
}

/** Build shared identity surface config from a nested surface config. */
export function identitySurfaceFromNestedConfig(
    config: NestedSurfaceConfig,
    groupLabels?: Record<string, string>,
): IdentitySurfaceConfig {
    const sections = config.groups
        .filter((group) => group.key !== "contact_edit" && group.key !== "child_edit")
        .map((group) =>
            identitySectionFromNestedGroup(
                config.surfaceId,
                group,
                groupLabels?.[group.key] ?? group.sectionLabel?.trim() ?? group.key,
            ),
        );

    return {
        surfaceKey: config.surfaceId,
        sections,
    };
}

/** Normalize loaded nested config through identity compatibility adapters. */
export function reconcileIdentityNestedConfig(
    surfaceId: string,
    loaded: NestedSurfaceConfig | null,
    legacyChildSurface?: NestedSurfaceConfig | null,
): NestedSurfaceConfig {
    let config = reconcileNestedSurfaceConfig(surfaceId, loaded);
    config = {
        ...config,
        groups: config.groups.map((group) => {
            const reconciled = reconcileFieldModesToPolicies(group);
            const placements = generateDefaultPlacementsForGroup(reconciled);
            return placements.length > 0 ? { ...reconciled, fieldPlacements: placements } : reconciled;
        }),
    };
    if (surfaceId === CHILDREN_SURFACE_CANONICAL_ID && legacyChildSurface) {
        config = adaptChildSurfaceToChildrenSurface(legacyChildSurface, config);
    }
    return config;
}

/** Resolve effective field policy with edit-surface inheritance (`child_edit` / `contact_edit`). */
export function resolveIdentityFieldPolicy(args: {
    config: NestedSurfaceConfig;
    groupKey: string;
    fieldRef: string;
    editGroupKey?: string;
}): SurfaceFieldVisibility {
    const { config, groupKey, fieldRef, editGroupKey } = args;
    const group = config.groups.find((g) => g.key === groupKey);
    const stored = group?.fieldPolicies?.[fieldRef];
    if (stored) return normalizeFieldVisibility(stored);

    if (editGroupKey) {
        const editGroup = config.groups.find((g) => g.key === editGroupKey);
        if (editGroup?.selectedFieldKeys.includes(fieldRef)) {
            const editPolicy = editGroup.fieldPolicies?.[fieldRef];
            if (editPolicy) return normalizeFieldVisibility(editPolicy);
            if (config.surfaceId === HOUSEHOLD_SURFACE_CANONICAL_ID && editGroupKey === "contact_edit") {
                return "editable";
            }
            if (config.surfaceId === CHILDREN_SURFACE_CANONICAL_ID && editGroupKey === "child_edit") {
                return "editable";
            }
        }
    }

    const legacyMode = group?.fieldModes?.[fieldRef];
    const fromMode = fieldModeToPolicy(legacyMode);
    if (fromMode) return fromMode;

    const placement = group?.fieldPlacements?.find((row) => row.fieldRef === fieldRef);
    if (placement?.policy) return placement.policy;

    if (config.surfaceId === HOUSEHOLD_SURFACE_CANONICAL_ID && groupKey === "contact_edit") return "editable";
    if (config.surfaceId === CHILDREN_SURFACE_CANONICAL_ID && groupKey === "child_edit") return "editable";
    return "read-only";
}
