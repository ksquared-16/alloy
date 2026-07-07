"use client";

/**
 * Queue Row Builder V2 — canvas-first queue row configuration editor.
 *
 * The row canvas IS the primary surface: a live horizontal strip of zone tiles
 * mirroring the runtime condensed row. Drag to reorder, click to inspect.
 * A block library tray shows unused zones as add-pills. A right-side inspector
 * opens on selection for: width chips, evidence group toggles, visibility
 * condition, and actions config.
 *
 * Mirrors the FocusPanelCanvasBuilder pattern (canvas owns composition,
 * inspector owns behavior). Supports both pipeline (case grain) and waitlist
 * (candidate grain) surface configurations.
 *
 * @see web/components/admin/focusPanel/FocusPanelCanvasBuilder.tsx (reference)
 * @see docs/platform/operator/queue-row-platform.md
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import QueueRowItemLibraryPanel from "@/components/adminV2/settings/surfaces/QueueRowItemLibraryPanel";
import QueueRowCanvasHint from "@/components/adminV2/settings/surfaces/QueueRowCanvasHint";
import { CondensedQueueRow } from "@/components/presentation/workUnit/CondensedQueueRow";
import {
    isCompactRowEffectiveFieldKey,
    compactSlotForFieldKey,
    mapQueueRowSurfaceToCompactConfig,
} from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import { defaultLeadQueueLayoutV3, defaultWaitlistQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { LayoutCondition } from "@/lib/layout/layoutV2";
import type {
    QueueRecordBlockConfig,
    QueueRecordColumnConfig,
    QueueRecordFieldConfig,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import {
    useQueueRowLayoutConfig,
    useQueueRowPublish,
} from "@/lib/adminV2/settings/surfaces/useQueueRowBuilder";
import { namedEvidenceGroupsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { MAX_STACKED_ROWS, clampRowIndex } from "@/lib/adminV2/settings/surfaces/queueRowStackedModel";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import { blankPreviewRowModel, previewRowModelFromConfig } from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import type { QueueRowSubjectFocusUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import {
    SURFACE_FIELD_INSPECTOR_ATTRS,
    SURFACE_FIELD_PLACEMENT_HELP,
    SURFACE_FIELD_PLACEMENT_LABELS,
    SURFACE_FIELD_ROW_FOCUS_HELP,
    SURFACE_FIELD_SECTION_LABELS,
} from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";
import {
    buildQueueRowLibraryCatalog,
    type QueueRowLibraryItem,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import {
    CANVAS_PLACEMENT_REGIONS,
    canvasRegionForCompactSlot,
    defaultCanvasSlotForZone,
    occupiedCanvasRegions,
    regionForZoneState,
    type CanvasAnatomyRegion,
} from "@/lib/adminV2/settings/surfaces/queueRowCanvasRegions";
import {
    QUEUE_ROW_BUILDER_SHELL_DATA_ATTR,
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import {
    buildColumnsFromPlacedFields,
    ingestConfigIntoZoneState,
    listPlacedFields,
    movePlacedField,
    removePlacedField,
    reorderPlacedField,
    placedFieldId,
    CANVAS_AREA_LABELS,
    type FieldPlacementOverride,
    type PlacedFieldRef,
} from "@/lib/adminV2/settings/surfaces/queueRowComposerModel";
import {
    composerCardHeightPx,
    fieldsOnStackLine,
    MAX_FIELDS_PER_LINE,
    regionLayoutMetrics,
    REGION_ANCHOR,
    resolveDefaultAppendPlacement,
} from "@/lib/adminV2/settings/surfaces/queueRowComposerCanvasLayout";

// ── Zone key ─────────────────────────────────────────────────────────────────

type ZoneKey = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

// ── Constants ─────────────────────────────────────────────────────────────────

const OPERATOR_ZONE_LABELS: Record<ZoneKey, string> = {
    household: "Family",
    children: "Child",
    status: "Status",
    attention: "Attention",
    date_event: "Tour",
    actions: "Tasks",
};


const ZONE_WIDTH_MAP: Partial<Record<ZoneKey, QueueRecordColumnWidth>> = {
    household: "identity",
    children: "children",
    status: "status_band",
    attention: "next_step",
    date_event: "date_event",
};

const WIDTH_LABELS: Partial<Record<QueueRecordColumnWidth, string>> = {
    identity: "Identity",
    children: "Children",
    status_band: "Status",
    next_step: "Next Step",
    date_event: "Date",
    small: "Small",
    medium: "Medium",
    large: "Large",
    flex: "Flex",
};

function ComposerAddFieldButton({
    region,
    onAddToRegion,
    className = "",
}: {
    region: CanvasAnatomyRegion;
    onAddToRegion: (region: CanvasAnatomyRegion) => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            className={[
                "shrink-0 rounded border border-dashed border-alloy-stone/20 bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-alloy-pine/85 hover:border-alloy-pine/35 hover:bg-alloy-pine/[0.04]",
                className,
            ].join(" ")}
            onClick={(e) => {
                e.stopPropagation();
                onAddToRegion(region);
            }}
            {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.canvasAddField]: region }}
            aria-label={`Add field to ${SURFACE_FIELD_SECTION_LABELS[region]}`}
        >
            + Add field
        </button>
    );
}

function ComposerFieldChip({
    field,
    selected,
    compact,
    onSelect,
}: {
    field: PlacedFieldRef;
    selected: boolean;
    compact?: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            className={[
                "pointer-events-auto max-w-[9rem] truncate rounded px-0.5 py-px text-left transition-colors",
                compact ? "text-[10px] leading-[13px]" : "text-[13px] font-semibold leading-4",
                selected
                    ? "bg-alloy-pine/[0.08] text-alloy-midnight ring-1 ring-alloy-pine/45"
                    : "text-alloy-midnight/85 hover:bg-alloy-stone/8",
            ].join(" ")}
            {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.canvasField]: field.fieldKey }}
            {...(selected ? { [SURFACE_FIELD_INSPECTOR_ATTRS.canvasFieldSelected]: true } : {})}
            aria-label={`Edit ${field.label}`}
            title={field.label}
        >
            {field.label}
        </button>
    );
}

function ComposerRegionOverlay({
    region,
    fields,
    selectedFieldId,
    onSelectField,
    onAddToRegion,
}: {
    region: CanvasAnatomyRegion;
    fields: PlacedFieldRef[];
    selectedFieldId: string | null;
    onSelectField: (fieldId: string) => void;
    onAddToRegion: (region: CanvasAnatomyRegion) => void;
}) {
    const anchor = REGION_ANCHOR[region];
    const metrics = regionLayoutMetrics(region, fields);
    const occupied = fields.length > 0;
    const compact = region === "status" || region === "groupCount" || region === "work";
    const lastLineIdx = Math.max(0, metrics.lines.length - 1);

    return (
        <div
            className="group/region pointer-events-auto absolute z-[2]"
            style={{
                top: anchor.topPx,
                left: anchor.leftPx,
                right: anchor.rightPx,
                minHeight: occupied ? metrics.totalHeightPx : anchor.minHeightPx,
            }}
            data-canvas-region={region}
        >
            {occupied ? (
                <div className="flex flex-col gap-1">
                    {metrics.lines.map((line, lineIdx) => {
                        const isLastLine = lineIdx === lastLineIdx;
                        const lineFull = line.length >= MAX_FIELDS_PER_LINE;
                        const showInlineAdd = isLastLine && !lineFull;
                        return (
                            <div
                                key={`${region}-line-${lineIdx}`}
                                className={[
                                    "flex min-h-[18px] max-w-full flex-wrap items-center gap-1.5",
                                    lineIdx > 0 ? "mt-0.5 border-t border-dashed border-alloy-stone/10 pt-0.5" : "",
                                ].join(" ")}
                                data-canvas-line={lineIdx}
                            >
                                {line.map((field) => (
                                    <ComposerFieldChip
                                        key={field.id}
                                        field={field}
                                        selected={field.id === selectedFieldId}
                                        compact={compact}
                                        onSelect={() => onSelectField(field.id)}
                                    />
                                ))}
                                {showInlineAdd ? (
                                    <ComposerAddFieldButton
                                        region={region}
                                        onAddToRegion={onAddToRegion}
                                        className="opacity-0 transition-opacity duration-150 group-hover/region:opacity-100"
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                    {metrics.lines[lastLineIdx]?.length >= MAX_FIELDS_PER_LINE ? (
                        <div className="flex min-h-[18px] items-center">
                            <ComposerAddFieldButton
                                region={region}
                                onAddToRegion={onAddToRegion}
                                className="opacity-0 transition-opacity duration-150 group-hover/region:opacity-100"
                            />
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="flex min-h-[18px] items-center">
                    <ComposerAddFieldButton
                        region={region}
                        onAddToRegion={onAddToRegion}
                        className="opacity-0 transition-opacity duration-150 group-hover/region:opacity-100"
                    />
                </div>
            )}
        </div>
    );
}

// ── State types ───────────────────────────────────────────────────────────────

/** Per-field enable toggle within an evidence group. */
type FieldToggleState = {
    fieldKey: string;
    label: string;
    enabled: boolean;
    /** false = tenant custom field (from the adapter); true = platform predefined. */
    isSystemField: boolean;
};

type EvidenceGroupState = {
    blockId: string;
    /** Named label from registry (e.g. "Primary Contact") — never abstract. */
    label: string;
    description: string;
    enabled: boolean;
    /** Per-field toggles inside this evidence group. */
    fields: FieldToggleState[];
};

type RowZoneState = {
    key: ZoneKey;
    inRow: boolean;
    canvasSlot: CanvasAnatomyRegion | null;
    width: QueueRecordColumnWidth;
    columnLabel: string;
    rowIndex: number;
    visibleWhen: LayoutCondition | null;
    evidenceGroups: EvidenceGroupState[];
    fieldPlacements: Record<string, FieldPlacementOverride>;
    fieldOrder: string[];
};

/** Scoped library insert — append/insert into a canvas area. */
export type LibraryInsertContext = {
    builderSlot: CanvasAnatomyRegion;
    stackLine: number;
    inlineWithPrevious: boolean;
};

// ── Block label helpers ───────────────────────────────────────────────────────

const WIDGET_LABELS: Record<string, string> = {
    attention: "Attention widget",
    current_work: "Current work widget",
    activity_timeline: "Activity timeline",
    follow_ups: "Follow-ups",
};

function blockLabel(block: QueueRecordBlockConfig, index: number): string {
    if (block.type === "widget")
        return block.label ?? WIDGET_LABELS[block.widgetKey] ?? block.widgetKey.replace(/_/g, " ");
    if (block.type === "repeated_record_block") return block.itemLabel ?? "Repeating list";
    if (block.type === "field_group") return block.label ?? `Group ${index + 1}`;
    return `Block ${index + 1}`;
}

function blockDescription(block: QueueRecordBlockConfig): string {
    if (block.type === "field_group") {
        const names = block.fields.map((f) => f.label ?? f.fieldKey).slice(0, 4).join(", ");
        return names || "Field group";
    }
    if (block.type === "repeated_record_block") {
        const names = block.fields.map((f) => f.label ?? f.fieldKey).slice(0, 3).join(", ");
        return names ? `Rows: ${names}` : "Repeating rows";
    }
    if (block.type === "widget") return WIDGET_LABELS[block.widgetKey] ?? block.widgetKey;
    return "";
}

// ── State ↔ Config ────────────────────────────────────────────────────────────

/** Build a catalog of all known zones from the default config for this grain. */
export function buildCatalog(isWaitlist: boolean): Map<ZoneKey, QueueRecordColumnConfig> {
    const defaultCfg = isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
    const catalog = new Map<ZoneKey, QueueRecordColumnConfig>();
    for (const col of defaultCfg.columns) {
        const zone = Object.entries(ZONE_WIDTH_MAP).find(([, w]) => w === col.width)?.[0] as ZoneKey | undefined;
        if (zone) catalog.set(zone, col);
    }
    return catalog;
}

export function stateFromConfig(
    config: QueueRecordLayoutConfigV3,
    catalog: Map<ZoneKey, QueueRecordColumnConfig>,
    isWaitlist = false,
    tenantFieldDefinitions?: readonly import("@/lib/layout/tenantLayoutFieldPickerCatalog").TenantFieldDefinitionRow[],
): RowZoneState[] {
    const inRowZones: ZoneKey[] = config.columns.flatMap((col) => {
        const zone = Object.entries(ZONE_WIDTH_MAP).find(([, w]) => w === col.width)?.[0] as ZoneKey | undefined;
        return zone ? [zone] : [];
    });
    const unusedZones = QUEUE_RECORD_LAYOUT_ZONES.filter((z) => z !== "actions" && !inRowZones.includes(z));
    const orderedKeys: ZoneKey[] = [...new Set([...inRowZones, ...unusedZones]), "actions"];

    const baseZones: RowZoneState[] = orderedKeys.map((key) => {
        const width = ZONE_WIDTH_MAP[key] ?? "small";
        const catalogCol = catalog.get(key);
        const registryGroups = namedEvidenceGroupsForZone(key, isWaitlist, tenantFieldDefinitions);
        const blocks = (catalogCol?.blocks ?? []).map((b, i) => {
            const registryGroup = registryGroups[i];
            const availableFieldKeys = registryGroup?.availableFields.map((f) => f.key) ?? [];
            const fieldToggles: FieldToggleState[] = availableFieldKeys.map((fieldKey) => {
                const registryField = registryGroup?.availableFields.find((f) => f.key === fieldKey);
                return {
                    fieldKey,
                    label: registryField?.label ?? fieldKey.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                    enabled: false,
                    isSystemField: registryField?.isSystemField ?? true,
                };
            });
            return {
                blockId: b.id,
                label: registryGroup?.label ?? blockLabel(b, i),
                description: registryGroup?.purpose ?? blockDescription(b),
                enabled: false,
                fields: fieldToggles,
            };
        });
        return {
            key,
            inRow: key === "actions" ? config.fixedControls.actionsMenu : false,
            canvasSlot: null,
            width: catalogCol?.width ?? width,
            columnLabel: OPERATOR_ZONE_LABELS[key] || key,
            rowIndex: 0,
            visibleWhen: null,
            evidenceGroups: blocks,
            fieldPlacements: {},
            fieldOrder: [],
        };
    });

    return ingestConfigIntoZoneState(config, baseZones) as RowZoneState[];
}

export function buildConfigFromState(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: RowZoneState[],
    catalog: Map<ZoneKey, QueueRecordColumnConfig>,
): QueueRecordLayoutConfigV3 {
    const placed = listPlacedFields(zones);
    const columns = buildColumnsFromPlacedFields(placed, catalog, baseConfig.columns);
    const actionsZone = zones.find((z) => z.key === "actions");

    return {
        ...baseConfig,
        columns,
        fixedControls: {
            ...baseConfig.fixedControls,
            actionsMenu: actionsZone?.inRow ?? baseConfig.fixedControls.actionsMenu,
        },
    };
}

// ── AddFieldPicker ──────────────────────────────────────────────────────────────

/**
 * Section-scoped inline field picker. Lists the fields NOT yet on this section —
 * predefined (platform) and tenant custom, exactly as the composition adapter offers
 * them for the section's evidence groups. Picking one enables it through the same
 * toggle path the inspector uses (no new persistence). UI says Section / Field only.
 */
export function AddFieldPicker({
    zone,
    anchor,
    onPick,
    onClose,
}: {
    zone: RowZoneState;
    /** Viewport-fixed anchor (below-left of the trigger). The picker portals to <body> so the
     *  canvas's `overflow-hidden` stacking context can't trap it behind the row. */
    anchor: { top: number; left: number } | null;
    onPick: (blockId: string, fieldKey: string) => void;
    onClose: () => void;
}) {
    // Only enabled sections can receive a field (a disabled section contributes nothing
    // to the built config); within them, offer the fields that are not yet added.
    const sections = zone.evidenceGroups
        .filter((g) => g.enabled)
        .map((g) => ({ group: g, addable: g.fields.filter((f) => !f.enabled) }))
        .filter((s) => s.addable.length > 0);

    const picker = (
        <span
            className="pointer-events-auto fixed z-[60] w-60 rounded-lg border border-alloy-stone/20 bg-white p-1.5 shadow-lg"
            style={anchor ? { top: anchor.top, left: anchor.left } : undefined}
            role="dialog"
            aria-label={`Add field to ${zone.columnLabel || OPERATOR_ZONE_LABELS[zone.key]}`}
            data-add-field-picker={zone.key}
            onClick={(e) => e.stopPropagation()}
        >
            <span className="flex items-center justify-between px-1.5 pb-1 pt-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Add field · {zone.columnLabel || OPERATOR_ZONE_LABELS[zone.key]}
                </span>
                <button
                    type="button"
                    className="text-[11px] leading-none text-alloy-midnight/35 hover:text-alloy-midnight/70"
                    onClick={onClose}
                    aria-label="Close add field"
                >
                    ✕
                </button>
            </span>
            {sections.length === 0 ? (
                <p className="px-1.5 py-2 text-[11px] text-alloy-midnight/40">
                    Every available field is already on this section.
                </p>
            ) : (
                <span className="block max-h-56 overflow-y-auto">
                    {sections.map(({ group, addable }) => (
                        <span key={group.blockId} className="block px-0.5 pb-1">
                            <span className="block px-1.5 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                {group.label}
                            </span>
                            {addable.map((field) => {
                                // One vocabulary: a field renders in the compact row ONLY if its key
                                // maps to a slot. Non-effective fields are flagged (no silent no-op).
                                const compactEffective = isCompactRowEffectiveFieldKey(field.fieldKey);
                                return (
                                    <button
                                        key={field.fieldKey}
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-alloy-pine/[0.06]"
                                        onClick={() => onPick(group.blockId, field.fieldKey)}
                                        data-add-field-option={field.fieldKey}
                                        data-add-field-custom={field.isSystemField ? undefined : "true"}
                                        data-compact-effective={compactEffective ? "true" : "false"}
                                    >
                                        <span className="text-[11px] leading-none text-alloy-pine">+</span>
                                        <span
                                            className={`flex-1 truncate text-[11px] ${compactEffective ? "text-alloy-midnight/80" : "text-alloy-midnight/45"}`}
                                        >
                                            {field.label}
                                        </span>
                                        {!compactEffective ? (
                                            <span
                                                className="shrink-0 rounded-full bg-alloy-stone/15 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45"
                                                title="This field does not render in the compact queue row."
                                            >
                                                Not in row
                                            </span>
                                        ) : !field.isSystemField ? (
                                            <span className="shrink-0 rounded-full bg-alloy-stone/15 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                                Custom
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
    // Portal to <body> so the picker escapes the canvas's `overflow-hidden` stacking context /
    // clip (the root cause of it rendering behind the row). SSR guard falls back to inline.
    return typeof document === "undefined" ? picker : createPortal(picker, document.body);
}

// ── Auto placement (internal — operator never sees slot names) ────────────────

function resolveAutoCanvasSlot(item: Exclude<QueueRowLibraryItem, { kind: "unavailable" }>, zones: RowZoneState[]): CanvasAnatomyRegion {
    const occupied = occupiedCanvasRegions(zones);
    if (item.kind === "zone") return defaultCanvasSlotForZone(item.zoneKey) ?? "identity";
    const zoneKey = item.zoneKey;
    const zoneDefault = defaultCanvasSlotForZone(zoneKey);
    if (zoneDefault && !occupied.has(zoneDefault)) return zoneDefault;

    if (item.kind === "field") {
        const compact = compactSlotForFieldKey(item.fieldKey);
        if (compact) {
            const region = canvasRegionForCompactSlot(compact);
            if (region && !occupied.has(region)) return region;
        }
    }

    for (const { region } of CANVAS_PLACEMENT_REGIONS) {
        if (!occupied.has(region)) return region;
    }
    return zoneDefault ?? "identity";
}

// ── QueueRowRuntimeCanvas ───────────────────────────────────────────────────────

/**
 * Edit-mode canvas: renders the REAL runtime `CondensedQueueRow` presenter (never a
 * mock strip) from the operator's in-progress config, with a selection/reorder/remove
 * overlay layered ON TOP. The presenter stays pure — it receives the same
 * `CompactRowSlots` the /work-unit runtime feeds it (via `mapQueueRowSurfaceToCompactConfig`),
 * so what the operator edits here is exactly what the runtime renders.
 *
 *   live zones → buildConfigFromState → QueueRecordLayoutConfigV3
 *              → mapQueueRowSurfaceToCompactConfig → CompactRowSlots
 *              → <CondensedQueueRow rowConfig={slots} />   (shared runtime component)
 *
 * The overlay's clickable regions map canvas slots → builder zones (see regionForZoneState), so
 * select / remove / reorder operate on the actual row sections the operator sees.
 */
function QueueRowRuntimeCanvas({
    placedFields,
    liveConfig,
    previewRow,
    selectedFieldId,
    embedded = false,
    onSelectField,
    onOpenLibrary,
    onAddToRegion,
}: {
    placedFields: PlacedFieldRef[];
    liveConfig: QueueRecordLayoutConfigV3;
    previewRow: QueueRowModel;
    selectedFieldId: string | null;
    embedded?: boolean;
    onSelectField: (fieldId: string) => void;
    onOpenLibrary: (context?: LibraryInsertContext) => void;
    onAddToRegion: (region: CanvasAnatomyRegion) => void;
}) {
    const compactConfig = useMemo(() => mapQueueRowSurfaceToCompactConfig(liveConfig), [liveConfig]);
    const hasComposerFields = placedFields.length > 0;
    const slots = useMemo(() => {
        if (!hasComposerFields) return compactConfig.slots;
        const emptySlot = () => ({ visible: true as const, label: null });
        return {
            subject: emptySlot(),
            status: emptySlot(),
            contact: emptySlot(),
            attention: emptySlot(),
            work: emptySlot(),
            groupCount: emptySlot(),
        };
    }, [compactConfig.slots, hasComposerFields]);
    const isEmpty = placedFields.length === 0;

    const fieldsByRegion = useMemo(() => {
        const map = new Map<CanvasAnatomyRegion, PlacedFieldRef[]>();
        for (const field of placedFields) {
            const list = map.get(field.builderSlot) ?? [];
            list.push(field);
            map.set(field.builderSlot, list);
        }
        return map;
    }, [placedFields]);

    const cardHeightPx = useMemo(() => composerCardHeightPx(fieldsByRegion), [fieldsByRegion]);
    const previewRowForCanvas = hasComposerFields ? blankPreviewRowModel() : previewRow;

    return (
        <div
            className={`overflow-hidden rounded-xl border border-alloy-stone/14 bg-alloy-stone/[0.03] shadow-sm ${embedded ? "border-0 bg-transparent shadow-none" : ""}`}
            data-canvas
        >
            <div className="flex justify-center px-4 py-4">
                <div
                    className={[
                        QUEUE_ROW_CARD_SHELL_CLASS,
                        selectedFieldId ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
                        "relative",
                    ].join(" ")}
                    style={{
                        width: ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX,
                        maxWidth: ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX,
                        minHeight: cardHeightPx,
                    }}
                    {...{ [QUEUE_ROW_BUILDER_SHELL_DATA_ATTR]: true }}
                    data-canvas-runtime-frame
                >
                    {selectedFieldId ? <span className={QUEUE_ROW_SELECTED_RAIL_CLASS} aria-hidden /> : null}
                    <div className="pointer-events-none relative z-[1]" data-canvas-runtime-row>
                        <CondensedQueueRow row={previewRowForCanvas} rowConfig={slots} onOpen={() => {}} isFirst />
                    </div>
                    {isEmpty ? (
                        <button
                            type="button"
                            className="absolute inset-0 z-[5] flex cursor-pointer items-center justify-center rounded-lg bg-transparent px-6"
                            aria-label="Add to queue row"
                            data-canvas-open-library
                            onClick={() => onOpenLibrary()}
                        >
                            <p className="pointer-events-none text-center text-[12px] text-alloy-midnight/40" data-canvas-empty-hint>
                                Click to add content
                            </p>
                        </button>
                    ) : (
                        <div className="absolute inset-0 z-[5]" data-canvas-overlay>
                            {(Object.keys(REGION_ANCHOR) as CanvasAnatomyRegion[]).map((region) => (
                                <ComposerRegionOverlay
                                    key={region}
                                    region={region}
                                    fields={fieldsByRegion.get(region) ?? []}
                                    selectedFieldId={selectedFieldId}
                                    onSelectField={onSelectField}
                                    onAddToRegion={onAddToRegion}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function findWidgetBlockId(
    catalog: Map<ZoneKey, QueueRecordColumnConfig>,
    zoneKey: ZoneKey,
    widgetKey: string,
): string | null {
    const col = catalog.get(zoneKey);
    const block = col?.blocks.find((b) => b.type === "widget" && b.widgetKey === widgetKey);
    return block?.id ?? null;
}

// ── ConditionForm ─────────────────────────────────────────────────────────────

function ConditionForm({
    condition,
    onSave,
    onClear,
}: {
    condition: LayoutCondition | null;
    onSave: (c: LayoutCondition) => void;
    onClear: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [type, setType] = useState<LayoutCondition["type"]>(condition?.type ?? "exists");
    const [path, setPath] = useState(condition?.path ?? "");
    const [value, setValue] = useState(condition?.value ?? "");

    if (!editing && !condition) {
        return (
            <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] text-alloy-pine hover:underline"
                data-add-condition
            >
                + Add condition
            </button>
        );
    }

    if (!editing && condition) {
        return (
            <div className="flex items-center gap-2 rounded-md bg-alloy-stone/6 px-2.5 py-1.5">
                <span className="flex-1 truncate text-[11px] text-alloy-midnight/65">
                    <span className="font-medium">visible when</span>{" "}
                    <code className="rounded bg-alloy-stone/15 px-1 text-[10px]">{condition.path}</code>{" "}
                    {condition.type}
                    {condition.value ? ` "${condition.value}"` : ""}
                </span>
                <button type="button" onClick={() => setEditing(true)} className="text-[10px] text-alloy-midnight/40 hover:text-alloy-pine">Edit</button>
                <button type="button" onClick={onClear} className="text-[10px] text-alloy-midnight/40 hover:text-red-500" aria-label="Remove condition">×</button>
            </div>
        );
    }

    return (
        <div className="space-y-2 rounded-lg border border-alloy-stone/14 bg-alloy-stone/3 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Visible when</p>
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Record path (e.g. person.email)"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    className="flex-1 rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-midnight focus:border-alloy-pine focus:outline-none"
                />
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value as LayoutCondition["type"])}
                    className="rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-midnight focus:border-alloy-pine focus:outline-none"
                >
                    <option value="exists">exists</option>
                    <option value="equals">equals</option>
                    <option value="not_equals">not equals</option>
                    <option value="count_gt">count &gt;</option>
                </select>
            </div>
            {(type === "equals" || type === "not_equals" || type === "count_gt") && (
                <input
                    type="text"
                    placeholder="Value"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full rounded border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-midnight focus:border-alloy-pine focus:outline-none"
                />
            )}
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={!path.trim()}
                    onClick={() => {
                        if (!path.trim()) return;
                        const c: LayoutCondition = { type, path: path.trim() };
                        if ((type === "equals" || type === "not_equals" || type === "count_gt") && value.trim()) {
                            c.value = value.trim();
                        }
                        onSave(c);
                        setEditing(false);
                    }}
                    className="rounded bg-alloy-pine px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                >
                    Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-alloy-midnight/40 hover:text-alloy-midnight/70">
                    Cancel
                </button>
                {condition && (
                    <button type="button" onClick={() => { onClear(); setEditing(false); }} className="ml-auto text-[11px] text-red-400 hover:text-red-600">
                        Remove
                    </button>
                )}
            </div>
        </div>
    );
}

// ── BlockInspector ────────────────────────────────────────────────────────────

function FieldsOnRowList({
    fields,
    selectedFieldId,
    onSelectField,
    embedded = false,
}: {
    fields: readonly PlacedFieldRef[];
    selectedFieldId: string | null;
    onSelectField: (fieldId: string) => void;
    embedded?: boolean;
}) {
    if (fields.length === 0) return null;
    const inner = (
        <>
            <p className="mb-2 text-[11px] font-semibold text-alloy-midnight/70">Fields on this row</p>
            <ul className="space-y-1">
                {fields.map((field) => (
                    <li key={field.id}>
                        <button
                            type="button"
                            onClick={() => onSelectField(field.id)}
                            className={[
                                "w-full truncate rounded-md px-2 py-1.5 text-left text-[12px]",
                                field.id === selectedFieldId
                                    ? "bg-alloy-pine/10 font-medium text-alloy-midnight"
                                    : "text-alloy-midnight/70 hover:bg-alloy-stone/8",
                            ].join(" ")}
                            data-inspector-field-row={field.id}
                        >
                            {field.label}
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
    if (embedded) {
        return <div data-inspector-field-list>{inner}</div>;
    }
    return (
        <div className="rounded-xl border border-alloy-stone/14 bg-white p-3 shadow-sm" data-inspector-field-list>
            {inner}
        </div>
    );
}

function FieldInspector({
    field,
    placedFields,
    onClose,
    onRemove,
    onSetLabel,
    onMove,
    onSetInline,
    onReorder,
    onSelectField,
}: {
    field: PlacedFieldRef;
    placedFields: readonly PlacedFieldRef[];
    onClose: () => void;
    onRemove: () => void;
    onSetLabel: (label: string) => void;
    onMove: (slot: CanvasAnatomyRegion, stackLine: number) => void;
    onSetInline: (inline: boolean) => void;
    onReorder: (dir: -1 | 1) => void;
    onSelectField: (fieldId: string) => void;
}) {
    return (
        <div className="rounded-xl border border-alloy-stone/14 bg-white shadow-sm" data-field-inspector={field.id}>
            <div className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-2.5">
                <p className="text-sm font-semibold text-alloy-midnight">{field.label}</p>
                <button type="button" onClick={onClose} className="rounded p-0.5 text-alloy-midnight/30 hover:bg-alloy-stone/8" aria-label="Close" data-inspector-close>✕</button>
            </div>
            <div className="space-y-4 p-4">
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-alloy-midnight/75">Display as</span>
                    <input
                        type="text"
                        value={field.label}
                        onChange={(e) => onSetLabel(e.target.value)}
                        className="w-full rounded border border-alloy-stone/20 bg-white px-2.5 py-1.5 text-[12px] focus:border-alloy-pine focus:outline-none"
                        data-inspector-label-input
                    />
                </label>
                <div>
                    <p className="mb-1 text-[12px] font-medium text-alloy-midnight/75">Section</p>
                    <p className="mb-2 text-[10px] leading-snug text-alloy-midnight/45">{SURFACE_FIELD_PLACEMENT_HELP}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(SURFACE_FIELD_SECTION_LABELS) as CanvasAnatomyRegion[]).map((slot) => (
                            <button
                                key={slot}
                                type="button"
                                onClick={() => onMove(slot, field.stackLine)}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                    field.builderSlot === slot
                                        ? "bg-alloy-pine text-white"
                                        : "border border-alloy-stone/20 text-alloy-midnight/65 hover:border-alloy-pine/40"
                                }`}
                                {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.section]: slot }}
                            >
                                {SURFACE_FIELD_SECTION_LABELS[slot]}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-[12px] font-medium text-alloy-midnight/75">Placement</p>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => onSetInline(true)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                field.inlineWithPrevious ? "bg-alloy-pine text-white" : "border border-alloy-stone/20 text-alloy-midnight/65"
                            }`}
                            {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.placement]: "same-line" }}
                        >
                            {SURFACE_FIELD_PLACEMENT_LABELS["same-line"]}
                        </button>
                        <button
                            type="button"
                            onClick={() => onSetInline(false)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                !field.inlineWithPrevious ? "bg-alloy-pine text-white" : "border border-alloy-stone/20 text-alloy-midnight/65"
                            }`}
                            {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.placement]: "new-line-below" }}
                        >
                            {SURFACE_FIELD_PLACEMENT_LABELS["new-line-below"]}
                        </button>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={() => onReorder(-1)} className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-[11px] font-medium text-alloy-midnight/65 hover:border-alloy-pine/40" data-inspector-reorder-up>Move earlier</button>
                    <button type="button" onClick={() => onReorder(1)} className="rounded-lg border border-alloy-stone/20 px-3 py-1.5 text-[11px] font-medium text-alloy-midnight/65 hover:border-alloy-pine/40" data-inspector-reorder-down>Move later</button>
                </div>
                <button type="button" onClick={onRemove} className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-100" data-inspector-remove>Remove</button>
            </div>
            <div className="border-t border-alloy-stone/10 px-4 py-3">
                <FieldsOnRowList fields={placedFields} selectedFieldId={field.id} onSelectField={onSelectField} embedded />
            </div>
        </div>
    );
}

// ── PublishToolbar ────────────────────────────────────────────────────────────

function PublishToolbar({
    dirty,
    publishing,
    publishedAt,
    error,
    onPublish,
}: {
    dirty: boolean;
    publishing: boolean;
    publishedAt: Date | null;
    error: string | null;
    onPublish: () => void;
}) {
    const statusLabel = publishing ? "Saving…"
        : error ? "Error"
        : publishedAt && !dirty ? "Published"
        : dirty ? "Unsaved changes"
        : "No changes";

    const statusColor = error ? "text-red-500"
        : dirty ? "text-alloy-midnight/50"
        : publishedAt ? "text-alloy-juniper"
        : "text-alloy-midnight/35";

    return (
        <div className="flex items-center gap-3 border-t border-alloy-stone/10 pt-3">
            <button
                type="button"
                onClick={onPublish}
                disabled={!dirty || publishing}
                className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-40"
                data-queue-row-builder-publish
            >
                {publishing ? "Publishing…" : "Publish"}
            </button>
            <span className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
    surfaceId?: string;
    embedded?: boolean;
    controlledLayout?: QueueRecordLayoutConfigV3;
    onControlledLayoutChange?: (layout: QueueRecordLayoutConfigV3) => void;
    onDirtyChange?: (dirty: boolean) => void;
    /** Candidate-grain library (waitlist fields/widgets) for the active variant. */
    libraryIsWaitlist?: boolean;
    /** Library category priority only — does not affect layout. */
    rowFocusUi?: QueueRowSubjectFocusUi;
};

export default function QueueRowBuilderV2({
    surfaceId = "pipeline-queue-row",
    embedded = false,
    controlledLayout,
    onControlledLayoutChange,
    onDirtyChange,
    libraryIsWaitlist,
    rowFocusUi = "family",
}: Props) {
    const isControlled = controlledLayout != null;
    const catalogIsWaitlist = libraryIsWaitlist ?? surfaceId === "waitlist-queue-row";
    const surfaceLabel = catalogIsWaitlist ? "Waitlist queue row" : "Queue row";

    const catalog = useMemo(() => buildCatalog(catalogIsWaitlist), [catalogIsWaitlist]);

    const { data: serverData, loading: serverLoading, error: loadError } = useQueueRowLayoutConfig(
        isControlled ? "__controlled__" : surfaceId,
    );
    const { publish, publishing, error: publishError, publishedAt } = useQueueRowPublish(surfaceId);
    // Operator-created custom fields — merged into compatible groups' Add Field lists.
    const { tenantFieldDefinitions } = useTenantFieldDefinitions(catalogIsWaitlist ? "placement_candidate" : "opportunities");

    const defaultConfig = controlledLayout ?? (catalogIsWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3());
    const loading = isControlled ? false : serverLoading;

    const [zones, setZones] = useState<RowZoneState[]>(() =>
        stateFromConfig(defaultConfig, catalog, catalogIsWaitlist),
    );
    const [placementOverrideEnabled, setPlacementOverrideEnabled] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryInsertContext, setLibraryInsertContext] = useState<LibraryInsertContext | null>(null);

    // Init from server data. Re-runs when tenant field definitions load so custom
    // fields appear in each group's Add Field list. (Resets local edits — acceptable:
    // tenant defs resolve once, near-instantly, on mount.)
    useEffect(() => {
        const source = controlledLayout ?? serverData?.config;
        if (!source) return;
        setZones(stateFromConfig(source, catalog, catalogIsWaitlist, tenantFieldDefinitions));
        if (!isControlled) {
            setPlacementOverrideEnabled(serverData?.placementOverrideEnabled ?? false);
        }
        if (!isControlled) setDirty(false);
    }, [controlledLayout, serverData, tenantFieldDefinitions, catalogIsWaitlist, isControlled, catalog]);

    function mark(updater: (prev: RowZoneState[]) => RowZoneState[]) {
        setZones((prev) => {
            const next = updater(prev);
            if (onControlledLayoutChange) {
                const base = controlledLayout ?? serverData?.config ?? defaultConfig;
                onControlledLayoutChange(buildConfigFromState(base, next, catalog));
            }
            return next;
        });
        setDirty(true);
        onDirtyChange?.(true);
    }

    const openLibrary = useCallback((context?: LibraryInsertContext) => {
        setLibraryInsertContext(context ?? null);
        setLibraryOpen(true);
    }, []);

    const placedFields = useMemo(() => listPlacedFields(zones), [zones]);
    const selectedField = useMemo(
        () => placedFields.find((f) => f.id === selectedFieldId) ?? null,
        [placedFields, selectedFieldId],
    );

    const handleLibraryPick = useCallback(
        (item: QueueRowLibraryItem) => {
            if (item.kind === "zone" || item.kind === "unavailable") return;
            const zoneKey = item.zoneKey;
            const ctx = libraryInsertContext;
            const slot = ctx?.builderSlot ?? resolveAutoCanvasSlot(item, zones);
            const stackLine = ctx?.stackLine ?? 0;
            const inlineWithPrevious = ctx?.inlineWithPrevious ?? false;
            const fieldKey = item.kind === "field" ? item.fieldKey : `widget:${item.widgetKey}`;

            mark((prev) =>
                prev.map((z) => {
                    if (z.key !== zoneKey) return z;
                    let updated: RowZoneState = {
                        ...z,
                        inRow: true,
                        canvasSlot: z.canvasSlot ?? slot,
                        fieldOrder: z.fieldOrder.includes(fieldKey) ? z.fieldOrder : [...z.fieldOrder, fieldKey],
                        fieldPlacements: {
                            ...z.fieldPlacements,
                            [fieldKey]: {
                                builderSlot: slot,
                                stackLine,
                                inlineWithPrevious,
                            },
                        },
                    };
                    if (item.kind === "field") {
                        updated = {
                            ...updated,
                            evidenceGroups: updated.evidenceGroups.map((g) => {
                                const hasField = g.fields.some((f) => f.fieldKey === item.fieldKey);
                                if (!hasField && g === updated.evidenceGroups[0]) {
                                    return {
                                        ...g,
                                        enabled: true,
                                        fields: [...g.fields, { fieldKey: item.fieldKey, label: item.label, enabled: true, isSystemField: item.isSystemField }],
                                    };
                                }
                                return {
                                    ...g,
                                    enabled: hasField ? true : g.enabled,
                                    fields: g.fields.map((f) =>
                                        f.fieldKey === item.fieldKey ? { ...f, enabled: true, label: item.label } : f,
                                    ),
                                };
                            }),
                        };
                        const anyEnabled = updated.evidenceGroups.some((g) =>
                            g.fields.some((f) => f.fieldKey === item.fieldKey && f.enabled),
                        );
                        if (!anyEnabled && updated.evidenceGroups[0]) {
                            const g0 = updated.evidenceGroups[0];
                            updated.evidenceGroups = [
                                {
                                    ...g0,
                                    enabled: true,
                                    fields: [...g0.fields, { fieldKey: item.fieldKey, label: item.label, enabled: true, isSystemField: item.isSystemField }],
                                },
                                ...updated.evidenceGroups.slice(1),
                            ];
                        }
                    } else {
                        const blockId = findWidgetBlockId(catalog, zoneKey, item.widgetKey);
                        if (blockId) {
                            updated = {
                                ...updated,
                                evidenceGroups: updated.evidenceGroups.map((g) =>
                                    g.blockId === blockId ? { ...g, enabled: true } : g,
                                ),
                            };
                        }
                    }
                    return updated;
                }),
            );

            const blockId =
                item.kind === "field"
                    ? catalog.get(zoneKey)?.blocks.find((b) => b.type === "field_group")?.id ?? "block"
                    : findWidgetBlockId(catalog, zoneKey, item.widgetKey) ?? "widget";
            const id =
                item.kind === "field"
                    ? placedFieldId(zoneKey, blockId, item.fieldKey)
                    : placedFieldId(zoneKey, blockId, fieldKey);
            setSelectedFieldId(id);
            setLibraryOpen(false);
            setLibraryInsertContext(null);
        },
        [catalog, libraryInsertContext, zones],
    );

    const libraryItems = useMemo(
        () =>
            buildQueueRowLibraryCatalog({
                isWaitlist: catalogIsWaitlist,
                includeWaitlistFields: libraryIsWaitlist ?? catalogIsWaitlist,
                inRowZoneKeys: zones.filter((z) => z.inRow).map((z) => z.key),
                tenantFieldDefinitions,
            }),
        [libraryIsWaitlist, catalogIsWaitlist, zones, tenantFieldDefinitions],
    );

    const removeSelectedField = useCallback(() => {
        if (!selectedFieldId) return;
        mark((prev) => removePlacedField(prev, selectedFieldId) as RowZoneState[]);
        setSelectedFieldId(null);
    }, [selectedFieldId]);

    const updateFieldLabel = useCallback(
        (label: string) => {
            if (!selectedField) return;
            mark((prev) =>
                prev.map((z) => {
                    if (z.key !== selectedField.zoneKey) return z;
                    return {
                        ...z,
                        evidenceGroups: z.evidenceGroups.map((g) => ({
                            ...g,
                            fields: g.fields.map((f) =>
                                f.fieldKey === selectedField.fieldKey ? { ...f, label } : f,
                            ),
                        })),
                    };
                }),
            );
        },
        [selectedField],
    );

    const moveSelectedField = useCallback(
        (slot: CanvasAnatomyRegion, stackLine: number) => {
            if (!selectedFieldId) return;
            mark((prev) => movePlacedField(prev, selectedFieldId, { builderSlot: slot, stackLine }) as RowZoneState[]);
        },
        [selectedFieldId],
    );

    const setSelectedFieldInline = useCallback(
        (inline: boolean) => {
            if (!selectedFieldId || !selectedField) return;
            mark((prev) => {
                if (inline) {
                    const regionFields = listPlacedFields(prev).filter((f) => f.builderSlot === selectedField.builderSlot);
                    const targetLine = selectedField.stackLine;
                    const onLine = fieldsOnStackLine(regionFields, targetLine);
                    if (onLine.length >= MAX_FIELDS_PER_LINE && !onLine.some((f) => f.id === selectedFieldId)) {
                        return prev;
                    }
                    return movePlacedField(prev, selectedFieldId, { inlineWithPrevious: true }) as RowZoneState[];
                }
                const regionFields = listPlacedFields(prev).filter((f) => f.builderSlot === selectedField.builderSlot);
                const newStackLine = Math.max(0, ...regionFields.map((f) => f.stackLine)) + 1;
                return movePlacedField(prev, selectedFieldId, {
                    inlineWithPrevious: false,
                    stackLine: newStackLine,
                }) as RowZoneState[];
            });
        },
        [selectedField, selectedFieldId],
    );

    const reorderSelectedField = useCallback(
        (dir: -1 | 1) => {
            if (!selectedFieldId) return;
            mark((prev) => reorderPlacedField(prev, selectedFieldId, dir) as RowZoneState[]);
        },
        [selectedFieldId],
    );

    const handleAddToRegion = useCallback(
        (region: CanvasAnatomyRegion) => {
            const regionFields = placedFields.filter((f) => f.builderSlot === region);
            const placement = resolveDefaultAppendPlacement(regionFields);
            openLibrary({
                builderSlot: region,
                stackLine: placement.stackLine,
                inlineWithPrevious: placement.inlineWithPrevious,
            });
        },
        [openLibrary, placedFields],
    );

    async function handlePublish() {
        const base = serverData?.config ?? defaultConfig;
        const config = buildConfigFromState(base, zones, catalog);
        await publish(config, placementOverrideEnabled);
        setDirty(false);
    }

    const liveConfig = useMemo(
        () => buildConfigFromState(controlledLayout ?? serverData?.config ?? defaultConfig, zones, catalog),
        [controlledLayout, serverData, defaultConfig, zones, catalog],
    );
    const previewRow = useMemo(() => previewRowModelFromConfig(liveConfig), [liveConfig]);

    const canvasProps = {
        placedFields,
        liveConfig,
        previewRow,
        selectedFieldId,
        onSelectField: setSelectedFieldId,
        onOpenLibrary: openLibrary,
        onAddToRegion: handleAddToRegion,
    };

    const libraryPanel = (
        <QueueRowItemLibraryPanel
            open={libraryOpen}
            items={libraryItems}
            rowFocusUi={rowFocusUi}
            sectionLabel={libraryInsertContext ? `Add to ${SURFACE_FIELD_SECTION_LABELS[libraryInsertContext.builderSlot]}` : undefined}
            onPick={handleLibraryPick}
            onClose={() => {
                setLibraryOpen(false);
                setLibraryInsertContext(null);
            }}
        />
    );

    const inspectorAside = (
        <aside className="w-full shrink-0 lg:w-80" data-queue-row-contextual-inspector>
            {selectedField ? (
                <FieldInspector
                    field={selectedField}
                    placedFields={placedFields}
                    onClose={() => setSelectedFieldId(null)}
                    onRemove={removeSelectedField}
                    onSetLabel={updateFieldLabel}
                    onMove={moveSelectedField}
                    onSetInline={setSelectedFieldInline}
                    onReorder={reorderSelectedField}
                    onSelectField={setSelectedFieldId}
                />
            ) : (
                <div className="space-y-3">
                    <QueueRowCanvasHint />
                    <p className="rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.03] px-3 py-2 text-[11px] leading-snug text-alloy-midnight/55" data-row-focus-help>
                        Row focus: <span className="font-medium capitalize">{rowFocusUi}</span>. {SURFACE_FIELD_ROW_FOCUS_HELP}
                    </p>
                    <FieldsOnRowList
                        fields={placedFields}
                        selectedFieldId={selectedFieldId}
                        onSelectField={setSelectedFieldId}
                    />
                </div>
            )}
        </aside>
    );

    return (
        <div
            className={`queue-row-builder flex h-full min-h-0 flex-col gap-4 overflow-auto ${embedded ? "" : ""}`}
            data-queue-row-builder={surfaceId}
            data-canvas-presentation="overlay"
        >
            {!embedded ? (
            <header className="border-b border-alloy-stone/10 pb-3">
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">{surfaceLabel}</h2>
                <p className="mt-0.5 text-sm text-alloy-midnight/55">Click the row to add content. Click a placed item to edit.</p>
            </header>
            ) : null}

            {loadError && !isControlled && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Failed to load: {loadError}
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    <div className="h-24 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5" />
                    <div className="h-8 w-48 animate-pulse rounded-full bg-alloy-stone/5" />
                </div>
            ) : embedded ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start" data-queue-row-embedded-layout>
                    <div className="min-w-0 flex-1">
                        <QueueRowRuntimeCanvas {...canvasProps} embedded />
                        {libraryPanel}
                    </div>
                    {inspectorAside}
                </div>
            ) : (
                <>
                    <QueueRowRuntimeCanvas {...canvasProps} />
                    {libraryPanel}
                    {inspectorAside}
                </>
            )}

            {!embedded ? (
            <div className="mt-auto">
                <PublishToolbar
                    dirty={dirty}
                    publishing={publishing}
                    publishedAt={publishedAt}
                    error={publishError}
                    onPublish={handlePublish}
                />
            </div>
            ) : null}
        </div>
    );
}
