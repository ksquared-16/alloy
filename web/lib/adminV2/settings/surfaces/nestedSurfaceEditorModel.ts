/**
 * Nested Surface editor model (Experience Builder V3 — /surfaces FP slice).
 *
 * Editable nested-surface groups are derived from the registered `SurfaceSpec` —
 * one registry, one editor. `groupDefsFor(surfaceId)` reads evidence groups from
 * `getSurface(surfaceId)` via `surfaceComponents`; no parallel `NESTED_SURFACE_DEFS`.
 *
 * Availability is namespace-driven (V3 §5): a group offers real platform fields
 * plus real tenant custom fields whose namespace it accepts — never fabricated fields.
 *
 * Persisted into the Focus Panel summary layout doc metadata
 * (`metadata.nestedSurfaces[surfaceId]`) — see nestedSurfaceConfigService.ts.
 *
 * @see lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs.ts
 * @see lib/adminV2/settings/surfaces/compositionFieldAdapter.ts (availableFieldsForNamespaces)
 */

import {
    availableFieldsForNamespaces,
    type AvailableField,
    type AvailableFieldEntityNamespace,
} from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { defaultChildFieldModes } from "@/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime";
import {
    defaultContactFieldModes,
    defaultHouseholdGroupDisplayOptions,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceRuntime";
import type {
    NestedSurfaceFieldMode,
    NestedSurfaceGroupDisplayOptions,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import { getSurface } from "@/lib/platform/surfaceComposition/surfaceRegistry";
import { surfaceComponents } from "@/lib/platform/surfaceComposition/universalSurfaceModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import type { NestedSurfaceNavigationConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceNavigation";
import {
    HOUSEHOLD_DEFAULT_SECTION_ORDER,
    HOUSEHOLD_ALWAYS_ENABLED_KEYS,
    orderNestedGroupsByCanonicalKeys,
    enforceHouseholdPinnedSectionOrder,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";
import {
    defaultFieldVisibility,
    normalizeFieldVisibility,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import type { NestedSurfaceFieldLayoutWidth, NestedSurfaceFieldDropZone } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import {
    chunkNestedSurfaceFieldsForHalfRowLayout,
    isNestedSurfaceFieldHalfWidth,
    nestedSurfaceFieldMustFullRow,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import {
    generateDefaultIdentityFieldPlacements,
    type IdentityFieldPlacement,
    type IdentityFieldTier,
} from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { identityPickerFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import {
    fieldVisibilityForIdentityTier,
    setFieldVisibilityForIdentityTier,
    type IdentityFieldPolicyTier,
} from "@/lib/adminV2/settings/surfaces/identityFieldPolicy";
import {
    configurationPurposeFromTierArg,
    fieldKeysForConfigurationPurpose,
    normalizeIdentityFieldPlacements,
    normalizeIdentityStorageTier,
    type IdentityConfigurationPurpose,
    type IdentityEvidenceCollectionConfig,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { splitDefaultFieldsForIdentityGroup } from "@/lib/adminV2/settings/surfaces/identityDisclosureDefaults";

export const HOUSEHOLD_SURFACE_ID = "household_surface";
export const CHILDREN_SURFACE_ID = "children_surface";
export const FINANCIAL_CONFIG_SURFACE_ID = "financial_configuration_surface";

/**
 * Groups an operator may add/remove as optional sections via the Add Section flow.
 * Platform-defined section identities (semantics) live in `sectionCatalog.ts`; these are
 * the group keys that stay hidden until the operator adds them.
 */
export const OPTIONAL_NESTED_GROUP_KEYS: Partial<Record<string, readonly string[]>> = {
    [HOUSEHOLD_SURFACE_ID]: [
        "emergency_contacts",
        "authorized_pickups",
        "billing_contact",
        "emergency_medical",
        "custom_notes",
    ],
    [CHILDREN_SURFACE_ID]: [
        "emergency_contacts",
        "medical",
        "documents",
        "pickup",
        "communications",
        "notes",
        "nickname",
        "custom_notes",
    ],
};

/** Domain-locked groups — visible in runtime but not configurable in the composer. */
export const DOMAIN_LOCKED_NESTED_GROUP_KEYS: Partial<Record<string, readonly string[]>> = {
    [FINANCIAL_CONFIG_SURFACE_ID]: ["billing_periods", "line_items"],
};

export function isNestedSurfaceId(id: string): boolean {
    ensureRuntimeSurfacesRegistered();
    return groupDefsFor(id).length > 0;
}

/** One editable evidence group inside a nested surface. */
export type NestedSurfaceGroupDef = {
    key: string;
    label: string;
    purpose?: string;
    acceptedNamespaces: readonly AvailableFieldEntityNamespace[];
    /** Real fields the group seeds with (must be real refKeys). */
    defaultFieldKeys: readonly string[];
};

export type NestedSurfaceGroupConfig = {
    key: string;
    /** Canonical relationship-section definition key. */
    definitionKey?: string;
    /** Stable tenant section instance key. */
    instanceKey?: string;
    /** Registry group key for field presentation authoring. */
    presentationRef?: string;
    /** Summary layer — recognition fields (who is this?). */
    selectedFieldKeys: string[];
    /** Context Facts — incremental operational facts (persisted as contextFieldKeys). */
    contextFieldKeys?: string[];
    /** Details layer — inspect one identity after selection (legacy name: expandedFieldKeys). */
    expandedFieldKeys?: string[];
    /** Evidence layer — collection-oriented proof regions (documents, forms, …). */
    evidenceCollections?: IdentityEvidenceCollectionConfig[];
    /** Optional sections (e.g. emergency_contacts) — false hides until operator adds the section. */
    enabled?: boolean;
    /** Legacy runtime field modes (displayed/editable) — kept for drill-in runtime parity. */
    displayOptions?: NestedSurfaceGroupDisplayOptions;
    fieldModes?: Record<string, NestedSurfaceFieldMode>;
    /** Per-field editable / read-only / hidden policy. */
    fieldPolicies?: Record<string, SurfaceFieldVisibility>;
    /** Operator-facing presentation labels (never schema names). */
    fieldLabels?: Record<string, string>;
    /** Per-field row width — `half` pairs with the next consecutive half field on one row. */
    fieldLayoutWidths?: Record<string, NestedSurfaceFieldLayoutWidth>;
    /** Shared identity placements — summary, context, and details tiers with row/column metadata. */
    fieldPlacements?: IdentityFieldPlacement[];
    /** Explicit per-field icon override (catalog icon used when absent). */
    fieldIcons?: Record<string, string>;
    /**
     * Stable semantic identity for an operator-added section (from the platform section
     * catalog). Preserved so future BOS/AI understand what the section MEANS even after
     * the operator relabels it. Fixed structural groups leave this undefined.
     */
    sectionSemantic?: string;
    /** Operator-chosen section label (custom sections); overrides the registry label. */
    sectionLabel?: string;
    /** When true, Parent / Guardian template inheritance is disabled for this section. */
    roleOverride?: boolean;
    /** Relationship matching criteria for configurable Household sections. */
    relationshipCriteria?: {
        roleKeys?: string[];
        relationshipTypes?: string[];
        excludeRoleKeys?: string[];
    };
    sectionVisibility?: "always" | "when_nonempty" | "hidden";
    sectionOrder?: number;
};

export type NestedSurfaceConfig = {
    surfaceId: string;
    groups: NestedSurfaceGroupConfig[];
    /** Per-section navigation link overrides (nested surface → nested surface). */
    navigation?: NestedSurfaceNavigationConfig;
};

function namespacesForEvidenceGroup(
    items: readonly { kind: string; namespace?: string }[],
): AvailableFieldEntityNamespace[] {
    const ns = new Set<AvailableFieldEntityNamespace>();
    for (const item of items) {
        if (item.namespace) {
            ns.add(item.namespace as AvailableFieldEntityNamespace);
        }
    }
    return [...ns];
}

/** Derive editable group defs from a registered surface spec (registry source of truth). */
export function groupDefsFor(surfaceId: string): NestedSurfaceGroupDef[] {
    ensureRuntimeSurfacesRegistered();
    const surface = getSurface(surfaceId);
    if (!surface) return [];

    const groups: NestedSurfaceGroupDef[] = [];
    for (const component of surfaceComponents(surface)) {
        for (const group of component.evidenceGroups) {
            groups.push({
                key: group.key,
                label: group.label,
                purpose: group.purpose,
                acceptedNamespaces: namespacesForEvidenceGroup(group.items),
                defaultFieldKeys: group.items.filter((item) => item.kind === "field").map((item) => item.key),
            });
        }
    }
    return groups;
}

export function nestedSurfaceLabel(surfaceId: string): string {
    ensureRuntimeSurfacesRegistered();
    return getSurface(surfaceId)?.label ?? surfaceId;
}

function defaultGroupEnabled(surfaceId: string, groupKey: string): boolean {
    const optional = OPTIONAL_NESTED_GROUP_KEYS[surfaceId] ?? [];
    if (optional.includes(groupKey)) return false;
    return true;
}

function defaultIdentityLayerKeysForGroup(
    surfaceId: string,
    groupKey: string,
    defaultFieldKeys: readonly string[],
): { selectedFieldKeys: string[]; contextFieldKeys?: string[]; expandedFieldKeys?: string[] } {
    if (groupKey === "roster" && surfaceId === CHILDREN_SURFACE_ID) {
        return { selectedFieldKeys: [] };
    }
    if (
        surfaceId === HOUSEHOLD_SURFACE_ID
        || surfaceId === CHILDREN_SURFACE_ID
        || surfaceId === "child_surface"
        || surfaceId === "employee_surface"
    ) {
        const layers = splitDefaultFieldsForIdentityGroup(surfaceId, groupKey, defaultFieldKeys);
        return {
            selectedFieldKeys: [...layers.summary],
            contextFieldKeys: layers.contextFacts.length > 0 ? [...layers.contextFacts] : undefined,
            expandedFieldKeys: layers.details.length > 0 ? [...layers.details] : undefined,
        };
    }
    return { selectedFieldKeys: [...defaultFieldKeys] };
}

/** Seed a default config (each group selects its default real fields). */
export function defaultNestedSurfaceConfig(surfaceId: string): NestedSurfaceConfig {
    let groups = groupDefsFor(surfaceId).map((g) => {
        const layerKeys = defaultIdentityLayerKeysForGroup(surfaceId, g.key, g.defaultFieldKeys);
        return {
            key: g.key,
            ...layerKeys,
            enabled: defaultGroupEnabled(surfaceId, g.key),
            displayOptions: defaultGroupDisplayOptionsForSurface(surfaceId, g.key),
            fieldModes: defaultFieldModesForSurfaceGroup(surfaceId, g.key, g.defaultFieldKeys),
            fieldPlacements: generateDefaultIdentityFieldPlacements({
                selectedFieldKeys: layerKeys.selectedFieldKeys,
                contextFieldKeys: layerKeys.contextFieldKeys,
                expandedFieldKeys: layerKeys.expandedFieldKeys,
            }),
        };
    });
    if (surfaceId === HOUSEHOLD_SURFACE_ID) {
        groups = orderNestedGroupsByCanonicalKeys(groups, HOUSEHOLD_DEFAULT_SECTION_ORDER);
    }
    return { surfaceId, groups };
}

function defaultGroupDisplayOptionsForSurface(
    surfaceId: string,
    groupKey: string,
): NestedSurfaceGroupDisplayOptions | undefined {
    if (surfaceId === HOUSEHOLD_SURFACE_ID) {
        return defaultHouseholdGroupDisplayOptions(groupKey);
    }
    if (surfaceId === "child_surface" && groupKey === "identity") {
        return { showDob: false, showAge: true };
    }
    if (surfaceId === CHILDREN_SURFACE_ID && groupKey === "identity") {
        return { showAvatar: true };
    }
    return undefined;
}

function defaultFieldModesForSurfaceGroup(
    surfaceId: string,
    groupKey: string,
    defaultFieldKeys: readonly string[],
): Record<string, NestedSurfaceFieldMode> | undefined {
    if (surfaceId === "household_contact_surface" && groupKey === "contact_fields") {
        return defaultContactFieldModes();
    }
    if (surfaceId === "child_surface") {
        const all = defaultChildFieldModes();
        const scoped: Record<string, NestedSurfaceFieldMode> = {};
        for (const key of defaultFieldKeys) {
            if (all[key]) scoped[key] = all[key]!;
        }
        return scoped;
    }
    return undefined;
}

/** Selected field keys for a group (empty if group not present). */
export function selectedFieldKeys(config: NestedSurfaceConfig, groupKey: string): string[] {
    return config.groups.find((g) => g.key === groupKey)?.selectedFieldKeys ?? [];
}

/**
 * Fields available to ADD to a group: real platform + tenant custom fields whose
 * namespace the group accepts, minus already-selected. Never fabricated.
 */
export function availableFieldsForNestedGroup(
    surfaceId: string,
    groupKey: string,
    config: NestedSurfaceConfig,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
    options?: { tier?: IdentityFieldTier },
): AvailableField[] {
    const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    if (!def) return [];
    const group = config.groups.find((g) => g.key === groupKey);
    const purpose = purposeFromTierArg(options?.tier);
    const selected = new Set(
        group ? fieldKeysForConfigurationPurpose(group, purpose) : selectedFieldKeys(config, groupKey),
    );
    const namespaces =
        surfaceId === CHILDREN_SURFACE_ID && groupKey === "emergency_contacts"
            ? (["person", "person_child_relationship"] as const)
            : surfaceId === CHILDREN_SURFACE_ID && isEvidenceSection(surfaceId, groupKey)
                ? (["child", "inquiry_child"] as const)
                : def.acceptedNamespaces;
    return identityPickerFieldsForNamespaces({
        namespaces,
        tenantFieldDefinitions,
        excludeKeys: selected,
    }).map((field) => ({
        key: field.key,
        label: field.label,
        entityNamespace: field.entityNamespace,
        displayHint: field.displayHint,
        isSystemField: field.isSystemField,
    }));
}

function patchGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fn: (keys: string[]) => string[],
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) => (g.key === groupKey ? { ...g, selectedFieldKeys: fn([...g.selectedFieldKeys]) } : g)),
    };
}

function seedFieldPlacementForAdd(
    surfaceId: string,
    group: NestedSurfaceGroupConfig,
    fieldKey: string,
    tier: IdentityFieldTier = "summary",
): IdentityFieldPlacement[] {
    const normalizedTier = normalizeIdentityStorageTier(tier);
    const placements = [...(group.fieldPlacements ?? generateDefaultIdentityFieldPlacements(group))].map(
        (placement) => ({ ...placement, tier: normalizeIdentityStorageTier(placement.tier) }),
    );
    if (
        placements.some(
            (placement) =>
                placement.fieldRef === fieldKey
                && normalizeIdentityStorageTier(placement.tier) === normalizedTier,
        )
    ) {
        return placements;
    }
    const tierPlacements = placements.filter(
        (placement) => normalizeIdentityStorageTier(placement.tier) === normalizedTier,
    );
    const nextRow =
        tierPlacements.length > 0 ? Math.max(...tierPlacements.map((placement) => placement.row)) + 1 : 1;
    placements.push({
        fieldRef: fieldKey,
        tier: normalizedTier,
        row: nextRow,
        column: 1,
        width: "full",
        policy: group.fieldPolicies?.[fieldKey] ?? defaultFieldVisibility(surfaceId, group.key),
    });
    return placements;
}

function patchGroupWithField(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    tier: IdentityFieldTier = "summary",
): NestedSurfaceConfig {
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return config;
    const purpose = configurationPurposeFromTierArg(tier);
    const keys = [...fieldKeysForConfigurationPurpose(group, purpose)];
    if (!keys.includes(fieldKey)) keys.push(fieldKey);
    const storageTier = normalizeIdentityStorageTier(tier);

    const nextGroup: NestedSurfaceGroupConfig = {
        ...group,
        selectedFieldKeys: purpose === "summary" ? keys : group.selectedFieldKeys,
        contextFieldKeys: purpose === "context_facts" ? keys : group.contextFieldKeys,
        expandedFieldKeys: purpose === "details" ? keys : group.expandedFieldKeys,
        fieldLayoutWidths: {
            ...(group.fieldLayoutWidths ?? {}),
            [fieldKey]: group.fieldLayoutWidths?.[fieldKey] ?? "full",
        },
        fieldPolicies: {
            ...(group.fieldPolicies ?? {}),
            [fieldKey]:
                group.fieldPolicies?.[fieldKey]
                ?? defaultFieldVisibility(config.surfaceId, groupKey),
        },
        fieldPlacements: seedFieldPlacementForAdd(config.surfaceId, group, fieldKey, storageTier),
    };

    return {
        ...config,
        groups: config.groups.map((g) => (g.key === groupKey ? nextGroup : g)),
    };
}

export function addFieldToNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    options?: { tier?: IdentityFieldTier },
): NestedSurfaceConfig {
    return patchGroupWithField(config, groupKey, fieldKey, options?.tier ?? "summary");
}

/** Field keys for one identity configuration purpose on a group. */
export function identityConfigurationFieldKeys(
    config: NestedSurfaceConfig,
    groupKey: string,
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">,
): string[] {
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return [];
    return fieldKeysForConfigurationPurpose(group, purpose);
}

/** @deprecated Use identityConfigurationFieldKeys. */
export function identityLayerFieldKeys(
    config: NestedSurfaceConfig,
    groupKey: string,
    layer: "summary" | "context" | "details",
): string[] {
    const purpose = layer === "context" ? "context_facts" : layer;
    return identityConfigurationFieldKeys(config, groupKey, purpose);
}

export function removeFieldFromNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    options?: { tier?: IdentityFieldTier },
): NestedSurfaceConfig {
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return config;
    const purpose = purposeFromTierArg(options?.tier);
    const keys = fieldKeysForConfigurationPurpose(group, purpose).filter((k) => k !== fieldKey);
    let next = patchGroupFieldKeysForPurpose(config, groupKey, purpose, keys);
    next = {
        ...next,
        groups: next.groups.map((g) =>
            g.key === groupKey
                ? {
                      ...g,
                      fieldPlacements: removeFieldPlacement(g, fieldKey, options?.tier),
                      fieldLayoutWidths: Object.fromEntries(
                          Object.entries(g.fieldLayoutWidths ?? {}).filter(([key]) => key !== fieldKey),
                      ),
                  }
                : g,
        ),
    };
    next = unpairOrphanedHalfFieldsForPurpose(next, groupKey, purpose, keys);
    return next;
}

/** Reorder a field within its group by delta (-1 up, +1 down). */
export function moveFieldInNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    delta: number,
    options?: { tier?: IdentityFieldTier },
): NestedSurfaceConfig {
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return config;
    const purpose = purposeFromTierArg(options?.tier);
    const keys = fieldKeysForConfigurationPurpose(group, purpose);
    const i = keys.indexOf(fieldKey);
    if (i < 0) return config;
    const j = Math.max(0, Math.min(keys.length - 1, i + delta));
    if (i === j) return config;
    const nextKeys = [...keys];
    const [item] = nextKeys.splice(i, 1);
    nextKeys.splice(j, 0, item);
    let next = patchGroupFieldKeysForPurpose(config, groupKey, purpose, nextKeys);
    return unpairOrphanedHalfFieldsForPurpose(next, groupKey, purpose, nextKeys);
}

/** Which disclosure tier currently owns a field on a group. */
export function identityTierContainingField(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
): IdentityFieldTier | null {
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return null;
    const tiers: IdentityFieldTier[] = ["summary", "context_fact", "details"];
    for (const tier of tiers) {
        const purpose = configurationPurposeFromTierArg(tier);
        if (fieldKeysForConfigurationPurpose(group, purpose).includes(fieldKey)) {
            return tier;
        }
    }
    return null;
}

/** Move a field from its current disclosure tier into another (Summary / Context / Details). */
export function moveFieldToIdentityTierInNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    toTier: IdentityFieldTier,
): NestedSurfaceConfig {
    const fromTier = identityTierContainingField(config, groupKey, fieldKey);
    if (!fromTier || fromTier === toTier) return config;
    let next = removeFieldFromNestedGroup(config, groupKey, fieldKey, { tier: fromTier });
    next = addFieldToNestedGroup(next, groupKey, fieldKey, { tier: toTier });
    return next;
}

export function setFieldVisibilityInNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    visibility: SurfaceFieldVisibility,
    options?: { tier?: IdentityFieldPolicyTier },
): NestedSurfaceConfig {
    if (options?.tier) {
        return setFieldVisibilityForIdentityTier(config, groupKey, fieldKey, options.tier, visibility);
    }
    return {
        ...config,
        groups: config.groups.map((g) =>
            g.key === groupKey
                ? {
                      ...g,
                      fieldPolicies: { ...(g.fieldPolicies ?? {}), [fieldKey]: visibility },
                  }
                : g,
        ),
    };
}

export function fieldVisibilityForNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    options?: { tier?: IdentityFieldPolicyTier },
): SurfaceFieldVisibility {
    if (options?.tier) {
        return fieldVisibilityForIdentityTier(config, groupKey, fieldKey, options.tier, () =>
            defaultFieldVisibility(config.surfaceId, groupKey),
        );
    }
    const group = config.groups.find((g) => g.key === groupKey);
    const stored = group?.fieldPolicies?.[fieldKey];
    if (stored) return normalizeFieldVisibility(stored);
    return defaultFieldVisibility(config.surfaceId, groupKey);
}

export function fieldPresentationLabel(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    catalogLabel: string,
): string {
    const custom = config.groups.find((g) => g.key === groupKey)?.fieldLabels?.[fieldKey];
    return custom?.trim() || catalogLabel;
}

export function setFieldPresentationLabel(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    label: string,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) =>
            g.key === groupKey
                ? {
                      ...g,
                      fieldLabels: { ...(g.fieldLabels ?? {}), [fieldKey]: label },
                  }
                : g,
        ),
    };
}

export function fieldLayoutWidthForNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
): NestedSurfaceFieldLayoutWidth {
    return config.groups.find((g) => g.key === groupKey)?.fieldLayoutWidths?.[fieldKey] ?? "full";
}

export function setFieldLayoutWidthInNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    layoutWidth: NestedSurfaceFieldLayoutWidth,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) =>
            g.key === groupKey
                ? {
                      ...g,
                      fieldLayoutWidths: { ...(g.fieldLayoutWidths ?? {}), [fieldKey]: layoutWidth },
                  }
                : g,
        ),
    };
}

function patchGroupFieldKeys(
    config: NestedSurfaceConfig,
    groupKey: string,
    keys: string[],
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) => (g.key === groupKey ? { ...g, selectedFieldKeys: keys } : g)),
    };
}

function patchGroupFieldKeysForPurpose(
    config: NestedSurfaceConfig,
    groupKey: string,
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">,
    keys: string[],
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) => {
            if (g.key !== groupKey) return g;
            switch (purpose) {
                case "summary":
                    return { ...g, selectedFieldKeys: keys };
                case "context_facts":
                    return { ...g, contextFieldKeys: keys };
                case "details":
                    return { ...g, expandedFieldKeys: keys };
            }
        }),
    };
}

function removeFieldPlacement(
    group: NestedSurfaceGroupConfig,
    fieldKey: string,
    tier?: IdentityFieldTier,
): IdentityFieldPlacement[] {
    const placements = group.fieldPlacements ?? [];
    if (!tier) {
        return placements.filter((placement) => placement.fieldRef !== fieldKey);
    }
    const normalized = normalizeIdentityStorageTier(tier);
    return placements.filter(
        (placement) =>
            !(placement.fieldRef === fieldKey && normalizeIdentityStorageTier(placement.tier) === normalized),
    );
}

function purposeFromTierArg(tier?: IdentityFieldTier): Exclude<IdentityConfigurationPurpose, "evidence"> {
    return configurationPurposeFromTierArg(tier ?? "summary");
}

function unpairOrphanedHalfFields(
    config: NestedSurfaceConfig,
    groupKey: string,
    keys: readonly string[],
): NestedSurfaceConfig {
    let next = config;
    const layoutFor = (fieldKey: string) => fieldLayoutWidthForNestedGroup(next, groupKey, fieldKey);
    const chunks = chunkNestedSurfaceFieldsForHalfRowLayout(keys, layoutFor);
    for (const chunk of chunks) {
        if (chunk.length === 1) {
            const key = chunk[0]!;
            if (isNestedSurfaceFieldHalfWidth(layoutFor(key))) {
                next = setFieldLayoutWidthInNestedGroup(next, groupKey, key, "full");
            }
        }
    }
    return next;
}

function unpairOrphanedHalfFieldsForPurpose(
    config: NestedSurfaceConfig,
    groupKey: string,
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">,
    keys: readonly string[],
): NestedSurfaceConfig {
    void purpose;
    return unpairOrphanedHalfFields(config, groupKey, keys);
}

/**
 * Apply a visual drag-drop onto the layout surface for one disclosure tier.
 * Active Builder purpose maps to targetTier:
 *   Summary Fields → summary
 *   Context Facts → context_fact
 *   Detail Fields → details
 *
 * - `beside` — pair dragged field with target on the same row (both half).
 * - `below` — move dragged field to a new full row after target's row.
 *
 * Evidence Collections do not use this path.
 */
export function applyNestedSurfaceFieldDrop(
    config: NestedSurfaceConfig,
    groupKey: string,
    draggedKey: string,
    targetKey: string,
    zone: NestedSurfaceFieldDropZone,
    options?: { tier?: IdentityFieldTier },
): NestedSurfaceConfig {
    if (draggedKey === targetKey) return config;
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return config;
    const purpose = purposeFromTierArg(options?.tier);
    const keys = fieldKeysForConfigurationPurpose(group, purpose);
    if (keys.indexOf(draggedKey) < 0 || keys.indexOf(targetKey) < 0) return config;

    if (zone === "beside") {
        if (nestedSurfaceFieldMustFullRow(draggedKey) || nestedSurfaceFieldMustFullRow(targetKey)) {
            return config;
        }
        const withoutDragged = keys.filter((k) => k !== draggedKey);
        const targetPos = withoutDragged.indexOf(targetKey);
        if (targetPos < 0) return config;
        const reordered = [...withoutDragged];
        reordered.splice(targetPos + 1, 0, draggedKey);
        let next = patchGroupFieldKeysForPurpose(config, groupKey, purpose, reordered);
        next = setFieldLayoutWidthInNestedGroup(next, groupKey, draggedKey, "half");
        next = setFieldLayoutWidthInNestedGroup(next, groupKey, targetKey, "half");
        return unpairOrphanedHalfFieldsForPurpose(next, groupKey, purpose, reordered);
    }

    const layoutFor = (fieldKey: string) => fieldLayoutWidthForNestedGroup(config, groupKey, fieldKey);
    const rowChunks = chunkNestedSurfaceFieldsForHalfRowLayout(keys, layoutFor);
    const targetRow = rowChunks.find((chunk) => chunk.includes(targetKey));
    if (!targetRow) return config;

    const withoutDragged = keys.filter((k) => k !== draggedKey);
    const anchorKey = targetRow[targetRow.length - 1]!;
    const insertAfter = withoutDragged.indexOf(anchorKey);
    if (insertAfter < 0) return config;
    const reordered = [...withoutDragged];
    reordered.splice(insertAfter + 1, 0, draggedKey);

    let next = patchGroupFieldKeysForPurpose(config, groupKey, purpose, reordered);
    next = setFieldLayoutWidthInNestedGroup(next, groupKey, draggedKey, "full");
    return unpairOrphanedHalfFieldsForPurpose(next, groupKey, purpose, reordered);
}

export function fieldShowLabelForNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
): boolean {
    return config.groups.find((g) => g.key === groupKey)?.fieldModes?.[fieldKey]?.showLabel !== false;
}

export function fieldShowIconForNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
): boolean {
    return config.groups.find((g) => g.key === groupKey)?.fieldModes?.[fieldKey]?.showIcon !== false;
}

export function setFieldPresentationModeInNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    patch: Partial<NestedSurfaceFieldMode>,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) => {
            if (g.key !== groupKey) return g;
            const nextFieldModes = {
                ...(g.fieldModes ?? {}),
                [fieldKey]: { ...(g.fieldModes?.[fieldKey] ?? {}), ...patch },
            };
            let nextPlacements = g.fieldPlacements;
            if (patch.showLabel !== undefined) {
                const labelMode = patch.showLabel === false ? ("hidden" as const) : ("visible" as const);
                const placements =
                    (g.fieldPlacements?.length ?? 0) > 0
                        ? g.fieldPlacements!
                        : generateDefaultIdentityFieldPlacements(g);
                nextPlacements = placements.map((placement) =>
                    placement.fieldRef === fieldKey ? { ...placement, labelMode } : placement,
                );
            }
            return {
                ...g,
                fieldModes: nextFieldModes,
                ...(nextPlacements !== undefined && nextPlacements !== g.fieldPlacements
                    ? { fieldPlacements: nextPlacements }
                    : {}),
            };
        }),
    };
}

export function groupShowAvatarForNestedGroup(config: NestedSurfaceConfig, groupKey: string): boolean {
    return config.groups.find((g) => g.key === groupKey)?.displayOptions?.showAvatar !== false;
}

export function setGroupShowAvatarInNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    showAvatar: boolean,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) =>
            g.key === groupKey
                ? {
                      ...g,
                      displayOptions: { ...(g.displayOptions ?? {}), showAvatar },
                  }
                : g,
        ),
    };
}

export function isNestedGroupEnabled(config: NestedSurfaceConfig, groupKey: string): boolean {
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return false;
    return group.enabled !== false;
}

export function setNestedGroupEnabled(
    config: NestedSurfaceConfig,
    groupKey: string,
    enabled: boolean,
    options?: { sectionSemantic?: string; sectionLabel?: string },
): NestedSurfaceConfig {
    const exists = config.groups.some((g) => g.key === groupKey);
    if (!exists) {
        const def = groupDefsFor(config.surfaceId).find((g) => g.key === groupKey);
        if (!def) return config;
        return {
            ...config,
            groups: [
                ...config.groups,
                {
                    key: groupKey,
                    selectedFieldKeys: [...def.defaultFieldKeys],
                    enabled,
                    displayOptions: defaultGroupDisplayOptionsForSurface(config.surfaceId, groupKey),
                    fieldModes: defaultFieldModesForSurfaceGroup(
                        config.surfaceId,
                        groupKey,
                        def.defaultFieldKeys,
                    ),
                    sectionSemantic: options?.sectionSemantic,
                    sectionLabel: options?.sectionLabel,
                },
            ],
        };
    }
    return {
        ...config,
        groups: config.groups.map((g) => {
            if (g.key !== groupKey) return g;
            const def = groupDefsFor(config.surfaceId).find((entry) => entry.key === groupKey);
            const selectedFieldKeys =
                enabled && g.selectedFieldKeys.length === 0 && def
                    ? [...def.defaultFieldKeys]
                    : g.selectedFieldKeys;
            return {
                ...g,
                enabled,
                selectedFieldKeys,
                sectionSemantic: options?.sectionSemantic ?? g.sectionSemantic,
                sectionLabel: options?.sectionLabel ?? g.sectionLabel,
            };
        }),
    };
}


export function setNestedGroupSectionLabel(
    config: NestedSurfaceConfig,
    groupKey: string,
    sectionLabel: string,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((g) =>
            g.key === groupKey ? { ...g, sectionLabel: sectionLabel.trim() || undefined } : g,
        ),
    };
}

/** Operator-facing label for a section group (custom section label wins over registry). */
export function nestedGroupLabel(config: NestedSurfaceConfig, groupKey: string): string | null {
    const group = config.groups.find((g) => g.key === groupKey);
    if (group?.sectionLabel?.trim()) return group.sectionLabel.trim();
    return groupDefsFor(config.surfaceId).find((g) => g.key === groupKey)?.label ?? null;
}

export function isDomainLockedGroup(surfaceId: string, groupKey: string): boolean {
    return (DOMAIN_LOCKED_NESTED_GROUP_KEYS[surfaceId] ?? []).includes(groupKey);
}

export function isOptionalNestedGroup(surfaceId: string, groupKey: string): boolean {
    return (OPTIONAL_NESTED_GROUP_KEYS[surfaceId] ?? []).includes(groupKey);
}

/** Evidence sections on a nested surface (configurable archive regions). */
export function isEvidenceSection(surfaceId: string, groupKey: string): boolean {
    if (surfaceId !== CHILDREN_SURFACE_ID) return false;
    return (OPTIONAL_NESTED_GROUP_KEYS[CHILDREN_SURFACE_ID] ?? []).includes(groupKey);
}

/** Enabled evidence sections in persisted order. */
export function enabledEvidenceSections(config: NestedSurfaceConfig): NestedSurfaceGroupConfig[] {
    return config.groups.filter(
        (g) => isEvidenceSection(config.surfaceId, g.key) && isNestedGroupEnabled(config, g.key),
    );
}


function filterPlacementsToConfiguredKeys(group: NestedSurfaceGroupConfig): IdentityFieldPlacement[] {
    const placements = group.fieldPlacements ?? [];
    if (placements.length === 0) return placements;
    const allowed = new Set<string>();
    for (const tier of ["summary", "context_fact", "details"] as const) {
        const purpose = configurationPurposeFromTierArg(tier);
        for (const fieldRef of fieldKeysForConfigurationPurpose(group, purpose)) {
            allowed.add(`${tier}:${fieldRef}`);
        }
    }
    return placements.filter((placement) =>
        allowed.has(`${normalizeIdentityStorageTier(placement.tier)}:${placement.fieldRef}`),
    );
}

/** Merge a loaded config with the current registry (adds new groups, drops stale). */
export function reconcileNestedSurfaceConfig(surfaceId: string, loaded: NestedSurfaceConfig | null): NestedSurfaceConfig {
    const base = defaultNestedSurfaceConfig(surfaceId);
    if (!loaded) return base;
    const mergedGroups = base.groups.map((g) => {
        const found = loaded.groups.find((lg) => lg.key === g.key);
        if (!found) return g;
        const fieldPolicies = found.fieldPolicies
            ? Object.fromEntries(
                  Object.entries(found.fieldPolicies).map(([k, v]) => [k, normalizeFieldVisibility(v)]),
              )
            : undefined;
        const merged: NestedSurfaceGroupConfig = {
            key: g.key,
            selectedFieldKeys: [...found.selectedFieldKeys],
            contextFieldKeys:
                found.contextFieldKeys !== undefined ? [...found.contextFieldKeys] : undefined,
            expandedFieldKeys:
                found.expandedFieldKeys !== undefined ? [...found.expandedFieldKeys] : undefined,
            evidenceCollections: found.evidenceCollections ? [...found.evidenceCollections] : undefined,
            enabled: found.enabled ?? defaultGroupEnabled(surfaceId, g.key),
            displayOptions: found.displayOptions ?? g.displayOptions,
            fieldModes: found.fieldModes ?? g.fieldModes,
            fieldPolicies,
            fieldLabels: found.fieldLabels ? { ...found.fieldLabels } : undefined,
            roleOverride: found.roleOverride,
            fieldLayoutWidths: found.fieldLayoutWidths ? { ...found.fieldLayoutWidths } : undefined,
            fieldPlacements: found.fieldPlacements ? [...found.fieldPlacements] : undefined,
            fieldIcons: found.fieldIcons ? { ...found.fieldIcons } : undefined,
            sectionSemantic: found.sectionSemantic,
            sectionLabel: found.sectionLabel,
            definitionKey: found.definitionKey,
            instanceKey: found.instanceKey,
            presentationRef: found.presentationRef,
            relationshipCriteria: found.relationshipCriteria,
            sectionVisibility: found.sectionVisibility,
            sectionOrder: found.sectionOrder,
        };
        const filteredPlacements = filterPlacementsToConfiguredKeys(merged);
        const placements =
            filteredPlacements.length > 0 || merged.fieldPlacements !== undefined
                ? filteredPlacements
                : generateDefaultIdentityFieldPlacements(merged);
        return {
            ...merged,
            fieldPlacements: placements,
        };
    });

    // Preserve operator-authored section order from loaded config; unknown keys use canonical order.
    const orderIndex = new Map(loaded.groups.map((g, i) => [g.key, i]));
    const canonicalFallback =
        surfaceId === HOUSEHOLD_SURFACE_ID
            ? new Map(HOUSEHOLD_DEFAULT_SECTION_ORDER.map((k, i) => [k, i]))
            : new Map(base.groups.map((g, i) => [g.key, i]));
    mergedGroups.sort((a, b) => {
        const ai = orderIndex.get(a.key) ?? canonicalFallback.get(a.key) ?? 999;
        const bi = orderIndex.get(b.key) ?? canonicalFallback.get(b.key) ?? 999;
        return ai - bi;
    });

    let groupsOut = mergedGroups;
    if (surfaceId === HOUSEHOLD_SURFACE_ID) {
        groupsOut = enforceHouseholdPinnedSectionOrder(
            groupsOut.map((g) => ({
                ...g,
                enabled: (HOUSEHOLD_ALWAYS_ENABLED_KEYS as readonly string[]).includes(g.key)
                    ? true
                    : g.enabled,
            })),
        );
    }

    return {
        surfaceId,
        groups: groupsOut,
        navigation: loaded.navigation ? { ...loaded.navigation } : undefined,
    };
}

function patchNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    patch: (group: NestedSurfaceGroupConfig) => NestedSurfaceGroupConfig,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((group) => (group.key === groupKey ? patch(group) : group)),
    };
}

/** Catalog of evidence collections an operator can attach to one identity group. */
export function catalogEvidenceCollectionsForGroup(surfaceId: string, groupKey: string): IdentityEvidenceCollectionConfig[] {
    const optionalKeys = OPTIONAL_NESTED_GROUP_KEYS[surfaceId] ?? [];
    return groupDefsFor(surfaceId)
        .filter((def) => optionalKeys.includes(def.key) || def.key === groupKey)
        .map((def) => ({
            key: def.key,
            label: def.label,
            sectionSemantic: def.purpose,
            enabled: true,
        }));
}

export function addEvidenceCollectionToGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    collectionKey: string,
): NestedSurfaceConfig {
    const catalog = catalogEvidenceCollectionsForGroup(config.surfaceId, groupKey);
    const collection = catalog.find((entry) => entry.key === collectionKey);
    if (!collection) return config;
    return patchNestedGroup(config, groupKey, (group) => {
        const existing = group.evidenceCollections ?? [];
        if (existing.some((entry) => entry.key === collectionKey)) return group;
        return {
            ...group,
            evidenceCollections: [...existing, { ...collection }],
        };
    });
}

export function removeEvidenceCollectionFromGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    collectionKey: string,
): NestedSurfaceConfig {
    return patchNestedGroup(config, groupKey, (group) => ({
        ...group,
        evidenceCollections: (group.evidenceCollections ?? []).filter((entry) => entry.key !== collectionKey),
    }));
}

export function moveEvidenceCollectionInGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    collectionKey: string,
    direction: -1 | 1,
): NestedSurfaceConfig {
    return patchNestedGroup(config, groupKey, (group) => {
        const collections = [...(group.evidenceCollections ?? [])];
        const index = collections.findIndex((entry) => entry.key === collectionKey);
        if (index < 0) return group;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= collections.length) return group;
        const [entry] = collections.splice(index, 1);
        collections.splice(nextIndex, 0, entry!);
        return { ...group, evidenceCollections: collections };
    });
}

export function setEvidenceCollectionEnabled(
    config: NestedSurfaceConfig,
    groupKey: string,
    collectionKey: string,
    enabled: boolean,
): NestedSurfaceConfig {
    return patchNestedGroup(config, groupKey, (group) => ({
        ...group,
        evidenceCollections: (group.evidenceCollections ?? []).map((entry) =>
            entry.key === collectionKey ? { ...entry, enabled } : entry,
        ),
    }));
}


/** Household relationship sections configurable in Builder (not template/address). */
export function isHouseholdRelationshipSectionKey(groupKey: string): boolean {
    return (
        groupKey === "primary_contact"
        || groupKey === "other_parent_guardian"
        || groupKey === "household_members"
        || groupKey === "emergency_contacts"
        || groupKey === "authorized_pickups"
        || groupKey === "billing_contact"
        || groupKey === "children"
    );
}

export function setNestedGroupSectionVisibility(
    config: NestedSurfaceConfig,
    groupKey: string,
    visibility: "always" | "when_nonempty" | "hidden",
): NestedSurfaceConfig {
    return patchNestedGroup(config, groupKey, (group) => ({ ...group, sectionVisibility: visibility }));
}

export function setNestedGroupRelationshipCriteria(
    config: NestedSurfaceConfig,
    groupKey: string,
    criteria: { roleKeys?: string[]; relationshipTypes?: string[] } | undefined,
): NestedSurfaceConfig {
    return patchNestedGroup(config, groupKey, (group) => ({ ...group, relationshipCriteria: criteria }));
}

export function setNestedGroupRoleOverride(
    config: NestedSurfaceConfig,
    groupKey: string,
    roleOverride: boolean,
): NestedSurfaceConfig {
    return patchNestedGroup(config, groupKey, (group) => ({ ...group, roleOverride: roleOverride || undefined }));
}

/** Resolve a nested group by registry key, instance key, or presentation ref. */
export function resolveNestedGroupConfig(
    config: NestedSurfaceConfig,
    groupKey: string,
): NestedSurfaceGroupConfig | null {
    const direct = config.groups.find((group) => group.key === groupKey);
    if (direct) return direct;
    const byInstance = config.groups.find((group) => (group.instanceKey ?? group.key) === groupKey);
    if (byInstance) return byInstance;
    return config.groups.find((group) => group.presentationRef === groupKey) ?? null;
}
