/**
 * Focus Panel composer — field-level placement model for card evidence groups.
 *
 * Mirrors queue row composer: multiple fields per card section via builderSlot,
 * stackLine, and inlineWithPrevious. Placement overrides persist on
 * `FocusPanelCardConfig.fieldPlacements`.
 */

import type { LayoutCondition } from "@/lib/layout/layoutV2";
import type {
    FocusPanelCardConfig,
    FocusPanelCardField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import {
    configFields,
    defaultEvidenceGroupsForCard,
    evidenceGroupsFromConfig,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import {
    addFieldToGroup,
    moveFieldToGroup,
    moveFieldWithinGroup,
    normalizeToEvidenceGroups,
    removeFieldFromGroup,
    updateFieldInGroups,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelEvidenceGroupOps";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    resolveSurfaceComposerDefaultAppendPlacement,
    surfaceComposerInlineFromPlacementMode,
    surfaceComposerPlacementModeFromInline,
    type SurfaceComposerPlacedItemRef,
} from "@/lib/adminV2/settings/surfaces/surfaceComposerPlacementModel";

/** Card anatomy sections — map to shared Section labels. */
export type FocusPanelCardFieldSectionKey = import("@/lib/adminV2/settings/surfaces/surfaceFieldComposer").SurfaceFieldSectionKey;

export { SURFACE_FIELD_SECTION_LABELS as FOCUS_PANEL_CARD_SECTION_LABELS } from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";
export { SURFACE_COMPOSER_MAX_FIELDS_PER_LINE as MAX_FIELDS_PER_CARD_LINE } from "@/lib/adminV2/settings/surfaces/surfaceComposerPlacementModel";

export type FocusPanelFieldPlacementOverride = {
    builderSlot?: FocusPanelCardFieldSectionKey;
    stackLine?: number;
    inlineWithPrevious?: boolean;
    visibleWhen?: LayoutCondition | null;
};

export type FocusPanelPlacedFieldRef = {
    id: string;
    cardKey: FocusPanelCardKey;
    groupId: string;
    fieldId: string;
    concept: string;
    label: string;
    builderSlot: FocusPanelCardFieldSectionKey;
    stackLine: number;
    inlineWithPrevious: boolean;
    visibleWhen?: LayoutCondition | null;
};

export function placedFocusPanelFieldId(groupId: string, fieldId: string): string {
    return `${groupId}:${fieldId}`;
}

function placementForField(
    config: FocusPanelCardConfig,
    fieldId: string,
): FocusPanelFieldPlacementOverride {
    return config.fieldPlacements?.[fieldId] ?? {};
}

export function listPlacedFocusPanelFields(
    cardKey: FocusPanelCardKey,
    config: FocusPanelCardConfig,
): FocusPanelPlacedFieldRef[] {
    const groups = evidenceGroupsFromConfig(config);
    const placed: FocusPanelPlacedFieldRef[] = [];

    for (const group of groups) {
        for (const field of group.fields) {
            const override = placementForField(config, field.id);
            placed.push({
                id: placedFocusPanelFieldId(group.id, field.id),
                cardKey,
                groupId: group.id,
                fieldId: field.id,
                concept: field.concept,
                label: field.label,
                builderSlot: override.builderSlot ?? "identity",
                stackLine: override.stackLine ?? 0,
                inlineWithPrevious: override.inlineWithPrevious ?? false,
                visibleWhen: override.visibleWhen ?? null,
            });
        }
    }
    return placed;
}

export function resolveDefaultAppendPlacement(
    placed: readonly FocusPanelPlacedFieldRef[],
    section: FocusPanelCardFieldSectionKey,
): FocusPanelFieldPlacementOverride {
    return resolveSurfaceComposerDefaultAppendPlacement(placed, section);
}

function withFieldPlacement(
    config: FocusPanelCardConfig,
    fieldId: string,
    patch: FocusPanelFieldPlacementOverride,
): FocusPanelCardConfig {
    const existing = config.fieldPlacements?.[fieldId] ?? {};
    return {
        ...config,
        fieldPlacements: {
            ...config.fieldPlacements,
            [fieldId]: { ...existing, ...patch },
        },
    };
}

export function moveFocusPanelPlacedField(
    config: FocusPanelCardConfig,
    fieldId: string,
    patch: FocusPanelFieldPlacementOverride,
): FocusPanelCardConfig {
    return withFieldPlacement(config, fieldId, patch);
}

export function removeFocusPanelPlacedField(
    config: FocusPanelCardConfig,
    fieldId: string,
): FocusPanelCardConfig {
    const next = removeFieldFromGroup(config, fieldId);
    if (!next.fieldPlacements?.[fieldId]) return next;
    const { [fieldId]: _removed, ...rest } = next.fieldPlacements;
    return { ...next, fieldPlacements: Object.keys(rest).length > 0 ? rest : undefined };
}

export function reorderFocusPanelPlacedField(
    config: FocusPanelCardConfig,
    fieldId: string,
    direction: "earlier" | "later",
): FocusPanelCardConfig {
    return moveFieldWithinGroup(config, fieldId, direction === "earlier" ? -1 : 1);
}

export function moveFocusPanelFieldToSection(
    config: FocusPanelCardConfig,
    fieldId: string,
    section: FocusPanelCardFieldSectionKey,
    placed: readonly FocusPanelPlacedFieldRef[],
): FocusPanelCardConfig {
    const append = resolveDefaultAppendPlacement(
        placed.filter((f) => f.fieldId !== fieldId),
        section,
    );
    return withFieldPlacement(config, fieldId, append);
}

export function addFocusPanelFieldFromLibrary(
    config: FocusPanelCardConfig,
    cardKey: FocusPanelCardKey,
    input: {
        groupId: string;
        concept: string;
        label: string;
        placement: FocusPanelFieldPlacementOverride;
    },
): FocusPanelCardConfig {
    const fieldId = `fp-field-${Date.now()}`;
    const newField: FocusPanelCardField = {
        id: fieldId,
        label: input.label,
        concept: input.concept,
        renderer: "text",
        placement: "collapsed",
        kind: "field",
    };
    let next = normalizeToEvidenceGroups(config);
    next = addFieldToGroup(next, input.groupId, newField);
    next = withFieldPlacement(next, fieldId, input.placement);
    return next;
}

export function seedFocusPanelComposerConfig(
    cardKey: FocusPanelCardKey,
    config: FocusPanelCardConfig,
): FocusPanelCardConfig {
    if (config.evidenceGroups && config.evidenceGroups.length > 0) return normalizeToEvidenceGroups(config);
    return {
        ...config,
        evidenceGroups: defaultEvidenceGroupsForCard(cardKey, config.fields ?? []),
    };
}

export function focusPanelPlacementModeFromInline(inlineWithPrevious: boolean) {
    return surfaceComposerPlacementModeFromInline(inlineWithPrevious);
}

export function focusPanelInlineFromPlacementMode(mode: import("@/lib/adminV2/settings/surfaces/surfaceFieldComposer").SurfaceFieldPlacementMode) {
    return surfaceComposerInlineFromPlacementMode(mode);
}

/** Map focus panel placed field to shared composer inspector shape. */
export function toSurfaceComposerPlacedItemRef(field: FocusPanelPlacedFieldRef): SurfaceComposerPlacedItemRef {
    return {
        fieldId: field.fieldId,
        label: field.label,
        builderSlot: field.builderSlot,
        stackLine: field.stackLine,
        inlineWithPrevious: field.inlineWithPrevious,
    };
}

export function patchFocusPanelFieldLabel(
    config: FocusPanelCardConfig,
    fieldId: string,
    label: string,
): FocusPanelCardConfig {
    return updateFieldInGroups(config, fieldId, { label });
}

export function moveFocusPanelFieldToGroup(
    config: FocusPanelCardConfig,
    fieldId: string,
    toGroupId: string,
): FocusPanelCardConfig {
    return moveFieldToGroup(config, fieldId, toGroupId);
}

export function allFocusPanelConfigFieldIds(config: FocusPanelCardConfig): string[] {
    return configFields(config).map((f) => f.id);
}
