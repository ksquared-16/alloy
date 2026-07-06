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
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import { getSurface } from "@/lib/platform/surfaceComposition/surfaceRegistry";
import { surfaceComponents } from "@/lib/platform/surfaceComposition/universalSurfaceModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export const CHILDREN_SURFACE_ID = "children_surface";
export const FINANCIAL_CONFIG_SURFACE_ID = "financial_configuration_surface";

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
};

export type NestedSurfaceConfig = {
    surfaceId: string;
    groups: NestedSurfaceGroupConfig[];
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

/** Seed a default config (each group selects its default real fields). */
export function defaultNestedSurfaceConfig(surfaceId: string): NestedSurfaceConfig {
    return {
        surfaceId,
        groups: groupDefsFor(surfaceId).map((g) => ({
            key: g.key,
            selectedFieldKeys: [...g.defaultFieldKeys],
        })),
    };
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

/** Merge a loaded config with the current registry (adds new groups, drops stale). */
export function reconcileNestedSurfaceConfig(surfaceId: string, loaded: NestedSurfaceConfig | null): NestedSurfaceConfig {
    const base = defaultNestedSurfaceConfig(surfaceId);
    if (!loaded) return base;
    return {
        surfaceId,
        groups: base.groups.map((g) => {
            const found = loaded.groups.find((lg) => lg.key === g.key);
            return found ? { key: g.key, selectedFieldKeys: [...found.selectedFieldKeys] } : g;
        }),
    };
}
