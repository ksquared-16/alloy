/**
 * Queue Row composer — field-level placement model for the builder.
 *
 * Maps operator field placements onto existing V3 column/block persistence:
 * multiple fields per canvas area via shared columns, inlineWithPrevious, and rowIndex.
 */

import type {
    QueueRecordBlockConfig,
    QueueRecordColumnConfig,
    QueueRecordFieldConfig,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { nextQueueRecordColumnId, nextQueueRecordFieldId } from "@/lib/layout/queueRecordLayoutIds";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import {
    defaultCanvasSlotForZone,
    type CanvasAnatomyRegion,
    type QueueRowCanvasZoneKey,
} from "@/lib/adminV2/settings/surfaces/queueRowCanvasRegions";
import { SURFACE_FIELD_SECTION_LABELS } from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";

export type ComposerZoneKey = QueueRowCanvasZoneKey;

export type PlacedFieldRef = {
    id: string;
    zoneKey: ComposerZoneKey;
    blockId: string;
    fieldKey: string;
    label: string;
    kind: "field" | "widget";
    widgetKey?: string;
    builderSlot: CanvasAnatomyRegion;
    stackLine: number;
    inlineWithPrevious: boolean;
};

export type FieldPlacementOverride = {
    builderSlot?: CanvasAnatomyRegion;
    stackLine?: number;
    inlineWithPrevious?: boolean;
};

export function placedFieldId(zoneKey: ComposerZoneKey, blockId: string, fieldKey: string): string {
    return `${zoneKey}:${blockId}:${fieldKey}`;
}

const ZONE_WIDTH_MAP: Partial<Record<ComposerZoneKey, QueueRecordColumnConfig["width"]>> = {
    household: "identity",
    children: "children",
    status: "status_band",
    attention: "next_step",
    date_event: "date_event",
};

export function zoneKeyForColumnWidth(width: QueueRecordColumnConfig["width"]): ComposerZoneKey | null {
    const entry = Object.entries(ZONE_WIDTH_MAP).find(([, w]) => w === width);
    return (entry?.[0] as ComposerZoneKey | undefined) ?? null;
}

type FieldToggleLike = {
    fieldKey: string;
    label: string;
    enabled: boolean;
};

type EvidenceGroupLike = {
    blockId: string;
    enabled: boolean;
    fields: FieldToggleLike[];
};

export type ZoneComposerState = {
    key: ComposerZoneKey;
    inRow: boolean;
    canvasSlot: CanvasAnatomyRegion | null;
    rowIndex: number;
    columnLabel: string;
    visibleWhen: import("@/lib/layout/layoutV2").LayoutCondition | null;
    evidenceGroups: EvidenceGroupLike[];
    /** Per-field placement overrides (builderSlot, stack line, inline). */
    fieldPlacements: Record<string, FieldPlacementOverride>;
    /** Enabled field keys in display order within this zone. */
    fieldOrder: string[];
};

export function listPlacedFields(zones: readonly ZoneComposerState[]): PlacedFieldRef[] {
    const placed: PlacedFieldRef[] = [];
    for (const zone of zones) {
        if (!zone.inRow || zone.key === "actions") continue;
        const defaultSlot = zone.canvasSlot ?? defaultCanvasSlotForZone(zone.key);
        if (!defaultSlot) continue;

        const enabledKeys = new Set<string>();
        for (const group of zone.evidenceGroups) {
            if (!group.enabled) continue;
            for (const field of group.fields) {
                if (field.enabled) enabledKeys.add(field.fieldKey);
            }
        }

        const order = zone.fieldOrder.filter((k) => enabledKeys.has(k));
        for (const key of enabledKeys) {
            if (!order.includes(key)) order.push(key);
        }

        for (const fieldKey of order) {
            const group = zone.evidenceGroups.find(
                (g) => g.enabled && g.fields.some((f) => f.fieldKey === fieldKey && f.enabled),
            );
            if (!group) continue;
            const field = group.fields.find((f) => f.fieldKey === fieldKey && f.enabled);
            if (!field) continue;
            const override = zone.fieldPlacements[fieldKey] ?? {};
            placed.push({
                id: placedFieldId(zone.key, group.blockId, fieldKey),
                zoneKey: zone.key,
                blockId: group.blockId,
                fieldKey,
                label: field.label,
                kind: "field",
                builderSlot: override.builderSlot ?? defaultSlot,
                stackLine: override.stackLine ?? zone.rowIndex ?? 0,
                inlineWithPrevious: override.inlineWithPrevious ?? false,
            });
        }
    }
    return placed;
}

type ColumnBatch = {
    zoneKey: ComposerZoneKey;
    builderSlot: CanvasAnatomyRegion;
    stackLine: number;
    fields: PlacedFieldRef[];
};

function groupPlacedFieldsIntoBatches(fields: readonly PlacedFieldRef[]): ColumnBatch[] {
    const batches: ColumnBatch[] = [];
    for (const field of fields) {
        const existing = batches.find(
            (b) =>
                b.zoneKey === field.zoneKey &&
                b.builderSlot === field.builderSlot &&
                b.stackLine === field.stackLine,
        );
        if (existing) {
            existing.fields.push(field);
        } else {
            batches.push({
                zoneKey: field.zoneKey,
                builderSlot: field.builderSlot,
                stackLine: field.stackLine,
                fields: [field],
            });
        }
    }
    return batches;
}

function synthesizeFieldConfig(field: PlacedFieldRef, template?: QueueRecordFieldConfig): QueueRecordFieldConfig {
    return {
        id: template?.id ?? nextQueueRecordFieldId(),
        fieldKey: field.fieldKey,
        label: template?.label ?? field.label,
        display: template?.display ?? "text",
        inlineWithPrevious: field.inlineWithPrevious,
    };
}

export function buildColumnsFromPlacedFields(
    placed: readonly PlacedFieldRef[],
    catalog: Map<ComposerZoneKey, QueueRecordColumnConfig>,
    existingColumns: readonly QueueRecordColumnConfig[],
): QueueRecordColumnConfig[] {
    const batches = groupPlacedFieldsIntoBatches(placed);
    const existingByWidth = new Map(existingColumns.map((c) => [c.width, c]));

    return batches.flatMap((batch) => {
        const catalogCol = catalog.get(batch.zoneKey) ?? existingByWidth.get(ZONE_WIDTH_MAP[batch.zoneKey] ?? "small");
        if (!catalogCol) return [];

        const primaryBlock = catalogCol.blocks.find(
            (b) => b.type === "field_group" || b.type === "repeated_record_block",
        );
        if (!primaryBlock || (primaryBlock.type !== "field_group" && primaryBlock.type !== "repeated_record_block")) {
            return [];
        }

        const templateFields = new Map(primaryBlock.fields.map((f) => [f.fieldKey, f]));
        const mergedFields = batch.fields.map((f) => synthesizeFieldConfig(f, templateFields.get(f.fieldKey)));

        const block: QueueRecordBlockConfig =
            primaryBlock.type === "field_group"
                ? {
                      ...primaryBlock,
                      fields: mergedFields,
                      layout: mergedFields.some((f) => f.inlineWithPrevious) ? "inline" : "stack",
                  }
                : {
                      ...primaryBlock,
                      fields: mergedFields,
                  };

        const col: QueueRecordColumnConfig = {
            ...catalogCol,
            id: nextQueueRecordColumnId(),
            label: catalogCol.label,
            width: catalogCol.width,
            rowIndex: batch.stackLine,
            builderSlot: batch.builderSlot,
            blocks: [block],
        };
        return [col];
    });
}

export function ingestConfigIntoZoneState(
    config: QueueRecordLayoutConfigV3,
    baseZones: ZoneComposerState[],
): ZoneComposerState[] {
    const zoneMap = new Map(baseZones.map((z) => [z.key, { ...z, fieldPlacements: { ...z.fieldPlacements }, fieldOrder: [...z.fieldOrder] }]));

    for (const col of config.columns) {
        const zoneKey = zoneKeyForColumnWidth(col.width);
        if (!zoneKey) continue;
        const zone = zoneMap.get(zoneKey);
        if (!zone) continue;

        zone.inRow = true;
        if (!zone.canvasSlot && col.builderSlot) {
            zone.canvasSlot = col.builderSlot as CanvasAnatomyRegion;
        }

        for (const block of col.blocks) {
            if (block.type === "field_group" || block.type === "repeated_record_block") {
                for (const field of block.fields) {
                    const key = field.fieldKey;
                    if (!zone.fieldOrder.includes(key)) zone.fieldOrder.push(key);
                    zone.fieldPlacements[key] = {
                        builderSlot: (col.builderSlot as CanvasAnatomyRegion | undefined) ?? zone.fieldPlacements[key]?.builderSlot,
                        stackLine: col.rowIndex ?? 0,
                        inlineWithPrevious: field.inlineWithPrevious ?? false,
                    };
                    let matched = false;
                    for (const group of zone.evidenceGroups) {
                        const toggle = group.fields.find((f) => f.fieldKey === key);
                        if (toggle) {
                            toggle.enabled = true;
                            matched = true;
                        }
                        if (group.fields.some((f) => f.fieldKey === key)) group.enabled = true;
                    }
                    if (!matched) {
                        const targetGroup = zone.evidenceGroups.find((g) => g.blockId === block.id) ?? zone.evidenceGroups[0];
                        if (targetGroup) {
                            targetGroup.enabled = true;
                            if (!targetGroup.fields.some((f) => f.fieldKey === key)) {
                                targetGroup.fields.push({
                                    fieldKey: key,
                                    label: field.label ?? key,
                                    enabled: true,
                                });
                            } else {
                                targetGroup.fields = targetGroup.fields.map((f) =>
                                    f.fieldKey === key ? { ...f, enabled: true } : f,
                                );
                            }
                        }
                    }
                }
            }
            if (block.type === "widget") {
                const widgetKey = block.widgetKey;
                const group = zone.evidenceGroups.find((g) => g.blockId === block.id);
                if (group) group.enabled = true;
                const pseudoKey = `widget:${widgetKey}`;
                if (!zone.fieldOrder.includes(pseudoKey)) zone.fieldOrder.push(pseudoKey);
            }
        }
    }

    return [...zoneMap.values(), ...baseZones.filter((z) => z.key === "actions")].filter(
        (z, i, arr) => arr.findIndex((x) => x.key === z.key) === i,
    );
}

export function movePlacedField(
    zones: ZoneComposerState[],
    fieldId: string,
    patch: Partial<FieldPlacementOverride>,
): ZoneComposerState[] {
    const field = listPlacedFields(zones).find((f) => f.id === fieldId);
    if (!field) return zones;
    return zones.map((z) => {
        if (z.key !== field.zoneKey) return z;
        const prev = z.fieldPlacements[field.fieldKey] ?? {};
        return {
            ...z,
            fieldPlacements: {
                ...z.fieldPlacements,
                [field.fieldKey]: { ...prev, ...patch },
            },
        };
    });
}

export function removePlacedField(zones: ZoneComposerState[], fieldId: string): ZoneComposerState[] {
    const field = listPlacedFields(zones).find((f) => f.id === fieldId);
    if (!field) return zones;
    return zones.map((z) => {
        if (z.key !== field.zoneKey) return z;
        const fieldOrder = z.fieldOrder.filter((k) => k !== field.fieldKey);
        const { [field.fieldKey]: _, ...fieldPlacements } = z.fieldPlacements;
        const updatedGroups = z.evidenceGroups.map((g) => ({
            ...g,
            fields: g.fields.map((f) =>
                f.fieldKey === field.fieldKey ? { ...f, enabled: false } : f,
            ),
        }));
        return {
            ...z,
            fieldOrder,
            fieldPlacements,
            evidenceGroups: updatedGroups,
            inRow: updatedGroups.some((g) => g.fields.some((f) => f.enabled)),
        };
    });
}

export function reorderPlacedField(
    zones: ZoneComposerState[],
    fieldId: string,
    direction: -1 | 1,
): ZoneComposerState[] {
    const field = listPlacedFields(zones).find((f) => f.id === fieldId);
    if (!field) return zones;
    return zones.map((z) => {
        if (z.key !== field.zoneKey) return z;
        const order = [...z.fieldOrder];
        const idx = order.indexOf(field.fieldKey);
        if (idx === -1) return z;
        const target = idx + direction;
        if (target < 0 || target >= order.length) return z;
        const next = [...order];
        [next[idx], next[target]] = [next[target], next[idx]];
        return { ...z, fieldOrder: next };
    });
}

/** Split a region box into per-field hit targets (vertical stack). */
export function fieldHitBoxes(
    fieldsInRegion: readonly PlacedFieldRef[],
): { field: PlacedFieldRef; topPct: number; heightPct: number }[] {
    if (fieldsInRegion.length === 0) return [];
    const byLine = new Map<number, PlacedFieldRef[]>();
    for (const f of fieldsInRegion) {
        const list = byLine.get(f.stackLine) ?? [];
        list.push(f);
        byLine.set(f.stackLine, list);
    }
    const lines = [...byLine.keys()].sort((a, b) => a - b);
    const lineHeight = 100 / Math.max(lines.length, 1);
    const boxes: { field: PlacedFieldRef; topPct: number; heightPct: number }[] = [];
    lines.forEach((line, lineIdx) => {
        const lineFields = byLine.get(line) ?? [];
        const subHeight = lineHeight / Math.max(lineFields.length, 1);
        lineFields.forEach((field, fieldIdx) => {
            boxes.push({
                field,
                topPct: lineIdx * lineHeight + fieldIdx * subHeight,
                heightPct: subHeight,
            });
        });
    });
    return boxes;
}

export const CANVAS_AREA_LABELS = SURFACE_FIELD_SECTION_LABELS as Record<CanvasAnatomyRegion, string>;

export { SURFACE_FIELD_SECTION_LABELS };

export function isActionsZoneKey(key: string): key is "actions" {
    return key === "actions";
}

export function allComposerZoneKeys(): ComposerZoneKey[] {
    return [...QUEUE_RECORD_LAYOUT_ZONES];
}
