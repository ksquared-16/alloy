"use client";

/**
 * Queue Row Builder V1 — Design Surface editor for queue row configurations.
 *
 * Loads the current published QueueRecordLayoutConfigV3 for the selected surface.
 * Operators configure:
 *   1. Which column zones appear (household, children/candidate, status, attention, date, actions)
 *   2. Which evidence groups (blocks) are visible within each enabled zone
 *   3. Placement override affordance (waitlist surface only)
 *
 * Publishes via POST /api/admin/queue-row-layout/[surfaceId], which creates a draft
 * LayoutDoc and immediately publishes it. The runtime reads the config via
 * resolveQueueRecordLayoutConfig(doc) — no separate deployment step.
 *
 * V1 scope: zone + evidence group visibility, placement override toggle, publish.
 * Deferred: zone reordering, field picker within blocks, compact display mode.
 *
 * @see docs/platform/operator/queue-row-platform.md
 */

import { useEffect, useState } from "react";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import { defaultLeadQueueLayoutV3, defaultWaitlistQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import type {
    QueueRecordBlockConfig,
    QueueRecordColumnConfig,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { useQueueRowLayoutConfig, useQueueRowPublish } from "@/lib/adminV2/settings/surfaces/useQueueRowBuilder";

type QueueRecordLayoutZone = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

// ── State types ─────────────────────────────────────────────────────────────

type QueueRowBlockState = {
    blockId: string;
    label: string;
    description: string;
    enabled: boolean;
};

type QueueRowZoneState = {
    zone: QueueRecordLayoutZone;
    enabled: boolean;
    /** Evidence groups (blocks) within this zone — each independently toggleable. */
    blocks: QueueRowBlockState[];
    expanded: boolean;
};

// ── Display labels ───────────────────────────────────────────────────────────

const ZONE_LABELS: Record<QueueRecordLayoutZone, string> = {
    household: "Household",
    children: "Children / Candidate",
    status: "Status / Placement",
    attention: "Attention",
    date_event: "Date / Event",
    actions: "Actions",
};

const ZONE_DESCRIPTIONS: Record<QueueRecordLayoutZone, string> = {
    household: "Primary contact name, phone, and household identity",
    children: "Child or candidate summary — names, programs, room, schedule",
    status: "Record status, lifecycle stage, or placement position and tier",
    attention: "Attention signal and open work context",
    date_event: "Scheduled date — tour date, wait since, or custom date field",
    actions: "Actions menu on the row",
};

/**
 * Zone → column width mapping. Each zone corresponds to a canonical column
 * width in QueueRecordLayoutConfigV3. "actions" maps to fixedControls.actionsMenu.
 */
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
    if (block.type === "repeated_record_block") {
        return block.itemLabel ?? "Repeating list";
    }
    if (block.type === "field_group") {
        return block.label ?? `Evidence group ${index + 1}`;
    }
    return `Block ${index + 1}`;
}

function blockDescription(block: QueueRecordBlockConfig): string {
    if (block.type === "field_group") {
        const names = block.fields
            .map((f) => f.label ?? f.fieldKey)
            .slice(0, 4)
            .join(", ");
        return names || "Field group";
    }
    if (block.type === "repeated_record_block") {
        const names = block.fields
            .map((f) => f.label ?? f.fieldKey)
            .slice(0, 3)
            .join(", ");
        return names ? `Repeater: ${names}` : "Repeating rows";
    }
    if (block.type === "widget") {
        return WIDGET_LABELS[block.widgetKey] ?? block.widgetKey;
    }
    return "";
}

// ── State ↔ Config ───────────────────────────────────────────────────────────

function zonesFromConfig(config: QueueRecordLayoutConfigV3): QueueRowZoneState[] {
    const colByWidth = new Map(config.columns.map((c: QueueRecordColumnConfig) => [c.width, c]));

    return QUEUE_RECORD_LAYOUT_ZONES.map((zone) => {
        const width = ZONE_WIDTH_MAP[zone];
        const col = width ? colByWidth.get(width) : undefined;

        const enabled = zone === "actions" ? config.fixedControls.actionsMenu : Boolean(col);

        const blocks: QueueRowBlockState[] = (col?.blocks ?? []).map((b, i) => ({
            blockId: b.id,
            label: blockLabel(b, i),
            description: blockDescription(b),
            enabled: true,
        }));

        return { zone, enabled, blocks, expanded: false };
    });
}

function buildConfigFromZones(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: QueueRowZoneState[],
): QueueRecordLayoutConfigV3 {
    const enabledZones = new Set(zones.filter((z) => z.enabled).map((z) => z.zone));
    const zonesByZone = new Map(zones.map((z) => [z.zone, z]));

    const enabledWidths = new Set(
        Object.entries(ZONE_WIDTH_MAP)
            .filter(([zone]) => enabledZones.has(zone as QueueRecordLayoutZone))
            .map(([, width]) => width),
    );

    const filteredColumns = baseConfig.columns
        .filter((col: QueueRecordColumnConfig) => enabledWidths.has(col.width))
        .map((col: QueueRecordColumnConfig) => {
            const zoneKey = (
                Object.entries(ZONE_WIDTH_MAP) as Array<[QueueRecordLayoutZone, QueueRecordColumnWidth]>
            ).find(([, w]) => w === col.width)?.[0];
            const zoneState = zoneKey ? zonesByZone.get(zoneKey) : undefined;

            if (!zoneState?.blocks.length) return col;

            const enabledBlockIds = new Set(
                zoneState.blocks.filter((b) => b.enabled).map((b) => b.blockId),
            );
            const filteredBlocks = col.blocks.filter((b) => enabledBlockIds.has(b.id));
            // Keep at least one block — if all are disabled, keep the first.
            const blocks = filteredBlocks.length > 0 ? filteredBlocks : col.blocks.slice(0, 1);
            return { ...col, blocks };
        });

    return {
        ...baseConfig,
        columns: filteredColumns,
        fixedControls: {
            ...baseConfig.fixedControls,
            actionsMenu: enabledZones.has("actions"),
        },
    };
}

// ── Component ────────────────────────────────────────────────────────────────

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

    useEffect(() => {
        if (!serverData) return;
        setZones(zonesFromConfig(serverData.config));
        setPlacementOverrideEnabled(serverData.placementOverrideEnabled);
        setDirty(false);
    }, [serverData]);

    function toggleZone(zone: QueueRecordLayoutZone) {
        setZones((prev) => prev.map((z) => (z.zone === zone ? { ...z, enabled: !z.enabled } : z)));
        setDirty(true);
    }

    function toggleZoneExpanded(zone: QueueRecordLayoutZone) {
        setZones((prev) =>
            prev.map((z) => (z.zone === zone ? { ...z, expanded: !z.expanded } : z)),
        );
    }

    function toggleBlock(zone: QueueRecordLayoutZone, blockId: string) {
        setZones((prev) =>
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
        setDirty(true);
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

    const canPublish = !loading && !publishing && dirty;

    return (
        <div
            className="queue-row-builder-v1 flex h-full min-h-0 flex-col gap-4 overflow-auto"
            data-queue-row-builder={surfaceId}
        >
            <header className="border-b border-alloy-stone/10 pb-4">
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
                    Toggle zones and evidence groups. Changes apply to the runtime when published.
                </p>
            </header>

            {loadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Failed to load configuration: {loadError}
                </div>
            )}

            <section data-queue-row-zones>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Column zones
                </h3>
                {loading ? (
                    <div className="space-y-2">
                        {QUEUE_RECORD_LAYOUT_ZONES.map((zone) => (
                            <div
                                key={zone}
                                className="h-14 animate-pulse rounded-lg border border-alloy-stone/12 bg-alloy-stone/5"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {zones.map(({ zone, enabled, blocks, expanded }) => (
                            <div
                                key={zone}
                                className="rounded-lg border border-alloy-stone/12 bg-white"
                                data-queue-row-zone={zone}
                            >
                                {/* Zone header row */}
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={enabled}
                                        onClick={() => toggleZone(zone)}
                                        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${enabled ? "bg-alloy-pine" : "bg-alloy-stone/30"}`}
                                        data-queue-row-zone-toggle={zone}
                                    >
                                        <span
                                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`}
                                        />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-alloy-midnight">
                                            {ZONE_LABELS[zone]}
                                        </p>
                                        <p className="text-xs text-alloy-midnight/50">
                                            {ZONE_DESCRIPTIONS[zone]}
                                        </p>
                                    </div>
                                    <span
                                        className={`text-xs font-medium ${enabled ? "text-alloy-juniper" : "text-alloy-midnight/35"}`}
                                    >
                                        {enabled ? "On" : "Off"}
                                    </span>
                                    {/* Expand/collapse evidence groups — only for content zones with blocks */}
                                    {zone !== "actions" && blocks.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => toggleZoneExpanded(zone)}
                                            className="ml-1 rounded p-1 text-alloy-midnight/35 hover:bg-alloy-stone/5 hover:text-alloy-midnight/60"
                                            aria-label={expanded ? "Collapse evidence groups" : "Expand evidence groups"}
                                            data-queue-row-zone-expand={zone}
                                        >
                                            <svg
                                                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
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

                                {/* Evidence group list — visible when expanded and zone is enabled */}
                                {expanded && enabled && blocks.length > 0 && (
                                    <div
                                        className="border-t border-alloy-stone/8 px-4 pb-3 pt-2"
                                        data-queue-row-zone-blocks={zone}
                                    >
                                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                                            Evidence groups
                                        </p>
                                        <div className="space-y-1.5">
                                            {blocks.map((block) => (
                                                <div
                                                    key={block.blockId}
                                                    className="flex items-center gap-3 rounded-md bg-alloy-stone/4 px-3 py-2"
                                                    data-queue-row-block={block.blockId}
                                                >
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={block.enabled}
                                                        onClick={() => toggleBlock(zone, block.blockId)}
                                                        className={`relative h-4 w-7 flex-shrink-0 rounded-full transition-colors ${block.enabled ? "bg-alloy-pine" : "bg-alloy-stone/30"}`}
                                                        data-queue-row-block-toggle={block.blockId}
                                                    >
                                                        <span
                                                            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${block.enabled ? "translate-x-3" : "translate-x-0.5"}`}
                                                        />
                                                    </button>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-medium text-alloy-midnight">
                                                            {block.label}
                                                        </p>
                                                        {block.description && (
                                                            <p className="truncate text-[11px] text-alloy-midnight/45">
                                                                {block.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span
                                                        className={`text-[11px] font-medium ${block.enabled ? "text-alloy-juniper" : "text-alloy-midnight/30"}`}
                                                    >
                                                        {block.enabled ? "On" : "Off"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Disabled zone callout */}
                                {expanded && !enabled && (
                                    <div className="border-t border-alloy-stone/8 px-4 pb-3 pt-2">
                                        <p className="text-[11px] text-alloy-midnight/40">
                                            Zone is off — evidence groups are hidden from the row.
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {isWaitlist && (
                <section data-queue-row-placement-override>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Placement controls
                    </h3>
                    <p className="mb-3 text-[11px] text-alloy-midnight/45">
                        Placement override APIs are active ({"✓"} POST /placement-candidates/[id]/overrides).
                        The toggle below enables the inline override affordance on each candidate row.
                    </p>
                    <div className="flex items-center gap-3 rounded-lg border border-alloy-stone/12 bg-white px-4 py-3">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={placementOverrideEnabled}
                            onClick={togglePlacementOverride}
                            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${placementOverrideEnabled ? "bg-alloy-pine" : "bg-alloy-stone/30"}`}
                            data-queue-row-placement-override-toggle
                        >
                            <span
                                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${placementOverrideEnabled ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                        </button>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-alloy-midnight">
                                Placement override affordance
                            </p>
                            <p className="text-xs text-alloy-midnight/50">
                                Shows a manual priority control on each candidate row. Operators with
                                placement write permission can set a manual tier. Rule-based ranking
                                resumes when the override is released.
                            </p>
                        </div>
                        <span
                            className={`text-xs font-medium ${placementOverrideEnabled ? "text-alloy-juniper" : "text-alloy-midnight/35"}`}
                        >
                            {placementOverrideEnabled ? "On" : "Off"}
                        </span>
                    </div>
                </section>
            )}

            <div className="mt-auto border-t border-alloy-stone/10 pt-4">
                {publishError && (
                    <p className="mb-3 text-sm text-red-600">Publish failed: {publishError}</p>
                )}
                {publishedAt && !dirty && (
                    <p className="mb-3 text-sm text-alloy-juniper">Configuration published.</p>
                )}
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handlePublish}
                        disabled={!canPublish}
                        className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-40"
                        data-queue-row-builder-publish
                    >
                        {publishing ? "Publishing…" : "Publish configuration"}
                    </button>
                    {!dirty && !publishing && !publishedAt && !loading && (
                        <span className="text-[11px] text-alloy-midnight/40">No unsaved changes.</span>
                    )}
                    {dirty && (
                        <span className="text-[11px] text-alloy-midnight/55">Unsaved changes.</span>
                    )}
                </div>
            </div>
        </div>
    );
}
