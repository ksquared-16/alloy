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

import { useCallback, useEffect, useRef, useState } from "react";

import { defaultLeadQueueLayoutV3, defaultWaitlistQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { LayoutCondition } from "@/lib/layout/layoutV2";
import type {
    QueueRecordBlockConfig,
    QueueRecordColumnConfig,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import {
    useQueueRowLayoutConfig,
    useQueueRowPublish,
} from "@/lib/adminV2/settings/surfaces/useQueueRowBuilder";
import { namedEvidenceGroupsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";

// ── Zone key ─────────────────────────────────────────────────────────────────

type ZoneKey = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

// ── Constants ─────────────────────────────────────────────────────────────────

const ZONE_LABELS: Record<ZoneKey, string> = {
    household: "Household",
    children: "Children",
    status: "Status",
    attention: "Attention",
    date_event: "Date",
    actions: "Actions",
};

/** Proportional flex weights for the canvas preview strip. */
const ZONE_FLEX: Record<ZoneKey, number> = {
    household: 3,
    children: 3,
    status: 2,
    attention: 2,
    date_event: 1.5,
    actions: 0.75,
};

/** Sample data lines shown in each canvas tile. */
const ZONE_SAMPLE: Record<ZoneKey, string[]> = {
    household: ["Smith Family", "Sarah · (555) 000-1234"],
    children: ["Emma 4y  Liam 2y", "Active  Enrolled"],
    status: ["New Lead", "Tour Scheduled"],
    attention: ["Follow-up needed", "Send welcome packet"],
    date_event: ["Tour: Thu Jul 3", ""],
    actions: ["⋮"],
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

// ── State types ───────────────────────────────────────────────────────────────

/** Per-field enable toggle within an evidence group. */
type FieldToggleState = {
    fieldKey: string;
    label: string;
    enabled: boolean;
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
    width: QueueRecordColumnWidth;
    visibleWhen: LayoutCondition | null;
    evidenceGroups: EvidenceGroupState[];
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
function buildCatalog(isWaitlist: boolean): Map<ZoneKey, QueueRecordColumnConfig> {
    const defaultCfg = isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();
    const catalog = new Map<ZoneKey, QueueRecordColumnConfig>();
    for (const col of defaultCfg.columns) {
        const zone = Object.entries(ZONE_WIDTH_MAP).find(([, w]) => w === col.width)?.[0] as ZoneKey | undefined;
        if (zone) catalog.set(zone, col);
    }
    return catalog;
}

function stateFromConfig(
    config: QueueRecordLayoutConfigV3,
    catalog: Map<ZoneKey, QueueRecordColumnConfig>,
    isWaitlist = false,
): RowZoneState[] {
    const colByWidth = new Map(config.columns.map((c) => [c.width, c]));

    // Ordered: columns in config order first, then unused zones appended
    const inRowZones: ZoneKey[] = config.columns
        .flatMap((col) => {
            const zone = Object.entries(ZONE_WIDTH_MAP).find(([, w]) => w === col.width)?.[0] as ZoneKey | undefined;
            return zone ? [zone] : [];
        });

    const unusedZones = QUEUE_RECORD_LAYOUT_ZONES.filter(
        (z) => z !== "actions" && !inRowZones.includes(z),
    );

    const orderedKeys: ZoneKey[] = [...inRowZones, ...unusedZones, "actions"];

    return orderedKeys.map((key) => {
        const width = ZONE_WIDTH_MAP[key] ?? "small";
        const col = width ? colByWidth.get(width) : undefined;
        const catalogCol = catalog.get(key);
        const inRow = key === "actions"
            ? config.fixedControls.actionsMenu
            : Boolean(col);

        // Named evidence groups from the registry — drives labeled inspector sections
        const registryGroups = namedEvidenceGroupsForZone(key, isWaitlist);

        const blocks = (col?.blocks ?? catalogCol?.blocks ?? []).map((b, i) => {
            // Map this block to a registry group (by index order)
            const registryGroup = registryGroups[i];
            const activeFieldKeys = new Set(
                b.type === "field_group" || b.type === "repeated_record_block"
                    ? b.fields.map((f) => f.fieldKey)
                    : [],
            );

            // Seed field toggles: registry default fields as the available set
            // Fields currently in the config are enabled; registry fields not yet added are disabled
            const availableFieldKeys = registryGroup?.availableFields.map((f) => f.key) ?? [];
            const enabledFieldKeys = availableFieldKeys.length > 0
                ? availableFieldKeys
                : [...activeFieldKeys];

            const fieldToggles: FieldToggleState[] = enabledFieldKeys.map((fieldKey) => {
                const registryField = registryGroup?.availableFields.find((f) => f.key === fieldKey);
                return {
                    fieldKey,
                    label: registryField?.label ?? fieldKey.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                    enabled: activeFieldKeys.has(fieldKey),
                };
            });

            return {
                blockId: b.id,
                label: registryGroup?.label ?? blockLabel(b, i),
                description: registryGroup?.purpose ?? blockDescription(b),
                enabled: Boolean(col),
                fields: fieldToggles,
            };
        });

        return {
            key,
            inRow,
            width: col?.width ?? catalogCol?.width ?? width,
            visibleWhen: col?.visibleWhen ?? null,
            evidenceGroups: blocks,
        };
    });
}

function buildConfigFromState(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: RowZoneState[],
    catalog: Map<ZoneKey, QueueRecordColumnConfig>,
): QueueRecordLayoutConfigV3 {
    const colByWidth = new Map(baseConfig.columns.map((c) => [c.width, c]));

    const columns: QueueRecordColumnConfig[] = zones
        .filter((z) => z.key !== "actions" && z.inRow)
        .flatMap((z) => {
            const catalogCol = colByWidth.get(z.width) ?? catalog.get(z.key);
            if (!catalogCol) return [];

            const enabledIds = new Set(z.evidenceGroups.filter((g) => g.enabled).map((g) => g.blockId));
            const groupStateById = new Map(z.evidenceGroups.map((g) => [g.blockId, g]));
            const filteredBlocks = catalogCol.blocks
                .filter((b) => enabledIds.has(b.id))
                .map((b) => {
                    // Apply field-level toggles for field_group and repeated_record_block types
                    if (b.type !== "field_group" && b.type !== "repeated_record_block") return b;
                    const groupState = groupStateById.get(b.id);
                    if (!groupState || groupState.fields.length === 0) return b;
                    const enabledKeys = new Set(
                        groupState.fields.filter((f) => f.enabled).map((f) => f.fieldKey),
                    );
                    const filteredFields = b.fields.filter((f) => enabledKeys.has(f.fieldKey));
                    // Safety floor: always keep at least 1 field per block
                    const finalFields = filteredFields.length > 0 ? filteredFields : b.fields.slice(0, 1);
                    return { ...b, fields: finalFields };
                });
            const blocks = filteredBlocks.length > 0 ? filteredBlocks : catalogCol.blocks.slice(0, 1);

            const col: QueueRecordColumnConfig = { ...catalogCol, width: z.width, blocks };
            if (z.visibleWhen) col.visibleWhen = z.visibleWhen;
            else delete col.visibleWhen;
            return [col];
        });

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

// ── RowCanvas ─────────────────────────────────────────────────────────────────

function RowCanvas({
    zones,
    selectedKey,
    dragOverKey,
    dragHalf,
    onSelect,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: {
    zones: RowZoneState[];
    selectedKey: ZoneKey | null;
    dragOverKey: ZoneKey | null;
    dragHalf: "left" | "right" | null;
    onSelect: (key: ZoneKey) => void;
    onRemove: (key: ZoneKey) => void;
    onDragStart: (e: React.DragEvent, key: ZoneKey) => void;
    onDragOver: (e: React.DragEvent, key: ZoneKey) => void;
    onDrop: (e: React.DragEvent, key: ZoneKey) => void;
    onDragEnd: () => void;
}) {
    const inRow = zones.filter((z) => z.inRow);

    return (
        <div className="overflow-hidden rounded-xl border border-alloy-stone/14 bg-white shadow-sm" data-canvas>
            <div className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    Row canvas
                </p>
                <p className="text-[10px] text-alloy-midnight/30">Drag to reorder · click to inspect</p>
            </div>
            <div className="flex min-h-[72px] items-stretch divide-x divide-alloy-stone/10">
                {inRow.map((z) => {
                    const isSelected = z.key === selectedKey;
                    const isDragTarget = z.key === dragOverKey;
                    const sample = ZONE_SAMPLE[z.key];
                    const flex = ZONE_FLEX[z.key];
                    return (
                        <div
                            key={z.key}
                            style={{ flex }}
                            className={[
                                "group relative min-w-0 cursor-pointer select-none",
                                isSelected ? "bg-alloy-pine/[0.06] ring-1 ring-inset ring-alloy-pine/30" : "hover:bg-alloy-stone/[0.04]",
                                isDragTarget && dragHalf === "left" ? "border-l-2 border-alloy-pine" : "",
                                isDragTarget && dragHalf === "right" ? "border-r-2 border-alloy-pine" : "",
                            ].join(" ")}
                            draggable
                            onDragStart={(e) => onDragStart(e, z.key)}
                            onDragOver={(e) => onDragOver(e, z.key)}
                            onDrop={(e) => onDrop(e, z.key)}
                            onDragEnd={onDragEnd}
                            onClick={() => onSelect(z.key)}
                            data-canvas-zone={z.key}
                            data-canvas-selected={isSelected || undefined}
                        >
                            {/* Drag handle — top-right dot grid */}
                            <span
                                className="absolute right-1 top-1 cursor-grab text-[10px] leading-none text-alloy-midnight/20 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
                                aria-hidden
                            >
                                ⠿
                            </span>

                            {/* Remove button — appears on hover, hidden for actions */}
                            {z.key !== "actions" && (
                                <button
                                    type="button"
                                    className="absolute left-1 top-1 hidden rounded text-[10px] leading-none text-alloy-midnight/30 hover:text-red-400 group-hover:block"
                                    onClick={(e) => { e.stopPropagation(); onRemove(z.key); }}
                                    aria-label={`Remove ${ZONE_LABELS[z.key]}`}
                                    data-canvas-remove={z.key}
                                >
                                    ✕
                                </button>
                            )}

                            {/* Content */}
                            <div className="px-3 pb-3 pt-5">
                                <p className={`truncate text-[10px] font-semibold uppercase tracking-wide ${isSelected ? "text-alloy-pine" : "text-alloy-midnight/40"}`}>
                                    {ZONE_LABELS[z.key]}
                                </p>
                                {sample.filter(Boolean).map((line, i) => (
                                    <p key={i} className="mt-0.5 truncate text-[11px] text-alloy-midnight/50">
                                        {line}
                                    </p>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {inRow.length === 0 && (
                    <div className="flex flex-1 items-center justify-center py-6 text-[12px] text-alloy-midnight/30">
                        No zones in row — add from library below
                    </div>
                )}
            </div>
        </div>
    );
}

// ── BlockLibraryTray ──────────────────────────────────────────────────────────

function BlockLibraryTray({
    zones,
    onAdd,
}: {
    zones: RowZoneState[];
    onAdd: (key: ZoneKey) => void;
}) {
    const unused = zones.filter((z) => z.key !== "actions" && !z.inRow);
    if (unused.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2" data-block-library>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                Library
            </span>
            {unused.map((z) => (
                <button
                    key={z.key}
                    type="button"
                    onClick={() => onAdd(z.key)}
                    className="flex items-center gap-1 rounded-full border border-alloy-stone/20 bg-white px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/60 hover:border-alloy-pine/40 hover:bg-alloy-pine/[0.04] hover:text-alloy-pine"
                    data-library-zone={z.key}
                >
                    <span className="text-[10px]">+</span>
                    {ZONE_LABELS[z.key]}
                </button>
            ))}
        </div>
    );
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

function BlockInspector({
    zone,
    isWaitlist,
    placementOverrideEnabled,
    onClose,
    onSetWidth,
    onToggleGroup,
    onToggleField,
    onSetCondition,
    onClearCondition,
    onTogglePlacementOverride,
}: {
    zone: RowZoneState;
    isWaitlist: boolean;
    placementOverrideEnabled: boolean;
    onClose: () => void;
    onSetWidth: (w: QueueRecordColumnWidth) => void;
    onToggleGroup: (blockId: string) => void;
    onToggleField: (blockId: string, fieldKey: string) => void;
    onSetCondition: (c: LayoutCondition) => void;
    onClearCondition: () => void;
    onTogglePlacementOverride: () => void;
}) {
    const isActions = zone.key === "actions";
    const widthOptions: QueueRecordColumnWidth[] = isActions
        ? []
        : (ZONE_WIDTH_MAP[zone.key]
            ? [ZONE_WIDTH_MAP[zone.key]!, "small", "medium", "large", "flex"]
            : ["small", "medium", "large", "flex"]);
    const uniqueWidths = [...new Set(widthOptions)];

    return (
        <div className="rounded-xl border border-alloy-stone/14 bg-white shadow-sm" data-block-inspector={zone.key}>
            {/* Inspector header */}
            <div className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        Inspector
                    </p>
                    <span className="text-sm font-semibold text-alloy-midnight">{ZONE_LABELS[zone.key]}</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded p-0.5 text-alloy-midnight/30 hover:bg-alloy-stone/8 hover:text-alloy-midnight/60"
                    aria-label="Close inspector"
                    data-inspector-close
                >
                    ✕
                </button>
            </div>

            <div className="space-y-4 p-4">
                {/* Width selector */}
                {!isActions && uniqueWidths.length > 1 && (
                    <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Width
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {uniqueWidths.map((w) => (
                                <button
                                    key={w}
                                    type="button"
                                    onClick={() => onSetWidth(w)}
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                        zone.width === w
                                            ? "bg-alloy-pine text-white"
                                            : "border border-alloy-stone/20 bg-white text-alloy-midnight/60 hover:border-alloy-pine/40 hover:text-alloy-pine"
                                    }`}
                                    data-inspector-width={w}
                                >
                                    {WIDTH_LABELS[w] ?? w}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Evidence groups — named sections with per-field toggles */}
                {!isActions && zone.evidenceGroups.length > 0 && (
                    <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Evidence groups
                        </p>
                        <div className="space-y-2">
                            {zone.evidenceGroups.map((group) => (
                                <div
                                    key={group.blockId}
                                    className="overflow-hidden rounded-lg border border-alloy-stone/12 bg-alloy-stone/3"
                                    data-inspector-group={group.blockId}
                                >
                                    {/* Group header row */}
                                    <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={group.enabled}
                                            onClick={() => onToggleGroup(group.blockId)}
                                            className={`relative h-3.5 w-6 flex-shrink-0 rounded-full transition-colors ${
                                                group.enabled ? "bg-alloy-pine" : "bg-alloy-stone/30"
                                            }`}
                                            data-inspector-group-toggle={group.blockId}
                                        >
                                            <span
                                                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform ${
                                                    group.enabled ? "translate-x-2.5" : "translate-x-0.5"
                                                }`}
                                            />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[11px] font-semibold text-alloy-midnight">{group.label}</p>
                                            {group.description && !group.enabled && (
                                                <p className="truncate text-[10px] text-alloy-midnight/40">{group.description}</p>
                                            )}
                                        </div>
                                        <span className={`text-[10px] font-medium ${group.enabled ? "text-alloy-juniper" : "text-alloy-midnight/30"}`}>
                                            {group.enabled ? "On" : "Off"}
                                        </span>
                                    </div>

                                    {/* Per-field toggles — only visible when group is enabled */}
                                    {group.enabled && group.fields.length > 0 && (
                                        <div className="divide-y divide-alloy-stone/8 border-t border-alloy-stone/10 bg-white">
                                            {group.fields.map((field) => (
                                                <div
                                                    key={field.fieldKey}
                                                    className="flex items-center gap-2 px-3 py-1.5"
                                                    data-inspector-field={field.fieldKey}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        id={`field-${group.blockId}-${field.fieldKey}`}
                                                        checked={field.enabled}
                                                        onChange={() => onToggleField(group.blockId, field.fieldKey)}
                                                        className="h-3 w-3 rounded border-alloy-stone/30 text-alloy-pine focus:ring-alloy-pine/30"
                                                        data-inspector-field-toggle={field.fieldKey}
                                                    />
                                                    <label
                                                        htmlFor={`field-${group.blockId}-${field.fieldKey}`}
                                                        className="flex-1 cursor-pointer truncate text-[11px] text-alloy-midnight/75"
                                                    >
                                                        {field.label}
                                                    </label>
                                                    <span className="text-[9px] font-mono text-alloy-midnight/25">
                                                        {field.fieldKey.split(".")[1] ?? field.fieldKey}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Visibility condition */}
                {!isActions && (
                    <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Visibility condition
                        </p>
                        <ConditionForm
                            condition={zone.visibleWhen}
                            onSave={onSetCondition}
                            onClear={onClearCondition}
                        />
                        {!zone.visibleWhen && (
                            <p className="mt-1 text-[10px] text-alloy-midnight/30">No condition — always visible.</p>
                        )}
                    </div>
                )}

                {/* Actions zone inspector */}
                {isActions && (
                    <div className="space-y-3">
                        <p className="text-[11px] text-alloy-midnight/50">
                            When enabled, a ⋮ menu appears on each row with contextual actions.
                        </p>
                        {isWaitlist && (
                            <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                    Placement override
                                </p>
                                <div className="flex items-center gap-2.5 rounded-lg bg-alloy-stone/4 px-2.5 py-2">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={placementOverrideEnabled}
                                        onClick={onTogglePlacementOverride}
                                        className={`relative h-4 w-7 flex-shrink-0 rounded-full transition-colors ${
                                            placementOverrideEnabled ? "bg-alloy-pine" : "bg-alloy-stone/30"
                                        }`}
                                        data-placement-override-toggle
                                    >
                                        <span
                                            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                                                placementOverrideEnabled ? "translate-x-3" : "translate-x-0.5"
                                            }`}
                                        />
                                    </button>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-medium text-alloy-midnight">Inline placement override</p>
                                        <p className="text-[10px] text-alloy-midnight/45">
                                            Operators with placement write permission can set a manual tier per candidate.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
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
};

export default function QueueRowBuilderV2({ surfaceId = "pipeline-queue-row" }: Props) {
    const isWaitlist = surfaceId === "waitlist-queue-row";
    const surfaceLabel = isWaitlist ? "Waitlist Queue Row" : "Pipeline Queue Row";
    const grainLabel = isWaitlist ? "Candidate grain" : "Case grain";

    const catalog = useRef(buildCatalog(isWaitlist));

    const { data: serverData, loading, error: loadError } = useQueueRowLayoutConfig(surfaceId);
    const { publish, publishing, error: publishError, publishedAt } = useQueueRowPublish(surfaceId);

    const defaultConfig = isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();

    const [zones, setZones] = useState<RowZoneState[]>(() =>
        stateFromConfig(defaultConfig, catalog.current, isWaitlist),
    );
    const [placementOverrideEnabled, setPlacementOverrideEnabled] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [selectedKey, setSelectedKey] = useState<ZoneKey | null>(null);

    // Drag state (HTML5 DnD)
    const dragKey = useRef<ZoneKey | null>(null);
    const [dragOverKey, setDragOverKey] = useState<ZoneKey | null>(null);
    const [dragHalf, setDragHalf] = useState<"left" | "right" | null>(null);

    // Init from server data
    useEffect(() => {
        if (!serverData) return;
        setZones(stateFromConfig(serverData.config, catalog.current, isWaitlist));
        setPlacementOverrideEnabled(serverData.placementOverrideEnabled);
        setDirty(false);
    }, [serverData]);

    function mark(updater: (prev: RowZoneState[]) => RowZoneState[]) {
        setZones(updater);
        setDirty(true);
    }

    // Canvas: add zone from library
    const addZone = useCallback((key: ZoneKey) => {
        mark((prev) => prev.map((z) =>
            z.key === key
                ? { ...z, inRow: true, evidenceGroups: z.evidenceGroups.map((g) => ({ ...g, enabled: true })) }
                : z,
        ));
        setSelectedKey(key);
    }, []);

    // Canvas: remove zone back to library
    const removeZone = useCallback((key: ZoneKey) => {
        mark((prev) => prev.map((z) => (z.key === key ? { ...z, inRow: false } : z)));
        setSelectedKey((prev) => (prev === key ? null : prev));
    }, []);

    // Drag handlers
    const handleDragStart = useCallback((e: React.DragEvent, key: ZoneKey) => {
        dragKey.current = key;
        e.dataTransfer.effectAllowed = "move";
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, key: ZoneKey) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const half = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
        setDragOverKey(key);
        setDragHalf(half);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetKey: ZoneKey) => {
        e.preventDefault();
        const from = dragKey.current;
        if (!from || from === targetKey) {
            setDragOverKey(null);
            setDragHalf(null);
            return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const insertAfter = e.clientX >= rect.left + rect.width / 2;

        mark((prev) => {
            const next = [...prev];
            const fromIdx = next.findIndex((z) => z.key === from);
            const toIdx = next.findIndex((z) => z.key === targetKey);
            if (fromIdx === -1 || toIdx === -1) return prev;
            const [item] = next.splice(fromIdx, 1);
            const insertAt = insertAfter ? toIdx : Math.max(0, toIdx - (fromIdx < toIdx ? 1 : 0));
            next.splice(insertAt < fromIdx ? insertAt : insertAfter ? insertAt : insertAt, 0, item);
            return next;
        });
        setDragOverKey(null);
        setDragHalf(null);
        dragKey.current = null;
    }, []);

    const handleDragEnd = useCallback(() => {
        setDragOverKey(null);
        setDragHalf(null);
        dragKey.current = null;
    }, []);

    // Inspector mutations
    const setWidth = useCallback((key: ZoneKey, w: QueueRecordColumnWidth) => {
        mark((prev) => prev.map((z) => (z.key === key ? { ...z, width: w } : z)));
    }, []);

    const toggleGroup = useCallback((key: ZoneKey, blockId: string) => {
        mark((prev) =>
            prev.map((z) =>
                z.key !== key ? z : {
                    ...z,
                    evidenceGroups: z.evidenceGroups.map((g) =>
                        g.blockId === blockId ? { ...g, enabled: !g.enabled } : g,
                    ),
                },
            ),
        );
    }, []);

    const toggleField = useCallback((key: ZoneKey, blockId: string, fieldKey: string) => {
        mark((prev) =>
            prev.map((z) =>
                z.key !== key ? z : {
                    ...z,
                    evidenceGroups: z.evidenceGroups.map((g) =>
                        g.blockId !== blockId ? g : {
                            ...g,
                            fields: g.fields.map((f) =>
                                f.fieldKey !== fieldKey ? f : { ...f, enabled: !f.enabled },
                            ),
                        },
                    ),
                },
            ),
        );
    }, []);

    const setCondition = useCallback((key: ZoneKey, condition: LayoutCondition) => {
        mark((prev) => prev.map((z) => (z.key === key ? { ...z, visibleWhen: condition } : z)));
    }, []);

    const clearCondition = useCallback((key: ZoneKey) => {
        mark((prev) => prev.map((z) => (z.key === key ? { ...z, visibleWhen: null } : z)));
    }, []);

    const togglePlacementOverride = useCallback(() => {
        setPlacementOverrideEnabled((v) => !v);
        setDirty(true);
    }, []);

    async function handlePublish() {
        const base = serverData?.config ?? defaultConfig;
        const config = buildConfigFromState(base, zones, catalog.current);
        await publish(config, placementOverrideEnabled);
        setDirty(false);
    }

    const selectedZone = zones.find((z) => z.key === selectedKey) ?? null;

    return (
        <div
            className="queue-row-builder flex h-full min-h-0 flex-col gap-4 overflow-auto"
            data-queue-row-builder={surfaceId}
        >
            {/* Header */}
            <header className="border-b border-alloy-stone/10 pb-3">
                <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">
                        Queue Row Builder
                    </p>
                    <span className="rounded bg-alloy-stone/10 px-1.5 py-0.5 text-[10px] text-alloy-midnight/50">
                        {grainLabel}
                    </span>
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">{surfaceLabel}</h2>
                <p className="mt-0.5 text-sm text-alloy-midnight/55">
                    Drag zones to reorder, click to inspect evidence groups and conditions.
                </p>
            </header>

            {loadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Failed to load: {loadError}
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    <div className="h-24 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5" />
                    <div className="h-8 w-48 animate-pulse rounded-full bg-alloy-stone/5" />
                </div>
            ) : (
                <>
                    {/* Row canvas */}
                    <RowCanvas
                        zones={zones}
                        selectedKey={selectedKey}
                        dragOverKey={dragOverKey}
                        dragHalf={dragHalf}
                        onSelect={setSelectedKey}
                        onRemove={removeZone}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                    />

                    {/* Block library tray */}
                    <BlockLibraryTray zones={zones} onAdd={addZone} />

                    {/* Block inspector */}
                    {selectedZone && (
                        <BlockInspector
                            zone={selectedZone}
                            isWaitlist={isWaitlist}
                            placementOverrideEnabled={placementOverrideEnabled}
                            onClose={() => setSelectedKey(null)}
                            onSetWidth={(w) => setWidth(selectedZone.key, w)}
                            onToggleGroup={(blockId) => toggleGroup(selectedZone.key, blockId)}
                            onToggleField={(blockId, fieldKey) => toggleField(selectedZone.key, blockId, fieldKey)}
                            onSetCondition={(c) => setCondition(selectedZone.key, c)}
                            onClearCondition={() => clearCondition(selectedZone.key)}
                            onTogglePlacementOverride={togglePlacementOverride}
                        />
                    )}
                </>
            )}

            {/* Publish toolbar */}
            <div className="mt-auto">
                <PublishToolbar
                    dirty={dirty}
                    publishing={publishing}
                    publishedAt={publishedAt}
                    error={publishError}
                    onPublish={handlePublish}
                />
            </div>
        </div>
    );
}
