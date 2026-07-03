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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CondensedQueueRow } from "@/components/presentation/workUnit/CondensedQueueRow";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
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

/**
 * Anatomy region each builder zone owns in the REAL condensed row. The edit overlay
 * places one selectable region per in-row zone, aligned to where that zone's fields
 * render in the live `CondensedQueueRow` presenter (identity, status pill, attention
 * line, grouped-count chip, work/date footer). `actions` has no compact-row region —
 * it is configured from the library/inspector only.
 */
type AnatomyRegion = "identity" | "status" | "attention" | "groupCount" | "work" | null;
const ZONE_REGION: Record<ZoneKey, AnatomyRegion> = {
    household: "identity",
    status: "status",
    attention: "attention",
    children: "groupCount",
    date_event: "work",
    actions: null,
};

/**
 * A representative row context for the builder canvas — populates every compact slot so
 * the operator sees the real presenter with content. This is preview scaffolding for the
 * EDIT canvas only; the runtime always renders live `QueueRowContext` from the queue API.
 */
function sampleRowModel(isWaitlist: boolean): QueueRowModel {
    const context: QueueRowContext = {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "sample-1", display_name: "Smith Family" },
        row_stage: isWaitlist ? "Waitlist" : "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: isWaitlist ? "waitlisted" : "new_lead",
        row_status_label: isWaitlist ? "Waitlisted" : "New Lead",
        case_context: {
            case_id: "sample-1",
            display_name: "Smith Family",
            case_type_label: "Enrollment",
            case_status_key: isWaitlist ? "waitlisted" : "new_lead",
            case_status_label: isWaitlist ? "Waitlisted" : "New Lead",
        },
        primary_contact: { display_name: "Sarah Smith · (555) 000-1234" },
        related_subjects_summary: [],
        row_presentation_mode: "grouped_subjects",
        row_count: 2,
        row_count_unit: "children",
        attention_summary: { needs_attention: true, primary_reason_label: "Follow-up needed" },
        work_summary: { open_count: 1, primary_open_label: "Send welcome packet" },
        current_work_summary: { label: "Schedule tour", state: "open", due_label: "Thu Jul 3" },
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "sample-1" },
    };
    return { context, entityType: "opportunity", entityId: "sample-1" };
}

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
    width: QueueRecordColumnWidth;
    /** Operator-supplied display label for this column. Persisted to QueueRecordColumnConfig.label. */
    columnLabel: string;
    /** Stacked-section index within the condensed rail (0/1/2). Persisted to column.rowIndex. */
    rowIndex: number;
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

        // Named evidence groups from the registry — drives labeled inspector sections.
        // Passing tenantFieldDefinitions merges operator-created custom fields into
        // each group's availableFields by accepted namespace (V3 doctrine §5).
        const registryGroups = namedEvidenceGroupsForZone(key, isWaitlist, tenantFieldDefinitions);

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
                    // Adapter marks platform-defined vs tenant custom; default predefined
                    // for a field already in config but not in the registry group.
                    isSystemField: registryField?.isSystemField ?? true,
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
            columnLabel: col?.label || ZONE_LABELS[key] || key,
            rowIndex: clampRowIndex(col?.rowIndex ?? 0),
            visibleWhen: col?.visibleWhen ?? null,
            evidenceGroups: blocks,
        };
    });
}

export function buildConfigFromState(
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
                    // Base fields the operator kept, in their existing order.
                    const baseKeys = new Set(b.fields.map((f) => f.fieldKey));
                    const keptBase = b.fields.filter((f) => enabledKeys.has(f.fieldKey));
                    // Newly ADDED fields: enabled in the section but not in the base block
                    // (tenant custom fields, or predefined fields the operator re-added).
                    // Synthesize a minimal composition item — same persisted model.
                    const addedFields: QueueRecordFieldConfig[] = groupState.fields
                        .filter((f) => f.enabled && !baseKeys.has(f.fieldKey))
                        .map((f) => ({
                            id: `fld_${f.fieldKey.replace(/[^a-zA-Z0-9]+/g, "_")}`,
                            fieldKey: f.fieldKey,
                            label: f.label,
                            display: "text",
                        }));
                    const merged = [...keptBase, ...addedFields];
                    // Safety floor: always keep at least 1 field per block
                    const finalFields = merged.length > 0 ? merged : b.fields.slice(0, 1);
                    return { ...b, fields: finalFields };
                });
            const blocks = filteredBlocks.length > 0 ? filteredBlocks : catalogCol.blocks.slice(0, 1);

            const col: QueueRecordColumnConfig = {
                ...catalogCol,
                width: z.width,
                label: z.columnLabel,
                rowIndex: clampRowIndex(z.rowIndex),
                blocks,
            };
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

// ── AddFieldPicker ──────────────────────────────────────────────────────────────

/**
 * Section-scoped inline field picker. Lists the fields NOT yet on this section —
 * predefined (platform) and tenant custom, exactly as the composition adapter offers
 * them for the section's evidence groups. Picking one enables it through the same
 * toggle path the inspector uses (no new persistence). UI says Section / Field only.
 */
export function AddFieldPicker({
    zone,
    onPick,
    onClose,
}: {
    zone: RowZoneState;
    onPick: (blockId: string, fieldKey: string) => void;
    onClose: () => void;
}) {
    // Only enabled sections can receive a field (a disabled section contributes nothing
    // to the built config); within them, offer the fields that are not yet added.
    const sections = zone.evidenceGroups
        .filter((g) => g.enabled)
        .map((g) => ({ group: g, addable: g.fields.filter((f) => !f.enabled) }))
        .filter((s) => s.addable.length > 0);

    return (
        <span
            className="pointer-events-auto absolute left-0 top-6 z-20 w-60 rounded-lg border border-alloy-stone/20 bg-white p-1.5 shadow-lg"
            role="dialog"
            aria-label={`Add field to ${zone.columnLabel || ZONE_LABELS[zone.key]}`}
            data-add-field-picker={zone.key}
            onClick={(e) => e.stopPropagation()}
        >
            <span className="flex items-center justify-between px-1.5 pb-1 pt-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Add field · {zone.columnLabel || ZONE_LABELS[zone.key]}
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
                            {addable.map((field) => (
                                <button
                                    key={field.fieldKey}
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-alloy-pine/[0.06]"
                                    onClick={() => onPick(group.blockId, field.fieldKey)}
                                    data-add-field-option={field.fieldKey}
                                    data-add-field-custom={field.isSystemField ? undefined : "true"}
                                >
                                    <span className="text-[11px] leading-none text-alloy-pine">+</span>
                                    <span className="flex-1 truncate text-[11px] text-alloy-midnight/80">
                                        {field.label}
                                    </span>
                                    {!field.isSystemField ? (
                                        <span className="shrink-0 rounded-full bg-alloy-stone/15 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                            Custom
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
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
 * The overlay's clickable regions map anatomy → builder zone (see ZONE_REGION), so
 * select / remove / reorder operate on the actual row sections the operator sees.
 */
function QueueRowRuntimeCanvas({
    zones,
    liveConfig,
    sampleRow,
    selectedKey,
    onSelect,
    onRemove,
    onReorder,
    onAddField,
}: {
    zones: RowZoneState[];
    liveConfig: QueueRecordLayoutConfigV3;
    sampleRow: QueueRowModel;
    selectedKey: ZoneKey | null;
    onSelect: (key: ZoneKey) => void;
    onRemove: (key: ZoneKey) => void;
    onReorder: (key: ZoneKey, dir: -1 | 1) => void;
    /** Enable a field on a section (evidence group) — reuses the inspector's toggle path. */
    onAddField: (key: ZoneKey, blockId: string, fieldKey: string) => void;
}) {
    const inRow = zones.filter((z) => z.inRow);
    // Which section's inline "Add field" picker is open (null = none).
    const [pickerZone, setPickerZone] = useState<ZoneKey | null>(null);

    // The exact runtime consumption path: published/edited config → compact slots.
    const slots = mapQueueRowSurfaceToCompactConfig(liveConfig).slots;

    // Ordered list of overlay-selectable regions (zones that own a compact-row region).
    const regionZones = inRow.filter((z) => ZONE_REGION[z.key] !== null);
    const orderIndex = (key: ZoneKey) => regionZones.findIndex((z) => z.key === key);

    const RegionHandle = ({ z }: { z: RowZoneState }) => {
        const isSelected = z.key === selectedKey;
        const idx = orderIndex(z.key);
        return (
            <span
                className={[
                    "group/region pointer-events-auto absolute inset-0 z-10 flex items-center gap-0.5 rounded",
                    "cursor-pointer transition-shadow",
                    isSelected
                        ? "shadow-[inset_0_0_0_1.5px_var(--alloy-os-bend-pine,#00a283)]"
                        : "hover:shadow-[inset_0_0_0_1px_rgba(0,162,131,0.35)]",
                ].join(" ")}
            >
                <button
                    type="button"
                    className="h-full w-full cursor-pointer bg-transparent"
                    onClick={() => onSelect(z.key)}
                    aria-label={`Select ${z.columnLabel || ZONE_LABELS[z.key]} section`}
                    data-canvas-zone={z.key}
                    data-canvas-selected={isSelected || undefined}
                />
                {isSelected ? (
                    <span className="absolute -top-2 right-0 flex items-center gap-0.5">
                        <button
                            type="button"
                            className="rounded bg-white px-1 text-[10px] font-semibold leading-none text-alloy-pine shadow-sm hover:bg-alloy-pine/10"
                            onClick={(e) => { e.stopPropagation(); setPickerZone((p) => (p === z.key ? null : z.key)); }}
                            aria-label={`Add field to ${ZONE_LABELS[z.key]}`}
                            aria-expanded={pickerZone === z.key}
                            data-canvas-add-field={z.key}
                        >
                            + Field
                        </button>
                        <button
                            type="button"
                            className="rounded bg-white px-1 text-[10px] leading-none text-alloy-midnight/50 shadow-sm hover:text-alloy-pine disabled:opacity-30"
                            onClick={(e) => { e.stopPropagation(); onReorder(z.key, -1); }}
                            disabled={idx <= 0}
                            aria-label={`Move ${ZONE_LABELS[z.key]} earlier`}
                            data-canvas-reorder-left={z.key}
                        >
                            ←
                        </button>
                        <button
                            type="button"
                            className="rounded bg-white px-1 text-[10px] leading-none text-alloy-midnight/50 shadow-sm hover:text-alloy-pine disabled:opacity-30"
                            onClick={(e) => { e.stopPropagation(); onReorder(z.key, 1); }}
                            disabled={idx < 0 || idx >= regionZones.length - 1}
                            aria-label={`Move ${ZONE_LABELS[z.key]} later`}
                            data-canvas-reorder-right={z.key}
                        >
                            →
                        </button>
                        <button
                            type="button"
                            className="rounded bg-white px-1 text-[10px] leading-none text-alloy-midnight/40 shadow-sm hover:text-red-500"
                            onClick={(e) => { e.stopPropagation(); onRemove(z.key); }}
                            aria-label={`Remove ${ZONE_LABELS[z.key]}`}
                            data-canvas-remove={z.key}
                        >
                            ✕
                        </button>
                    </span>
                ) : null}
                {pickerZone === z.key ? (
                    <AddFieldPicker
                        zone={z}
                        onPick={(blockId, fieldKey) => { onAddField(z.key, blockId, fieldKey); setPickerZone(null); }}
                        onClose={() => setPickerZone(null)}
                    />
                ) : null}
            </span>
        );
    };

    // Anatomy region → absolute position over the real row (mirrors CondensedQueueRow's
    // fixed anatomy: identity top-left, status pill top-right, attention line, footer).
    const REGION_BOX: Record<Exclude<AnatomyRegion, null>, string> = {
        identity: "left-[42px] right-[7rem] top-[8px] h-[34px]",
        status: "right-3 top-[8px] h-5 w-[6.5rem]",
        attention: "left-[42px] right-3 top-[46px] h-4",
        groupCount: "left-[42px] top-[66px] h-4 w-[5rem]",
        work: "right-3 top-[66px] h-4 w-[9rem]",
    };

    return (
        <div className="overflow-hidden rounded-xl border border-alloy-stone/14 bg-alloy-stone/[0.03] shadow-sm" data-canvas>
            <div className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    Row canvas
                    <span className="ml-1.5 font-normal normal-case tracking-normal text-alloy-midnight/30">
                        · live runtime row · condensed rail {ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX}px
                    </span>
                </p>
                <p className="text-[10px] text-alloy-midnight/30">Click a section to inspect · reorder / remove on select</p>
            </div>
            {/*
             * Runtime-width frame: the condensed queue row renders inside a fixed
             * ~440px rail (--alloy-os-queue-compressed-width) whenever the Focus Panel
             * is docked. We render the ACTUAL CondensedQueueRow presenter here (same
             * component + same CompactRowSlots the runtime consumes) so the preview is
             * the real thing, not a mock — with the edit overlay layered on top.
             */}
            <div className="flex justify-center px-4 py-4">
                <div
                    className="relative rounded-lg"
                    style={{ width: ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX, maxWidth: ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX }}
                    data-canvas-runtime-frame
                    data-canvas-runtime-width={ALLOY_OS_QUEUE_COMPRESSED_WIDTH_PX}
                >
                    {/* Real runtime presenter — pointer-events off so the overlay owns interaction. */}
                    <div className="pointer-events-none" data-canvas-runtime-row>
                        <CondensedQueueRow row={sampleRow} rowConfig={slots} onOpen={() => {}} isFirst />
                    </div>
                    {/* Edit overlay — selectable anatomy regions mapped to builder zones. */}
                    {regionZones.length === 0 ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-alloy-midnight/30">
                            No sections in row — add from library below
                        </div>
                    ) : (
                        <div className="pointer-events-none absolute inset-0" data-canvas-overlay>
                            {regionZones.map((z) => {
                                const region = ZONE_REGION[z.key] as Exclude<AnatomyRegion, null>;
                                return (
                                    <span key={z.key} className={`absolute ${REGION_BOX[region]}`}>
                                        <RegionHandle z={z} />
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
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
    onSetRow,
    onSetLabel,
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
    onSetRow: (rowIndex: number) => void;
    onSetLabel: (label: string) => void;
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

                {/* Row (stacked section) selector — moves the block between rows */}
                {!isActions && (
                    <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Row (stacked section)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: MAX_STACKED_ROWS }, (_, i) => i).map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => onSetRow(r)}
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                        clampRowIndex(zone.rowIndex) === r
                                            ? "bg-alloy-pine text-white"
                                            : "border border-alloy-stone/20 bg-white text-alloy-midnight/60 hover:border-alloy-pine/40 hover:text-alloy-pine"
                                    }`}
                                    data-inspector-row={r}
                                >
                                    Row {r + 1}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1 text-[10px] text-alloy-midnight/30">
                            Stacked rows render inside the 440px condensed rail. Runtime consumption is presentation-runtime-ready (deferred).
                        </p>
                    </div>
                )}

                {/* Block label — operator-supplied display name */}
                {!isActions && (
                    <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                            Block label
                        </p>
                        <input
                            type="text"
                            value={zone.columnLabel}
                            onChange={(e) => onSetLabel(e.target.value)}
                            placeholder={ZONE_LABELS[zone.key]}
                            className="w-full rounded border border-alloy-stone/20 bg-white px-2.5 py-1.5 text-[12px] text-alloy-midnight focus:border-alloy-pine focus:outline-none"
                            data-inspector-label-input
                        />
                        <p className="mt-1 text-[10px] text-alloy-midnight/30">
                            Renames this column (e.g. Household → Family). Saved to layout.
                        </p>
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
    // Operator-created custom fields — merged into compatible groups' Add Field lists.
    const { tenantFieldDefinitions } = useTenantFieldDefinitions(isWaitlist ? "placement_candidate" : "opportunities");

    const defaultConfig = isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();

    const [zones, setZones] = useState<RowZoneState[]>(() =>
        stateFromConfig(defaultConfig, catalog.current, isWaitlist),
    );
    const [placementOverrideEnabled, setPlacementOverrideEnabled] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [selectedKey, setSelectedKey] = useState<ZoneKey | null>(null);

    // Init from server data. Re-runs when tenant field definitions load so custom
    // fields appear in each group's Add Field list. (Resets local edits — acceptable:
    // tenant defs resolve once, near-instantly, on mount.)
    useEffect(() => {
        if (!serverData) return;
        setZones(stateFromConfig(serverData.config, catalog.current, isWaitlist, tenantFieldDefinitions));
        setPlacementOverrideEnabled(serverData.placementOverrideEnabled);
        setDirty(false);
    }, [serverData, tenantFieldDefinitions, isWaitlist]);

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

    // Inspector mutations
    const setWidth = useCallback((key: ZoneKey, w: QueueRecordColumnWidth) => {
        mark((prev) => prev.map((z) => (z.key === key ? { ...z, width: w } : z)));
    }, []);

    // Move a block to a stacked row (Presentation Runtime V3).
    const setRow = useCallback((key: ZoneKey, rowIndex: number) => {
        mark((prev) => prev.map((z) => (z.key === key ? { ...z, rowIndex: clampRowIndex(rowIndex), inRow: true } : z)));
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

    const setLabel = useCallback((key: ZoneKey, label: string) => {
        mark((prev) => prev.map((z) => (z.key === key ? { ...z, columnLabel: label } : z)));
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

    // Canvas: reorder an in-row zone one step earlier/later (overlay ← / → controls).
    const moveZone = useCallback((key: ZoneKey, dir: -1 | 1) => {
        mark((prev) => {
            const next = [...prev];
            const fromIdx = next.findIndex((z) => z.key === key);
            if (fromIdx === -1) return prev;
            // Walk to the neighbouring in-row zone in the requested direction.
            let toIdx = fromIdx + dir;
            while (toIdx >= 0 && toIdx < next.length && !next[toIdx].inRow) toIdx += dir;
            if (toIdx < 0 || toIdx >= next.length || !next[toIdx].inRow) return prev;
            const [item] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, item);
            return next;
        });
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

    // The operator's in-progress config, rebuilt from live zones — this is the exact
    // shape the runtime consumes. Feeding it to the real CondensedQueueRow makes the
    // canvas the live runtime row, not a mock.
    const liveConfig = useMemo(
        () => buildConfigFromState(serverData?.config ?? defaultConfig, zones, catalog.current),
        [serverData, defaultConfig, zones],
    );
    const sampleRow = useMemo(() => sampleRowModel(isWaitlist), [isWaitlist]);

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
                    {/* Row canvas — the real runtime CondensedQueueRow with edit overlay. */}
                    <QueueRowRuntimeCanvas
                        zones={zones}
                        liveConfig={liveConfig}
                        sampleRow={sampleRow}
                        selectedKey={selectedKey}
                        onSelect={setSelectedKey}
                        onRemove={removeZone}
                        onReorder={moveZone}
                        onAddField={(key, blockId, fieldKey) => toggleField(key, blockId, fieldKey)}
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
                            onSetRow={(rowIndex) => setRow(selectedZone.key, rowIndex)}
                            onSetLabel={(label) => setLabel(selectedZone.key, label)}
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
