"use client";

/**
 * Queue Row Builder V1 — Design Surface editor for queue row configurations.
 *
 * Loads the current published QueueRecordLayoutConfigV3 for the selected surface,
 * lets operators toggle column zones on/off and control placement override (waitlist),
 * then publishes a new LayoutDoc version via POST /api/admin/queue-row-layout/[surfaceId].
 *
 * The runtime reads the published config via resolveQueueRecordLayoutConfig(doc),
 * so publishing here immediately affects queue row rendering once Layout V2 is active.
 *
 * V1 scope: zone visibility + placement override toggle + publish.
 * Deferred: per-zone field picker, zone reordering, advanced block configuration.
 *
 * @see docs/platform/operator/queue-row-platform.md
 */

import { useEffect, useState } from "react";
import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import { defaultLeadQueueLayoutV3, defaultWaitlistQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordLayoutConfigV3, QueueRecordColumnConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { useQueueRowLayoutConfig, useQueueRowPublish } from "@/lib/adminV2/settings/surfaces/useQueueRowBuilder";

type QueueRecordLayoutZone = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

type QueueRowZoneState = {
    zone: QueueRecordLayoutZone;
    enabled: boolean;
};

const ZONE_LABELS: Record<QueueRecordLayoutZone, string> = {
    household: "Household",
    children: "Children",
    status: "Status",
    attention: "Attention",
    date_event: "Date / Event",
    actions: "Actions",
};

const ZONE_DESCRIPTIONS: Record<QueueRecordLayoutZone, string> = {
    household: "Primary contact name, phone, and household identity",
    children: "Child names, programs, and enrollment status chips",
    status: "Record status pill and lifecycle stage label",
    attention: "Attention signal and primary next-step",
    date_event: "Scheduled tour date, follow-up date, or custom date field",
    actions: "Actions menu on the row",
};

/**
 * Zone → column width mapping. Each named zone corresponds to a canonical column
 * width in the QueueRecordLayoutConfigV3. "actions" maps to fixedControls.actionsMenu.
 */
const ZONE_WIDTH_MAP: Partial<Record<QueueRecordLayoutZone, QueueRecordColumnWidth>> = {
    household: "identity",
    children: "children",
    status: "status_band",
    attention: "next_step",
    date_event: "date_event",
};

function zonesFromConfig(config: QueueRecordLayoutConfigV3): QueueRowZoneState[] {
    const presentWidths = new Set(config.columns.map((c: QueueRecordColumnConfig) => c.width));
    return QUEUE_RECORD_LAYOUT_ZONES.map((zone) => ({
        zone,
        enabled:
            zone === "actions"
                ? config.fixedControls.actionsMenu
                : Boolean(ZONE_WIDTH_MAP[zone] && presentWidths.has(ZONE_WIDTH_MAP[zone]!)),
    }));
}

function buildConfigFromZones(
    baseConfig: QueueRecordLayoutConfigV3,
    zones: QueueRowZoneState[],
): QueueRecordLayoutConfigV3 {
    const enabledZones = new Set(zones.filter((z) => z.enabled).map((z) => z.zone));
    const enabledWidths = new Set(
        Object.entries(ZONE_WIDTH_MAP)
            .filter(([zone]) => enabledZones.has(zone as QueueRecordLayoutZone))
            .map(([, width]) => width),
    );
    const filteredColumns = baseConfig.columns.filter((col: QueueRecordColumnConfig) =>
        enabledWidths.has(col.width),
    );
    return {
        ...baseConfig,
        columns: filteredColumns,
        fixedControls: {
            ...baseConfig.fixedControls,
            actionsMenu: enabledZones.has("actions"),
        },
    };
}

type Props = {
    surfaceId?: string;
};

export default function QueueRowBuilderV1({ surfaceId = "pipeline-queue-row" }: Props) {
    const isWaitlist = surfaceId === "waitlist-queue-row";
    const surfaceLabel = isWaitlist ? "Waitlist Queue Row" : "Pipeline Queue Row";

    const { data: serverData, loading, error: loadError } = useQueueRowLayoutConfig(surfaceId);
    const { publish, publishing, error: publishError, publishedAt } = useQueueRowPublish(surfaceId);

    const defaultConfig = isWaitlist ? defaultWaitlistQueueLayoutV3() : defaultLeadQueueLayoutV3();

    const [zones, setZones] = useState<QueueRowZoneState[]>(() =>
        zonesFromConfig(defaultConfig),
    );
    const [placementOverrideEnabled, setPlacementOverrideEnabled] = useState(false);
    const [dirty, setDirty] = useState(false);

    // Initialize zone state from loaded server config once it arrives.
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">
                    Queue Row Builder
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">{surfaceLabel}</h2>
                <p className="mt-0.5 text-sm text-alloy-midnight/55">
                    Configure which zones appear on each row. Changes apply to the runtime when published.
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
                        {zones.map(({ zone, enabled }) => (
                            <div
                                key={zone}
                                className="flex items-center gap-3 rounded-lg border border-alloy-stone/12 bg-white px-4 py-3"
                                data-queue-row-zone={zone}
                            >
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
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {isWaitlist && (
                <section data-queue-row-placement-override>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Placement controls
                    </h3>
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
                                Shows an inline override control on each candidate row. Operators with placement
                                write permission can set a manual priority tier. Rule-based ranking resumes when
                                the override is released.
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
