/**
 * Pure operations for editing a card's Evidence Groups (Card Definition V2).
 *
 * Fields live INSIDE evidence groups; these helpers let the Inspector add/rename/
 * reorder/remove groups, move fields between them, and set per-field ownership +
 * behavior (owner / editable / required / read-only). Every op normalizes the config
 * onto explicit `evidenceGroups` (migrating any legacy flat `fields` on first edit),
 * so authoring always operates on the V2 shape while the runtime keeps reading the
 * flattened fields via `configFields`.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    evidenceGroupsFromConfig,
    type FocusPanelCardConfig,
    type FocusPanelCardField,
    type FocusPanelEvidenceGroup,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";

/** Slug for a new group id from its label (kept unique against existing ids). */
function groupId(label: string, existing: ReadonlyArray<{ id: string }>): string {
    const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group";
    if (!existing.some((g) => g.id === base)) return base;
    let n = 2;
    while (existing.some((g) => g.id === `${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

/** Normalize a config onto explicit evidence groups (migrate legacy flat fields). */
export function normalizeToEvidenceGroups(config: FocusPanelCardConfig | null | undefined): FocusPanelCardConfig {
    const groups = evidenceGroupsFromConfig(config);
    const { fields: _legacy, ...rest } = config ?? {};
    return { ...rest, evidenceGroups: groups };
}

function withGroups(
    config: FocusPanelCardConfig | null | undefined,
    map: (groups: FocusPanelEvidenceGroup[]) => FocusPanelEvidenceGroup[],
): FocusPanelCardConfig {
    const normalized = normalizeToEvidenceGroups(config);
    return { ...normalized, evidenceGroups: map(normalized.evidenceGroups ?? []) };
}

/** Append a new, empty evidence group. */
export function addEvidenceGroup(config: FocusPanelCardConfig | null | undefined, label: string): FocusPanelCardConfig {
    return withGroups(config, (groups) => [...groups, { id: groupId(label, groups), label, fields: [] }]);
}

/** Rename an evidence group. */
export function renameEvidenceGroup(
    config: FocusPanelCardConfig | null | undefined,
    id: string,
    label: string,
): FocusPanelCardConfig {
    return withGroups(config, (groups) => groups.map((g) => (g.id === id ? { ...g, label } : g)));
}

/** Remove an evidence group (and the fields inside it). */
export function removeEvidenceGroup(config: FocusPanelCardConfig | null | undefined, id: string): FocusPanelCardConfig {
    return withGroups(config, (groups) => groups.filter((g) => g.id !== id));
}

/** Reorder a group up (−1) or down (+1). */
export function moveEvidenceGroup(
    config: FocusPanelCardConfig | null | undefined,
    id: string,
    direction: -1 | 1,
): FocusPanelCardConfig {
    return withGroups(config, (groups) => {
        const index = groups.findIndex((g) => g.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= groups.length) return groups;
        const next = groups.slice();
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved!);
        return next;
    });
}

/** Add a field to a group (appended). */
export function addFieldToGroup(
    config: FocusPanelCardConfig | null | undefined,
    groupIdValue: string,
    field: FocusPanelCardField,
): FocusPanelCardConfig {
    return withGroups(config, (groups) =>
        groups.map((g) => (g.id === groupIdValue ? { ...g, fields: [...g.fields, field] } : g)),
    );
}

/** Remove a field from whichever group holds it. */
export function removeFieldFromGroup(
    config: FocusPanelCardConfig | null | undefined,
    fieldId: string,
): FocusPanelCardConfig {
    return withGroups(config, (groups) =>
        groups.map((g) => ({ ...g, fields: g.fields.filter((f) => f.id !== fieldId) })),
    );
}

/** Move a field to another group (kept once; appended to the destination). */
export function moveFieldToGroup(
    config: FocusPanelCardConfig | null | undefined,
    fieldId: string,
    toGroupId: string,
): FocusPanelCardConfig {
    return withGroups(config, (groups) => {
        let moved: FocusPanelCardField | null = null;
        const stripped = groups.map((g) => {
            const field = g.fields.find((f) => f.id === fieldId);
            if (field) moved = field;
            return { ...g, fields: g.fields.filter((f) => f.id !== fieldId) };
        });
        if (!moved) return groups;
        return stripped.map((g) => (g.id === toGroupId ? { ...g, fields: [...g.fields, moved!] } : g));
    });
}

/** Per-field ownership + behavior the Inspector edits (Part 4). */
export type FieldOwnershipPatch = {
    owner?: FocusPanelCardKey;
    editable?: boolean;
    required?: boolean;
    readOnly?: boolean;
};

/** Set ownership / behavior flags on a field (in whichever group holds it). */
export function setFieldOwnership(
    config: FocusPanelCardConfig | null | undefined,
    fieldId: string,
    patch: FieldOwnershipPatch,
): FocusPanelCardConfig {
    return withGroups(config, (groups) =>
        groups.map((g) => ({
            ...g,
            fields: g.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
        })),
    );
}
