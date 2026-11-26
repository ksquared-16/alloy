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
import { migrateHouseholdRelationshipSectionInstances } from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import {
    identityLayerFieldKeysFromGroup,
    normalizeIdentityFieldPlacements,
    normalizeIdentityStorageTier,
    storageTierMatchesPurpose,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
function dedupeIdentityFieldRefList(fieldRefs: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const ref of fieldRefs) {
        if (seen.has(ref)) continue;
        seen.add(ref);
        out.push(ref);
    }
    return out;
}

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
    other_parent_guardian: {
        type: "relationship_role",
        roleKeys: ["parent", "guardian", "family_member", "primary_contact", "secondary"],
    },
    household_members: { type: "relationship_role", roleKeys: ["additional", "relative", "grandparent"] },
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
    // Published canonical household_surface wins — legacy contact surface is migration input only.
    if (!legacyContactSurface || householdSurface) return applyIdentityGroupReconcile(canonical);

    const legacyGroup = legacyContactSurface.groups.find((group) => group.key === "contact_fields");
    if (!legacyGroup) return applyIdentityGroupReconcile(canonical);

    const canonicalGroup = canonical.groups.find((group) => group.key === "contact_edit");
    if (!canonicalGroup) return applyIdentityGroupReconcile(canonical);
    const canonicalWasPublished = false;

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

/**
 * Migrate legacy config into configuration buckets + normalized placements.
 *
 * - selectedFieldKeys → Summary Fields
 * - contextFieldKeys → Context Facts (may overlap Summary keys independently)
 * - expandedFieldKeys → Detail Fields
 */
export function migrateIdentityDisclosureGroup(group: NestedSurfaceGroupConfig): NestedSurfaceGroupConfig {
    const reconciled = reconcileFieldModesToPolicies(group);
    const layers = identityLayerFieldKeysFromGroup(reconciled);
    const contextFactKeys = dedupeIdentityFieldRefList([
        ...(reconciled.contextFieldKeys ?? layers.contextFacts),
    ]);
    const placementSeed = {
        ...reconciled,
        selectedFieldKeys: layers.summary,
        contextFieldKeys: contextFactKeys,
        expandedFieldKeys: layers.details,
    };
    const placements = normalizeIdentityFieldPlacements(generateDefaultIdentityFieldPlacements(placementSeed));
    return {
        ...reconciled,
        selectedFieldKeys: layers.summary,
        contextFieldKeys: contextFactKeys,
        expandedFieldKeys: layers.details.length > 0 ? layers.details : reconciled.expandedFieldKeys,
        fieldPlacements: placements,
    };
}

/** Adapt legacy `child_surface` config onto canonical `children_surface` shape. */
export function adaptChildSurfaceToChildrenSurface(
    childSurface: NestedSurfaceConfig | null,
    childrenSurface: NestedSurfaceConfig | null,
): NestedSurfaceConfig {
    if (childrenSurface) {
        return applyIdentityGroupReconcile(
            reconcileNestedSurfaceConfig(CHILDREN_SURFACE_CANONICAL_ID, childrenSurface),
        );
    }
    const canonical = reconcileNestedSurfaceConfig(
        CHILDREN_SURFACE_CANONICAL_ID,
        defaultNestedSurfaceConfig(CHILDREN_SURFACE_CANONICAL_ID),
    );
    if (!childSurface) return applyIdentityGroupReconcile(canonical);

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
            fieldPlacements: generateDefaultPlacementsForGroup(migrateIdentityDisclosureGroup(merged)),
        };
    });

    return { ...canonical, groups: mergedGroups };
}

function avatarFromDisplayOptions(
    group: NestedSurfaceGroupConfig,
): IdentitySectionConfig["avatar"] {
    const showAvatar = group.displayOptions?.showAvatar !== false;
    const useProfilePhotos = group.displayOptions?.useProfilePhotos !== false;
    return {
        visible: showAvatar,
        source: useProfilePhotos ? "photo_or_initials" : "initials",
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
    const migrated = migrateIdentityDisclosureGroup(group);
    const placements = generateDefaultPlacementsForGroup(migrated);
    const summaryFields = placements.filter((placement) => storageTierMatchesPurpose(placement.tier, "summary"));
    const contextFacts = placements.filter((placement) => storageTierMatchesPurpose(placement.tier, "context_facts"));
    const detailsFields = placements.filter((placement) => storageTierMatchesPurpose(placement.tier, "details"));

    return {
        key: group.key,
        label: group.sectionLabel?.trim() || label,
        source: HOUSEHOLD_SECTION_SOURCES[group.key] ?? { type: "record" },
        allowMultiple: group.key !== "primary_contact",
        avatar: avatarFromDisplayOptions(migrated),
        badge: badgeFromDisplayOptions(migrated),
        summary: { fields: summaryFields },
        context: { facts: contextFacts },
        details: { fields: detailsFields },
        evidence: { collections: migrated.evidenceCollections ?? [] },
        summaryFields,
        contextFields: contextFacts,
        detailsFields,
        expandedFields: detailsFields,
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

export type IdentityNestedLegacyConfigs = {
    childSurface?: NestedSurfaceConfig | null;
    householdContactSurface?: NestedSurfaceConfig | null;
};

export type ReconcileIdentityNestedConfigInput = {
    surfaceKey: string;
    currentConfig?: NestedSurfaceConfig | null;
    legacyConfigs?: IdentityNestedLegacyConfigs;
};

function applyIdentityGroupReconcile(config: NestedSurfaceConfig): NestedSurfaceConfig {
    const migratedSections =
        config.surfaceId === HOUSEHOLD_SURFACE_CANONICAL_ID
            ? migrateHouseholdRelationshipSectionInstances(config)
            : config;
    return {
        ...migratedSections,
        groups: migratedSections.groups.map((group) => migrateIdentityDisclosureGroup(group)),
    };
}

function reconcileIdentityNestedConfigImpl(input: ReconcileIdentityNestedConfigInput): NestedSurfaceConfig {
    const { surfaceKey, currentConfig = null, legacyConfigs = {} } = input;
    let config: NestedSurfaceConfig;

    if (surfaceKey === HOUSEHOLD_SURFACE_CANONICAL_ID) {
        config = adaptHouseholdContactSurfaceToHouseholdSurface(
            legacyConfigs.householdContactSurface ?? null,
            currentConfig,
        );
    } else if (surfaceKey === CHILDREN_SURFACE_CANONICAL_ID) {
        config = adaptChildSurfaceToChildrenSurface(
            legacyConfigs.childSurface ?? null,
            currentConfig,
        );
    } else if (surfaceKey === CHILD_SURFACE_COMPAT_ID) {
        config = adaptChildSurfaceToChildrenSurface(
            currentConfig,
            null,
        );
    } else if (surfaceKey === HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID) {
        config = adaptHouseholdContactSurfaceToHouseholdSurface(
            currentConfig,
            null,
        );
    } else {
        config = reconcileNestedSurfaceConfig(surfaceKey, currentConfig);
    }

    return applyIdentityGroupReconcile(config);
}

/** Normalize nested config through the canonical identity compatibility adapters. */
export function reconcileIdentityNestedConfig(
    input: ReconcileIdentityNestedConfigInput,
): NestedSurfaceConfig;
export function reconcileIdentityNestedConfig(
    surfaceId: string,
    loaded: NestedSurfaceConfig | null,
    legacyChildSurface?: NestedSurfaceConfig | null,
): NestedSurfaceConfig;
export function reconcileIdentityNestedConfig(
    inputOrSurfaceId: ReconcileIdentityNestedConfigInput | string,
    loaded?: NestedSurfaceConfig | null,
    legacyChildSurface?: NestedSurfaceConfig | null,
): NestedSurfaceConfig {
    if (typeof inputOrSurfaceId === "string") {
        return reconcileIdentityNestedConfigImpl({
            surfaceKey: inputOrSurfaceId,
            currentConfig: loaded ?? null,
            legacyConfigs: { childSurface: legacyChildSurface ?? null },
        });
    }
    return reconcileIdentityNestedConfigImpl(inputOrSurfaceId);
}

/** Extract legacy identity surfaces from published metadata. */
export function legacyIdentityConfigsFromMetadata(
    metadata: { nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined> } | null | undefined,
): IdentityNestedLegacyConfigs {
    const nested = metadata?.nestedSurfaces ?? {};
    return {
        childSurface: nested[CHILD_SURFACE_COMPAT_ID] ?? null,
        householdContactSurface: nested[HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID] ?? null,
    };
}

/** Reconcile one identity surface from doc metadata the same way runtime and Composer do. */
export function reconcileIdentityNestedConfigFromDocMetadata(
    surfaceKey: string,
    metadata: { nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined> } | null | undefined,
): NestedSurfaceConfig | null {
    const nested = metadata?.nestedSurfaces ?? {};
    const currentConfig = nested[surfaceKey] ?? null;
    const legacy = legacyIdentityConfigsFromMetadata(metadata);
    if (surfaceKey === HOUSEHOLD_SURFACE_CANONICAL_ID) {
        if (!currentConfig && !legacy.householdContactSurface) return null;
    } else if (surfaceKey === CHILDREN_SURFACE_CANONICAL_ID) {
        if (!currentConfig && !legacy.childSurface) return null;
    } else if (!currentConfig) {
        return null;
    }
    return reconcileIdentityNestedConfig({
        surfaceKey,
        currentConfig,
        legacyConfigs: legacy,
    });
}

/** Seed Composer/runtime nested configs with identity-normalized household + children surfaces. */
export function reconcileIdentityNestedConfigsFromMetadata(
    metadata: { nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined> } | null | undefined,
): Record<string, NestedSurfaceConfig> {
    const nested = metadata?.nestedSurfaces ?? {};
    const out: Record<string, NestedSurfaceConfig> = {};
    for (const [surfaceId, config] of Object.entries(nested)) {
        if (!config) continue;
        if (
            surfaceId === HOUSEHOLD_SURFACE_CANONICAL_ID
            || surfaceId === CHILDREN_SURFACE_CANONICAL_ID
            || surfaceId === CHILD_SURFACE_COMPAT_ID
            || surfaceId === HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID
        ) {
            continue;
        }
        out[surfaceId] = reconcileNestedSurfaceConfig(surfaceId, config);
    }
    const household = reconcileIdentityNestedConfigFromDocMetadata(HOUSEHOLD_SURFACE_CANONICAL_ID, metadata);
    if (household) out[HOUSEHOLD_SURFACE_CANONICAL_ID] = household;
    const children = reconcileIdentityNestedConfigFromDocMetadata(CHILDREN_SURFACE_CANONICAL_ID, metadata);
    if (children) out[CHILDREN_SURFACE_CANONICAL_ID] = children;
    return out;
}

const IDENTITY_EDIT_SURFACE_GROUP_KEYS = new Set(["contact_edit", "child_edit"]);

function isIdentityPresentationGroup(groupKey: string): boolean {
    return !IDENTITY_EDIT_SURFACE_GROUP_KEYS.has(groupKey);
}

/** Resolve effective field policy with edit-surface inheritance (`child_edit` / `contact_edit`). */
export function resolveIdentityFieldPolicy(args: {
    config: NestedSurfaceConfig;
    groupKey: string;
    fieldRef: string;
    editGroupKey?: string;
    tier?: "summary" | "context_facts" | "details";
    skipGlobalPolicy?: boolean;
    skipPlacementPolicy?: boolean;
}): SurfaceFieldVisibility {
    const { config, groupKey, fieldRef, editGroupKey, tier, skipGlobalPolicy, skipPlacementPolicy } = args;
    const group = config.groups.find((g) => g.key === groupKey);

    if (tier && !skipPlacementPolicy) {
        const tierPlacement = (group?.fieldPlacements ?? []).find(
            (row) =>
                row.fieldRef === fieldRef
                && storageTierMatchesPurpose(normalizeIdentityStorageTier(row.tier), tier),
        );
        if (tierPlacement?.policy) return normalizeFieldVisibility(tierPlacement.policy);
    }

    if (!skipGlobalPolicy) {
        const stored = group?.fieldPolicies?.[fieldRef];
        if (stored) return normalizeFieldVisibility(stored);
    }

    if (tier && isIdentityPresentationGroup(groupKey)) {
        if (editGroupKey && !skipPlacementPolicy) {
            const editGroup = config.groups.find((g) => g.key === editGroupKey);
            const editTierPlacement = (editGroup?.fieldPlacements ?? []).find(
                (row) =>
                    row.fieldRef === fieldRef
                    && storageTierMatchesPurpose(normalizeIdentityStorageTier(row.tier), tier),
            );
            if (editTierPlacement?.policy) return normalizeFieldVisibility(editTierPlacement.policy);
        }
        const legacyMode = group?.fieldModes?.[fieldRef];
        const fromMode = fieldModeToPolicy(legacyMode);
        if (fromMode) return fromMode;
        return "read-only";
    }

    if (editGroupKey) {
        const editGroup = config.groups.find((g) => g.key === editGroupKey);
        const editLayers = editGroup ? identityLayerFieldKeysFromGroup(editGroup) : null;
        const editContainsField = editLayers
            ? editLayers.summary.includes(fieldRef)
                || editLayers.contextFacts.includes(fieldRef)
                || editLayers.details.includes(fieldRef)
            : false;
        if (editContainsField) {
            if (tier && !skipPlacementPolicy) {
                const editTierPlacement = (editGroup?.fieldPlacements ?? []).find(
                    (row) =>
                        row.fieldRef === fieldRef
                        && storageTierMatchesPurpose(normalizeIdentityStorageTier(row.tier), tier),
                );
                if (editTierPlacement?.policy) return normalizeFieldVisibility(editTierPlacement.policy);
            }
            const editPolicy = editGroup?.fieldPolicies?.[fieldRef];
            if (editPolicy) return normalizeFieldVisibility(editPolicy);
            if (groupKey === editGroupKey) {
                if (config.surfaceId === HOUSEHOLD_SURFACE_CANONICAL_ID && editGroupKey === "contact_edit") {
                    return "editable";
                }
                if (config.surfaceId === CHILDREN_SURFACE_CANONICAL_ID && editGroupKey === "child_edit") {
                    return "editable";
                }
            }
        }
    }

    const legacyMode = group?.fieldModes?.[fieldRef];
    const fromMode = fieldModeToPolicy(legacyMode);
    if (fromMode) return fromMode;

    if (!tier && !skipPlacementPolicy) {
        const placement = group?.fieldPlacements?.find((row) => row.fieldRef === fieldRef);
        if (placement?.policy) return placement.policy;
    }

    if (config.surfaceId === HOUSEHOLD_SURFACE_CANONICAL_ID && groupKey === "contact_edit") return "editable";
    if (config.surfaceId === CHILDREN_SURFACE_CANONICAL_ID && groupKey === "child_edit") return "editable";
    return "read-only";
}
