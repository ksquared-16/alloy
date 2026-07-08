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
import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";

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
    selectedFieldKeys: string[];
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
    /**
     * Stable semantic identity for an operator-added section (from the platform section
     * catalog). Preserved so future BOS/AI understand what the section MEANS even after
     * the operator relabels it. Fixed structural groups leave this undefined.
     */
    sectionSemantic?: string;
    /** Operator-chosen section label (custom sections); overrides the registry label. */
    sectionLabel?: string;
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

/** Seed a default config (each group selects its default real fields). */
export function defaultNestedSurfaceConfig(surfaceId: string): NestedSurfaceConfig {
    let groups = groupDefsFor(surfaceId).map((g) => ({
        key: g.key,
        selectedFieldKeys:
            g.key === "roster" && surfaceId === CHILDREN_SURFACE_ID ? [] : [...g.defaultFieldKeys],
        enabled: defaultGroupEnabled(surfaceId, g.key),
        displayOptions: defaultGroupDisplayOptionsForSurface(surfaceId, g.key),
        fieldModes: defaultFieldModesForSurfaceGroup(surfaceId, g.key, g.defaultFieldKeys),
    }));
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
): AvailableField[] {
    const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    if (!def) return [];
    const selected = new Set(selectedFieldKeys(config, groupKey));
    return availableFieldsForNamespaces(def.acceptedNamespaces, tenantFieldDefinitions).filter(
        (f) => !selected.has(f.key),
    );
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

export function addFieldToNestedGroup(config: NestedSurfaceConfig, groupKey: string, fieldKey: string): NestedSurfaceConfig {
    return patchGroup(config, groupKey, (keys) => (keys.includes(fieldKey) ? keys : [...keys, fieldKey]));
}

export function removeFieldFromNestedGroup(config: NestedSurfaceConfig, groupKey: string, fieldKey: string): NestedSurfaceConfig {
    return patchGroup(config, groupKey, (keys) => keys.filter((k) => k !== fieldKey));
}

/** Reorder a field within its group by delta (-1 up, +1 down). */
export function moveFieldInNestedGroup(config: NestedSurfaceConfig, groupKey: string, fieldKey: string, delta: number): NestedSurfaceConfig {
    return patchGroup(config, groupKey, (keys) => {
        const i = keys.indexOf(fieldKey);
        if (i < 0) return keys;
        const j = Math.max(0, Math.min(keys.length - 1, i + delta));
        if (i === j) return keys;
        const next = [...keys];
        const [item] = next.splice(i, 1);
        next.splice(j, 0, item);
        return next;
    });
}

export function setFieldVisibilityInNestedGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
    visibility: SurfaceFieldVisibility,
): NestedSurfaceConfig {
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
): SurfaceFieldVisibility {
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
        groups: config.groups.map((g) =>
            g.key === groupKey
                ? {
                      ...g,
                      enabled,
                      sectionSemantic: options?.sectionSemantic ?? g.sectionSemantic,
                      sectionLabel: options?.sectionLabel ?? g.sectionLabel,
                  }
                : g,
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
        return {
            key: g.key,
            selectedFieldKeys: [...found.selectedFieldKeys],
            enabled: found.enabled ?? defaultGroupEnabled(surfaceId, g.key),
            displayOptions: found.displayOptions ?? g.displayOptions,
            fieldModes: found.fieldModes ?? g.fieldModes,
            fieldPolicies,
            fieldLabels: found.fieldLabels ? { ...found.fieldLabels } : undefined,
            fieldLayoutWidths: found.fieldLayoutWidths ? { ...found.fieldLayoutWidths } : undefined,
            sectionSemantic: found.sectionSemantic,
            sectionLabel: found.sectionLabel,
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
