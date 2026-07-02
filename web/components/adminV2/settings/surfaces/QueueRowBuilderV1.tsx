"use client";

/**
 * Queue Row Builder — canvas surface editor for queue row configurations.
 *
 * Presents queue row configuration as a real layout builder surface:
 *   • Row preview canvas — live visual strip showing zones in runtime order
 *   • Drag-to-reorder zones — PointerEvent drag handles on each zone card
 *   • Evidence group inspector — blocks visible within each zone, individually toggleable
 *   • Condition inspector — per-zone visibility conditions (visible_when)
 *   • Action inspector — actionsMenu, actionRailStyle, placement override (waitlist)
 *   • Publish — POST /api/admin/queue-row-layout/[surfaceId], immediate publish
 *
 * The underlying QueueRecordLayoutConfigV3 schema is preserved unchanged.
 * Zone reordering drives the column array order; block toggles filter within columns.
 * Zone-level visibleWhen conditions are stored in QueueRecordColumnConfig.visibleWhen
 * (runtime evaluation deferred to queue row renderer V2).
 *
 * @see docs/platform/operator/queue-row-platform.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import { defaultLeadQueueLayoutV3, defaultWaitlistQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { LayoutCondition } from "@/lib/layout/layoutV2";
import type {
    QueueRecordBlockConfig,
    QueueRecordColumnConfig,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { useQueueRowLayoutConfig, useQueueRowPublish } from "@/lib/adminV2/settings/surfaces/useQueueRowBuilder";

type QueueRecordLayoutZone = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

// ── State types ──────────────────────────────────────────────────────────────

type QueueRowBlockState = {
    blockId: string;
    label: string;
    description: string;
    enabled: boolean;
};

type QueueRowZoneState = {
    zone: QueueRecordLayoutZone;
    enabled: boolean;
    blocks: QueueRowBlockState[];
    expanded: boolean;
    /** Zone-level visibility condition. Stored in column.visibleWhen on publish. */
    condition: LayoutCondition | null;
};

// ── Display metadata ─────────────────────────────────────────────────────────

const ZONE_LABELS: Record<QueueRecordLayoutZone, string> = {
    household: "Household",
    children: "Children / Candidate",
    status: "Status / Placement",
    attention: "Attention",
    date_event: "Date / Event",
    actions: "Actions",
};

const ZONE_PREVIEW_FIELDS: Record<QueueRecordLayoutZone, string[]> = {
    household: ["Contact name", "Phone"],
    children: ["Child name", "Program"],
    status: ["Stage", "Status"],
    attention: ["Attention signal"],
    date_event: ["Scheduled date"],
    actions: ["⋮"],
};

/** Flex weight for each zone in the preview canvas — proportional to column width. */
const ZONE_FLEX: Record<QueueRecordLayoutZone, number> = {
    household: 3,
    children: 3,
    status: 2,
    attention: 2,
    date_event: 1.5,
    actions: 0.5,
};

const ZONE_WIDTH_MAP: Partial<Record<QueueRecordLayoutZone, QueueRecordColumnWidth>> = {
    household: "identity",
    children: "children",
    status: "status_band",
    attention: "next_step",
    date_event: "date_event",
};

// ── Block label helpers ──────────────────────────────────────────────────────

const WIDGET_LABELS: Record<string, string> = {
    attention: "Attention widget",
    current_work: "Current work widget",
    activity_timeline: "Activity timeline",
    follow_ups: "Follow-ups",
};

function blockLabel(block: QueueRecordBlockConfig, index: number): string {
    if (block.type === "widget") {
        return block.label ?? WIDGET_LABELS[block.widgetKey] ?? block.widgetKey.replace(/_/g, " ");
    }
    if (block.type === "repeated_record_block") return block.itemLabel ?? "Repeating list";
    if (block.type === "field_group") return block.label ?? `Evidence group ${index + 1}`;
    return `Block ${index + 1}`;
}

function blockDescription(block: QueueRecordBlockConfig): string {
    if (block.type === "field_group") {
        return block.fields.map((f) => f.label ?? f.fieldKey).slice(0, 4).join(", ") || "Field group";
    }
    if (block.type === "repeated_record_block") {
        const names = block.fields.map((f) => f.label ?? f.fieldKey).slice(0, 3).join(", ");
        return names ? `Repeater: ${names}` : "Repeating rows";
    }
    if (block.type === "widget") return WIDGET_LABELS[block.widgetKey] ?? block.widgetKey;
    return "";
}

// ── State ↔ Config ───────────────────────────────────────────────────────────

/** Derive zone order from the column array (config-driven, not fixed-list order). */
function zonesFromConfig(config: QueueRecordLayoutConfigV3): QueueRowZoneState[] {
    const colByWidth = new Map(config.columns.map((c: QueueRecordColumnConfig) => [c.width, c]));

    // Content zones ordered by column array position, then disabled zones appended
    const columnZones = config.columns
        .map((col: QueueRecordColumnConfig) => {
            return (Object.entries(ZONE_WIDTH_MAP) as Array<[QueueRecordLayoutZone, QueueRecordColumnWidth]>).find(
                ([, w]) => w === col.width,
            )?.[0];
        })
        .filter(Boolean) as QueueRecordLayoutZone[];

    const disabledZones = QUEUE_RECORD_LAYOUT_ZONES.filter(
        (z) => z !== "actions" && !columnZones.includes(z),
    );

    const orderedZones: QueueRecordLayoutZone[] = [...columnZones, ...disabledZones, "actions"];

    return orderedZones.map((zone) => {
        const width = ZONE_WIDTH_MAP[zone];
        const col = width ? colByWidth.get(width) : undefined;
        const enabled = zone === "actions" ? config.fixedControls.actionsMenu : Boolean(col);
        const blocks: QueueRowBlockState[] = (col?.blocks ?? []).map((b, i) => ({
            blockId: b.id,
            label: blockLabel(b, i),
            description: blockDescription(b),
            enabled: true,
        }));
        return {
            zone,
            enabled,
            blocks,
            expanded: false,
            condition: col?.visibleWhen ?? null,
        };
    });
}

/** Build config from zone state, preserving zone order from state array. */
function buildConfigFromZones(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: QueueRowZoneState[],
): QueueRecordLayoutConfigV3 {
    const colByWidth = new Map(baseConfig.columns.map((c: QueueRecordColumnConfig) => [c.width, c]));
    const zonesByZone = new Map(zones.map((z) => [z.zone, z]));

    // Build columns in zone state order, skip disabled and actions
    const filteredColumns = zones
        .filter((z) => z.zone !== "actions" && z.enabled)
        .flatMap((z) => {
            const width = ZONE_WIDTH_MAP[z.zone];
            if (!width) return [];
            const col = colByWidth.get(width);
            if (!col) return [];

            const enabledBlockIds = new Set(z.blocks.filter((b) => b.enabled).map((b) => b.blockId));
            const filteredBlocks = col.blocks.filter((b) => enabledBlockIds.has(b.id));
            const blocks = filteredBlocks.length > 0 ? filteredBlocks : col.blocks.slice(0, 1);

            const result: QueueRecordColumnConfig = { ...col, blocks };
            if (z.condition) result.visibleWhen = z.condition;
            else delete result.visibleWhen;
            return [result];
        });

    return {
        ...baseConfig,
        columns: filteredColumns,
        fixedControls: {
            ...baseConfig.fixedControls,
            actionsMenu: zonesByZone.get("actions")?.enabled ?? baseConfig.fixedControls.actionsMenu,
        },
    };
}

// ── Row Preview Canvas ────────────────────────────────────────────────────────

function RowPreviewCanvas({
    zones,
    selectedZone,
    onSelect,
}: {
    zones: QueueRowZoneState[];
    selectedZone: QueueRecordLayoutZone | null;
    onSelect: (zone: QueueRecordLayoutZone) => void;
}) {
    return (
        <div
            className="w-full overflow-hidden rounded-xl border border-alloy-stone/14 bg-white shadow-sm"
            aria-label="Queue row preview"
            data-queue-row-preview-canvas
        >
            <div className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    Live row preview
                </p>
                <p className="text-[10px] text-alloy-midnight/30">Click a zone to inspect</p>
            </div>
            <div className="flex min-h-0 divide-x divide-alloy-stone/10">
                {zones
                    .filter((z) => z.enabled)
                    .map((z) => {
                        const flex = ZONE_FLEX[z.zone];
                        const isSelected = z.zone === selectedZone;
                        const previewFields = ZONE_PREVIEW_FIELDS[z.zone];
                        return (
                            <button
                                key={z.zone}
                                type="button"
                                onClick={() => onSelect(z.zone)}
                                style={{ flex }}
                                className={`min-w-0 cursor-pointer px-3 py-3 text-left transition-colors ${
                                    isSelected
                                        ? "bg-alloy-pine/[0.06] ring-1 ring-inset ring-alloy-pine/30"
                                        : "hover:bg-alloy-stone/[0.04]"
                                }`}
                                data-queue-row-preview-zone={z.zone}
                                aria-pressed={isSelected}
                            >
                                <p
                                    className={`truncate text-[10px] font-semibold uppercase tracking-wide ${
                                        isSelected ? "text-alloy-pine" : "text-alloy-midnight/40"
                                    }`}
                                >
                                    {ZONE_LABELS[z.zone]}
                                </p>
                                {previewFields.map((field, i) => (
                                    <p
                                        key={i}
                                        className="mt-0.5 truncate text-[11px] text-alloy-midnight/50"
                                    >
                                        {field}
                                    </p>
                                ))}
                                {z.blocks.length > 0 && (
                                    <p className="mt-1 text-[10px] text-alloy-midnight/30">
                                        {z.blocks.filter((b) => b.enabled).length} block
                                        {z.blocks.filter((b) => b.enabled).length !== 1 ? "s" : ""}
                                    </p>
                                )}
                            </button>
                        );
                    })}
            </div>
        </div>
    );
}

// ── Drag-to-reorder zone list ─────────────────────────────────────────────────

type DragState = {
    fromIndex: number;
    currentIndex: number;
    startY: number;
};

const ZONE_CARD_HEIGHT = 52; // px — estimated height per zone card for index calculation

function ZoneDragList({
    zones,
    selectedZone,
    onSelect,
    onToggle,
    onToggleBlock,
    onToggleExpanded,
    onReorder,
    onSetCondition,
    onClearCondition,
    isWaitlist,
    placementOverrideEnabled,
    onTogglePlacementOverride,
}: {
    zones: QueueRowZoneState[];
    selectedZone: QueueRecordLayoutZone | null;
    onSelect: (zone: QueueRecordLayoutZone) => void;
    onToggle: (zone: QueueRecordLayoutZone) => void;
    onToggleBlock: (zone: QueueRecordLayoutZone, blockId: string) => void;
    onToggleExpanded: (zone: QueueRecordLayoutZone) => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onSetCondition: (zone: QueueRecordLayoutZone, condition: LayoutCondition) => void;
    onClearCondition: (zone: QueueRecordLayoutZone) => void;
    isWaitlist: boolean;
    placementOverrideEnabled: boolean;
    onTogglePlacementOverride: () => void;
}) {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent, index: number) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragState({ fromIndex: index, currentIndex: index, startY: e.clientY });
        },
        [],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragState) return;
            const deltaY = e.clientY - dragState.startY;
            const newIndex = Math.max(
                0,
                Math.min(zones.length - 1, dragState.fromIndex + Math.round(deltaY / ZONE_CARD_HEIGHT)),
            );
            if (newIndex !== dragState.currentIndex) {
                setDragState((s) => s && { ...s, currentIndex: newIndex });
            }
        },
        [dragState, zones.length],
    );

    const handlePointerUp = useCallback(() => {
        if (dragState && dragState.fromIndex !== dragState.currentIndex) {
            onReorder(dragState.fromIndex, dragState.currentIndex);
        }
        setDragState(null);
    }, [dragState, onReorder]);

    return (
        <div ref={listRef} className="space-y-2" data-queue-row-zone-list>
            {zones.map((z, index) => {
                const isDragging = dragState?.fromIndex === index;
                const isDropTarget = dragState !== null && dragState.currentIndex === index && dragState.fromIndex !== index;
                return (
                    <div
                        key={z.zone}
                        className={`transition-transform ${isDragging ? "scale-[1.02] opacity-60 shadow-lg" : ""} ${isDropTarget ? "ring-2 ring-alloy-pine ring-offset-1 rounded-xl" : ""}`}
                        data-queue-row-zone={z.zone}
                    >
                        <ZoneCard
                            zone={z}
                            index={index}
                            isSelected={z.zone === selectedZone}
                            isWaitlist={isWaitlist}
                            placementOverrideEnabled={placementOverrideEnabled}
                            onSelect={() => onSelect(z.zone)}
                            onToggle={() => onToggle(z.zone)}
                            onToggleBlock={(blockId) => onToggleBlock(z.zone, blockId)}
                            onToggleExpanded={() => onToggleExpanded(z.zone)}
                            onSetCondition={(c) => onSetCondition(z.zone, c)}
                            onClearCondition={() => onClearCondition(z.zone)}
                            onTogglePlacementOverride={onTogglePlacementOverride}
                            onDragStart={(e) => handlePointerDown(e, index)}
                            onDragMove={handlePointerMove}
                            onDragEnd={handlePointerUp}
                        />
                    </div>
                );
            })}
        </div>
    );
}

// ── Condition form ────────────────────────────────────────────────────────────

function ConditionForm({
    condition,
    onSave,
    onClear,
}: {
    condition: LayoutCondition | null;
    onSave: (c: LayoutCondition) => void;
    onClear: () => void;
}) {
    const [type, setType] = useState<LayoutCondition["type"]>(condition?.type ?? "exists");
    const [path, setPath] = useState(condition?.path ?? "");
    const [value, setValue] = useState(condition?.value ?? "");
    const [editing, setEditing] = useState(false);

    if (!editing && !condition) {
        return (
            <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] text-alloy-pine hover:underline"
                data-queue-row-add-condition
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
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-[10px] text-alloy-midnight/40 hover:text-alloy-pine"
                >
                    Edit
                </button>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-[10px] text-alloy-midnight/40 hover:text-red-500"
                    aria-label="Remove condition"
                >
                    ×
                </button>
            </div>
        );
    }

    // Editing form
    return (
        <div className="space-y-2 rounded-lg border border-alloy-stone/14 bg-alloy-stone/3 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                Visible when
            </p>
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
                <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-[11px] text-alloy-midnight/40 hover:text-alloy-midnight/70"
                >
                    Cancel
                </button>
                {condition && (
                    <button
                        type="button"
                        onClick={() => { onClear(); setEditing(false); }}
                        className="ml-auto text-[11px] text-red-400 hover:text-red-600"
                    >
                        Remove
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Zone Card ─────────────────────────────────────────────────────────────────

function ZoneCard({
    zone,
    index,
    isSelected,
    isWaitlist,
    placementOverrideEnabled,
    onSelect,
    onToggle,
    onToggleBlock,
    onToggleExpanded,
    onSetCondition,
    onClearCondition,
    onTogglePlacementOverride,
    onDragStart,
    onDragMove,
    onDragEnd,
}: {
    zone: QueueRowZoneState;
    index: number;
    isSelected: boolean;
    isWaitlist: boolean;
    placementOverrideEnabled: boolean;
    onSelect: () => void;
    onToggle: () => void;
    onToggleBlock: (blockId: string) => void;
    onToggleExpanded: () => void;
    onSetCondition: (c: LayoutCondition) => void;
    onClearCondition: () => void;
    onTogglePlacementOverride: () => void;
    onDragStart: (e: React.PointerEvent) => void;
    onDragMove: (e: React.PointerEvent) => void;
    onDragEnd: (e: React.PointerEvent) => void;
}) {
    const isActionsZone = zone.zone === "actions";
    const enabledBlockCount = zone.blocks.filter((b) => b.enabled).length;

    return (
        <div
            className={`rounded-xl border transition-colors ${
                isSelected
                    ? "border-alloy-pine/40 bg-alloy-pine/[0.04] shadow-sm ring-1 ring-alloy-pine/20"
                    : "border-alloy-stone/12 bg-white hover:border-alloy-stone/20"
            }`}
            onClick={onSelect}
            data-queue-row-zone={zone.zone}
        >
            {/* Zone header row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
                {/* Drag handle */}
                <button
                    type="button"
                    className="group flex flex-shrink-0 cursor-grab touch-none items-center gap-1 text-alloy-midnight/25 hover:text-alloy-midnight/55 active:cursor-grabbing"
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    aria-label="Drag to reorder"
                    data-queue-row-drag-handle={zone.zone}
                    onClick={(e) => e.stopPropagation()}
                >
                    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="3" y="4" width="10" height="1.5" rx="0.75" />
                        <rect x="3" y="7.25" width="10" height="1.5" rx="0.75" />
                        <rect x="3" y="10.5" width="10" height="1.5" rx="0.75" />
                    </svg>
                </button>

                {/* Zone toggle */}
                <button
                    type="button"
                    role="switch"
                    aria-checked={zone.enabled}
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className={`relative h-4 w-7 flex-shrink-0 rounded-full transition-colors ${
                        zone.enabled ? "bg-alloy-pine" : "bg-alloy-stone/30"
                    }`}
                    data-queue-row-zone-toggle={zone.zone}
                >
                    <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                            zone.enabled ? "translate-x-3" : "translate-x-0.5"
                        }`}
                    />
                </button>

                {/* Zone label */}
                <div className="min-w-0 flex-1" onClick={onSelect}>
                    <span className="text-sm font-medium text-alloy-midnight">{ZONE_LABELS[zone.zone]}</span>
                    {!isActionsZone && zone.enabled && (
                        <span className="ml-2 text-[11px] text-alloy-midnight/40">
                            {enabledBlockCount} block{enabledBlockCount !== 1 ? "s" : ""}
                        </span>
                    )}
                    {zone.condition && (
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                            conditional
                        </span>
                    )}
                </div>

                {/* Expand/collapse (evidence groups + conditions) */}
                {!isActionsZone && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
                        className="ml-1 rounded p-0.5 text-alloy-midnight/30 hover:bg-alloy-stone/8 hover:text-alloy-midnight/60"
                        aria-label={zone.expanded ? "Collapse" : "Expand evidence groups"}
                        data-queue-row-zone-expand={zone.zone}
                    >
                        <svg
                            className={`h-3.5 w-3.5 transition-transform ${zone.expanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 12 12"
                        >
                            <path
                                d="M2 4l4 4 4-4"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                )}
            </div>

            {/* Expanded: evidence groups + conditions */}
            {zone.expanded && !isActionsZone && zone.enabled && (
                <div
                    className="border-t border-alloy-stone/8 px-3 pb-3 pt-2"
                    data-queue-row-zone-body={zone.zone}
                >
                    {/* Evidence groups */}
                    {zone.blocks.length > 0 && (
                        <div className="mb-3">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                Evidence groups
                            </p>
                            <div className="space-y-1">
                                {zone.blocks.map((block) => (
                                    <div
                                        key={block.blockId}
                                        className="flex items-center gap-2.5 rounded-lg bg-alloy-stone/4 px-2.5 py-1.5"
                                        data-queue-row-block={block.blockId}
                                    >
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={block.enabled}
                                            onClick={() => onToggleBlock(block.blockId)}
                                            className={`relative h-3.5 w-6 flex-shrink-0 rounded-full transition-colors ${
                                                block.enabled ? "bg-alloy-pine" : "bg-alloy-stone/30"
                                            }`}
                                            data-queue-row-block-toggle={block.blockId}
                                        >
                                            <span
                                                className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform ${
                                                    block.enabled ? "translate-x-2.5" : "translate-x-0.5"
                                                }`}
                                            />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[11px] font-medium text-alloy-midnight">
                                                {block.label}
                                            </p>
                                            {block.description && (
                                                <p className="truncate text-[10px] text-alloy-midnight/40">
                                                    {block.description}
                                                </p>
                                            )}
                                        </div>
                                        <span
                                            className={`text-[10px] font-medium ${
                                                block.enabled ? "text-alloy-juniper" : "text-alloy-midnight/30"
                                            }`}
                                        >
                                            {block.enabled ? "On" : "Off"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Condition inspector */}
                    <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Visibility condition
                        </p>
                        <ConditionForm
                            condition={zone.condition}
                            onSave={onSetCondition}
                            onClear={onClearCondition}
                        />
                        {!zone.condition && (
                            <p className="mt-1 text-[10px] text-alloy-midnight/30">
                                No condition — zone always visible.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Expanded: disabled zone note */}
            {zone.expanded && !isActionsZone && !zone.enabled && (
                <div className="border-t border-alloy-stone/8 px-3 pb-3 pt-2">
                    <p className="text-[11px] text-alloy-midnight/40">
                        Zone is off — hidden from the row.
                    </p>
                </div>
            )}

            {/* Actions zone inspector */}
            {isActionsZone && zone.expanded && (
                <div
                    className="border-t border-alloy-stone/8 px-3 pb-3 pt-2 space-y-3"
                    data-queue-row-actions-inspector
                >
                    <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Actions menu
                        </p>
                        <p className="text-[11px] text-alloy-midnight/50">
                            When enabled, a ⋮ menu appears on each row with contextual actions.
                        </p>
                    </div>

                    {isWaitlist && (
                        <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                Placement override
                            </p>
                            <div className="flex items-center gap-2.5 rounded-lg bg-alloy-stone/4 px-2.5 py-2">
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={placementOverrideEnabled}
                                    onClick={(e) => { e.stopPropagation(); onTogglePlacementOverride(); }}
                                    className={`relative h-4 w-7 flex-shrink-0 rounded-full transition-colors ${
                                        placementOverrideEnabled ? "bg-alloy-pine" : "bg-alloy-stone/30"
                                    }`}
                                    data-queue-row-placement-override-toggle
                                >
                                    <span
                                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                                            placementOverrideEnabled ? "translate-x-3" : "translate-x-0.5"
                                        }`}
                                    />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium text-alloy-midnight">
                                        Inline placement override
                                    </p>
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
    );
}

// ── Publish toolbar ───────────────────────────────────────────────────────────

function PublishToolbar({
    dirty,
    publishing,
    publishedAt,
    error,
    onPublish,
}: {
    dirty: boolean;
    publishing: boolean;
    publishedAt: string | null;
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
            {error && (
                <span className="text-[11px] text-red-500">{error}</span>
            )}
        </div>
    );
}

// ── Main builder component ────────────────────────────────────────────────────

type Props = {
    surfaceId?: string;
};

export default function QueueRowBuilderV1({ surfaceId = "pipeline-queue-row" }: Props) {
    const isWaitlist = surfaceId === "waitlist-queue-row";
    const surfaceLabel = isWaitlist ? "Waitlist Queue Row" : "Pipeline Queue Row";
    const grainLabel = isWaitlist ? "Candidate grain" : "Case grain";

    const { data: serverData, loading, error: loadError } = useQueueRowLayoutConfig(surfaceId);
    const { publish, publishing, error: publishError, publishedAt } = useQueueRowPublish(surfaceId);

    const defaultConfig = isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();

    const [zones, setZones] = useState<QueueRowZoneState[]>(() => zonesFromConfig(defaultConfig));
    const [placementOverrideEnabled, setPlacementOverrideEnabled] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [selectedZone, setSelectedZone] = useState<QueueRecordLayoutZone | null>(null);

    // Initialize from server data once loaded
    useEffect(() => {
        if (!serverData) return;
        setZones(zonesFromConfig(serverData.config));
        setPlacementOverrideEnabled(serverData.placementOverrideEnabled);
        setDirty(false);
    }, [serverData]);

    function mark(updater: (prev: QueueRowZoneState[]) => QueueRowZoneState[]) {
        setZones(updater);
        setDirty(true);
    }

    function toggleZone(zone: QueueRecordLayoutZone) {
        mark((prev) => prev.map((z) => (z.zone === zone ? { ...z, enabled: !z.enabled } : z)));
    }

    function toggleBlock(zone: QueueRecordLayoutZone, blockId: string) {
        mark((prev) =>
            prev.map((z) =>
                z.zone !== zone
                    ? z
                    : {
                          ...z,
                          blocks: z.blocks.map((b) =>
                              b.blockId === blockId ? { ...b, enabled: !b.enabled } : b,
                          ),
                      },
            ),
        );
    }

    function toggleExpanded(zone: QueueRecordLayoutZone) {
        setZones((prev) =>
            prev.map((z) => (z.zone === zone ? { ...z, expanded: !z.expanded } : z)),
        );
        setSelectedZone(zone);
    }

    function reorderZones(fromIndex: number, toIndex: number) {
        mark((prev) => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    }

    function setCondition(zone: QueueRecordLayoutZone, condition: LayoutCondition) {
        mark((prev) =>
            prev.map((z) => (z.zone === zone ? { ...z, condition } : z)),
        );
    }

    function clearCondition(zone: QueueRecordLayoutZone) {
        mark((prev) =>
            prev.map((z) => (z.zone === zone ? { ...z, condition: null } : z)),
        );
    }

    function togglePlacementOverride() {
        setPlacementOverrideEnabled((v) => !v);
        setDirty(true);
    }

    async function handlePublish() {
        const base = serverData?.config ?? defaultConfig;
        const config = buildConfigFromZones(base, zones);
        await publish(config, placementOverrideEnabled);
        setDirty(false);
    }

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
                    Drag zones to reorder, expand to configure evidence groups and conditions.
                </p>
            </header>

            {loadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Failed to load: {loadError}
                </div>
            )}

            {/* Row preview canvas */}
            {!loading && (
                <RowPreviewCanvas
                    zones={zones}
                    selectedZone={selectedZone}
                    onSelect={(zone) => {
                        setSelectedZone(zone);
                        setZones((prev) =>
                            prev.map((z) =>
                                z.zone === zone ? { ...z, expanded: true } : z,
                            ),
                        );
                    }}
                />
            )}

            {/* Zone drag list */}
            <section data-queue-row-zones>
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Zones
                    </h3>
                    <p className="text-[10px] text-alloy-midnight/30">≡ Drag to reorder</p>
                </div>
                {loading ? (
                    <div className="space-y-2">
                        {QUEUE_RECORD_LAYOUT_ZONES.map((zone) => (
                            <div
                                key={zone}
                                className="h-12 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5"
                            />
                        ))}
                    </div>
                ) : (
                    <ZoneDragList
                        zones={zones}
                        selectedZone={selectedZone}
                        onSelect={setSelectedZone}
                        onToggle={toggleZone}
                        onToggleBlock={toggleBlock}
                        onToggleExpanded={toggleExpanded}
                        onReorder={reorderZones}
                        onSetCondition={setCondition}
                        onClearCondition={clearCondition}
                        isWaitlist={isWaitlist}
                        placementOverrideEnabled={placementOverrideEnabled}
                        onTogglePlacementOverride={togglePlacementOverride}
                    />
                )}
            </section>

            {/* Publish toolbar */}
            <div className="mt-auto">
                <PublishToolbar
                    dirty={dirty}
                    publishing={publishing}
                    publishedAt={publishedAt ? publishedAt.toISOString() : null}
                    error={publishError}
                    onPublish={handlePublish}
                />
            </div>
        </div>
    );
}
