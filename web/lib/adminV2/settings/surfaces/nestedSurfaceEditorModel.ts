/**
 * Nested Surface editor model (Experience Builder V3 — /surfaces FP slice).
 *
 * A card's Expanded/Workspace depth opens a nested Surface (Children Surface,
 * Financial Configuration Surface). This model owns the EDITABLE composition of
 * those nested surfaces: named evidence groups, each with a selected set of
 * Composition Items (fields), configured by the operator.
 *
 * Availability is namespace-driven (V3 §5): a group offers real platform fields
 * plus real tenant custom fields whose namespace it accepts — never fabricated
 * fields (no fake payers / invoices / estimates). Groups with no compatible real
 * fields render an honest empty state.
 *
 * Pure + framework-free (unit-testable). Persisted into the Focus Panel summary
 * layout doc metadata (`metadata.nestedSurfaces[surfaceId]`) — see
 * nestedSurfaceConfigService.ts. Live runtime consumption is deferred
 * (presentation-runtime-ready).
 *
 * @see lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs.ts
 * @see lib/adminV2/settings/surfaces/compositionFieldAdapter.ts (availableFieldsForNamespaces)
 */

import {
    availableFieldsForNamespaces,
    type AvailableField,
    type AvailableFieldEntityNamespace,
} from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export const CHILDREN_SURFACE_ID = "children_surface";
export const FINANCIAL_CONFIG_SURFACE_ID = "financial_configuration_surface";
export const NESTED_SURFACE_IDS = [CHILDREN_SURFACE_ID, FINANCIAL_CONFIG_SURFACE_ID] as const;

export function isNestedSurfaceId(id: string): boolean {
    return (NESTED_SURFACE_IDS as readonly string[]).includes(id);
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

/** Registry of nested surfaces → their named evidence groups. */
export const NESTED_SURFACE_DEFS: Record<string, { label: string; groups: NestedSurfaceGroupDef[] }> = {
    [CHILDREN_SURFACE_ID]: {
        label: "Children Surface",
        groups: [
            {
                key: "child_summary",
                label: "Child Summary",
                purpose: "Who is this child and what is their status?",
                acceptedNamespaces: ["child", "inquiry_child"],
                defaultFieldKeys: ["child.name", "child.date_of_birth", "child.status"],
            },
            {
                key: "placement",
                label: "Placement",
                purpose: "Where is this child placed?",
                acceptedNamespaces: ["child", "inquiry_child"],
                defaultFieldKeys: ["inquiry_child.program", "child.room", "child.start_date"],
            },
            {
                key: "schedule",
                label: "Schedule",
                purpose: "What schedule is requested / assigned?",
                acceptedNamespaces: ["inquiry_child", "child"],
                defaultFieldKeys: ["inquiry_child.schedule_type"],
            },
            {
                key: "medical",
                label: "Medical",
                purpose: "What should we know medically?",
                acceptedNamespaces: ["child", "inquiry_child"],
                defaultFieldKeys: [],
            },
            {
                key: "documents",
                label: "Documents",
                purpose: "What documents are required / received?",
                acceptedNamespaces: ["child", "inquiry_child"],
                defaultFieldKeys: [],
            },
        ],
    },
    [FINANCIAL_CONFIG_SURFACE_ID]: {
        label: "Financial Configuration Surface",
        groups: [
            {
                key: "placement_tuition",
                label: "Placement & Tuition",
                purpose: "What placement drives the tuition?",
                acceptedNamespaces: ["opportunity", "inquiry_child"],
                defaultFieldKeys: [],
            },
            {
                key: "billing_configuration",
                label: "Billing Configuration",
                purpose: "What is the resolved billing configuration?",
                acceptedNamespaces: ["opportunity"],
                defaultFieldKeys: [],
            },
            {
                key: "billing_responsibility",
                label: "Billing Responsibility",
                purpose: "Who is responsible for billing?",
                acceptedNamespaces: ["customer", "person"],
                defaultFieldKeys: [],
            },
            {
                key: "history_activity",
                label: "History / Activity",
                purpose: "How has the configuration changed? (real records only)",
                acceptedNamespaces: ["opportunity"],
                defaultFieldKeys: [],
            },
        ],
    },
};

export type NestedSurfaceGroupConfig = {
    key: string;
    selectedFieldKeys: string[];
};

export type NestedSurfaceConfig = {
    surfaceId: string;
    groups: NestedSurfaceGroupConfig[];
};

export function nestedSurfaceLabel(surfaceId: string): string {
    return NESTED_SURFACE_DEFS[surfaceId]?.label ?? surfaceId;
}

export function groupDefsFor(surfaceId: string): NestedSurfaceGroupDef[] {
    return NESTED_SURFACE_DEFS[surfaceId]?.groups ?? [];
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
