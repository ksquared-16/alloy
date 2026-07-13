/**
 * Section ordering for nested runtime surfaces (Surface Composer V3.5).
 *
 * Sections are first-class: operators reorder them within a surface while structure
 * stays valid. Order persists on `NestedSurfaceConfig.groups` array sequence.
 */

import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

/** Group keys in persisted section order. */
export function nestedGroupKeysInOrder(config: NestedSurfaceConfig): string[] {
    return config.groups.map((g) => g.key);
}

/** Primary Contact and Other Parent stay pinned at the top of Household drill-in. */
export function isHouseholdSectionPinned(groupKey: string): boolean {
    return groupKey === "primary_contact" || groupKey === "other_parent_guardian";
}

/** First index after pinned household sections (reorderable block starts here). */
export function householdReorderableStartIndex(config: NestedSurfaceConfig): number {
    const keys = config.groups.map((g) => g.key);
    const otherParentIdx = keys.indexOf("other_parent_guardian");
    if (otherParentIdx >= 0) return otherParentIdx + 1;
    const primaryIdx = keys.indexOf("primary_contact");
    return primaryIdx >= 0 ? primaryIdx + 1 : 0;
}

export function canMoveHouseholdSection(
    config: NestedSurfaceConfig,
    groupKey: string,
    delta: number,
): boolean {
    if (isHouseholdSectionPinned(groupKey)) return false;
    const keys = config.groups.map((g) => g.key);
    const index = keys.indexOf(groupKey);
    if (index < 0) return false;
    const target = index + delta;
    const reorderStart = householdReorderableStartIndex(config);
    if (target < reorderStart) return false;
    return target >= 0 && target < keys.length;
}

/** Reorder a section by delta (-1 up, +1 down) within config.groups. */
export function moveSectionInNestedConfig(
    config: NestedSurfaceConfig,
    groupKey: string,
    delta: number,
): NestedSurfaceConfig {
    if (config.surfaceId === HOUSEHOLD_SURFACE_ID && !canMoveHouseholdSection(config, groupKey, delta)) {
        return config;
    }
    const groups = [...config.groups];
    const i = groups.findIndex((g) => g.key === groupKey);
    if (i < 0) return config;
    const j = Math.max(0, Math.min(groups.length - 1, i + delta));
    if (i === j) return config;
    const [item] = groups.splice(i, 1);
    groups.splice(j, 0, item);
    return { ...config, groups };
}

/** Sort runtime section rows by published nested-surface order (unknown keys trail). */
export function sortByNestedSectionOrder<T extends { key: string }>(
    items: T[],
    config: NestedSurfaceConfig | null,
    fallbackKeys?: readonly string[],
): T[] {
    const fallback = fallbackKeys ? new Map(fallbackKeys.map((k, i) => [k, i])) : null;
    const order = config ? new Map(config.groups.map((g, i) => [g.key, i])) : fallback;
    if (!order && !fallback) return items;
    return [...items].sort((a, b) => {
        const ai = (order?.has(a.key) ? order.get(a.key) : undefined) ?? fallback?.get(a.key) ?? 999;
        const bi = (order?.has(b.key) ? order.get(b.key) : undefined) ?? fallback?.get(b.key) ?? 999;
        return ai - bi;
    });
}

/** Default household section order when no published config exists. */
export const HOUSEHOLD_DEFAULT_SECTION_ORDER = [
    "primary_contact",
    "other_parent_guardian",
    "household_members",
    "emergency_contacts",
    "authorized_pickups",
    "children",
    "address",
    "billing_contact",
] as const;

/**
 * Household sections that cannot be soft-deleted via Builder.
 * Primary Contact remains required. Children stays as a handoff section when present.
 * Optional/default sections (Additional Contacts, Emergency Contacts, etc.) must honor
 * explicit `enabled: false` and must NOT be force-reenabled on reconcile.
 */
export const HOUSEHOLD_ALWAYS_ENABLED_KEYS = [
    "primary_contact",
    "children",
] as const;

/** Reorder nested-surface group configs to a canonical section order. */
export function orderNestedGroupsByCanonicalKeys<T extends { key: string }>(
    groups: T[],
    canonicalKeys: readonly string[],
): T[] {
    const order = new Map(canonicalKeys.map((k, i) => [k, i]));
    return [...groups].sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
}

/** Keep Primary Contact and Other Parent pinned at the top of household config. */
export function enforceHouseholdPinnedSectionOrder<T extends { key: string }>(groups: T[]): T[] {
    const result = [...groups];
    const pin = (key: string, slot: number) => {
        const i = result.findIndex((g) => g.key === key);
        if (i < 0) return;
        const [item] = result.splice(i, 1);
        result.splice(Math.min(slot, result.length), 0, item);
    };
    pin("primary_contact", 0);
    pin("other_parent_guardian", 1);
    return result;
}

/** Operational + evidence section keys on the Children surface. */
export const CHILDREN_EVIDENCE_SECTION_KEYS = [
    "medical",
    "documents",
    "pickup",
    "communications",
    "notes",
    "nickname",
    "custom_notes",
] as const;
