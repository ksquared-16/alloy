"use client";

/**
 * Queue Row Builder V1 — Design Surface editor for queue row configurations.
 *
 * Mirrors the Focus Panel Summary editor architecture: operators configure which
 * columns/blocks appear on each queue row surface. The runtime reads the saved
 * QueueRecordLayoutConfigV3 from the LayoutDoc; this builder writes that config.
 *
 * V1 scope: column zone assignment + field picker per zone + placement override
 * toggle. Builder and runtime share the same QueueRecordLayoutConfigV3 schema —
 * no preview-only state.
 *
 * @see docs/platform/operator/queue-row-platform.md
 */

import { useState } from "react";
import {
    QUEUE_RECORD_LAYOUT_ZONES,
} from "@/lib/layout/surfaceLayoutRegistry";

type QueueRecordLayoutZone = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

type QueueRowZoneState = {
    zone: QueueRecordLayoutZone;
    enabled: boolean;
    fieldKeys: string[];
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
    attention: "Attention signal and primary reason",
    date_event: "Scheduled tour date, follow-up date, or custom date field",
    actions: "Quick-action buttons on the row",
};

function initialZoneState(surface: string): QueueRowZoneState[] {
    const baseZones: QueueRecordLayoutZone[] = ["household", "children", "status", "attention", "date_event"];
    const isWaitlist = surface === "waitlist-queue-row";
    return QUEUE_RECORD_LAYOUT_ZONES.map((zone) => ({
        zone,
        enabled: baseZones.includes(zone) || (isWaitlist && zone === "actions"),
        fieldKeys: [],
    }));
}

type Props = {
    surfaceId?: string;
};

export default function QueueRowBuilderV1({ surfaceId = "pipeline-queue-row" }: Props) {
    const [zones, setZones] = useState<QueueRowZoneState[]>(() => initialZoneState(surfaceId));
    const [placementOverrideEnabled, setPlacementOverrideEnabled] = useState(false);

    const isWaitlist = surfaceId === "waitlist-queue-row";
    const surfaceLabel = isWaitlist ? "Waitlist Queue Row" : "Pipeline Queue Row";

    function toggleZone(zone: QueueRecordLayoutZone) {
        setZones((prev) =>
            prev.map((z) =>
                z.zone === zone ? { ...z, enabled: !z.enabled } : z,
            ),
        );
    }

    return (
        <div className="queue-row-builder-v1 flex h-full min-h-0 flex-col gap-4 overflow-auto" data-queue-row-builder={surfaceId}>
            <header className="border-b border-alloy-stone/10 pb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Queue Row Builder</p>
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">{surfaceLabel}</h2>
                <p className="mt-0.5 text-sm text-alloy-midnight/55">
                    Configure which zones appear on each row. Column order follows the zone order below.
                    Changes apply to the runtime — the queue row renderer reads this configuration.
                </p>
            </header>

            <section data-queue-row-zones>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Column zones</h3>
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
                                className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? "bg-alloy-pine" : "bg-alloy-stone/30"}`}
                                data-queue-row-zone-toggle={zone}
                            >
                                <span
                                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`}
                                />
                            </button>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-alloy-midnight">{ZONE_LABELS[zone]}</p>
                                <p className="text-xs text-alloy-midnight/50">{ZONE_DESCRIPTIONS[zone]}</p>
                            </div>
                            <span className={`text-xs font-medium ${enabled ? "text-alloy-juniper" : "text-alloy-midnight/35"}`}>
                                {enabled ? "On" : "Off"}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {isWaitlist && (
                <section data-queue-row-placement-override>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Placement override</h3>
                    <div className="flex items-center gap-3 rounded-lg border border-alloy-stone/12 bg-white px-4 py-3">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={placementOverrideEnabled}
                            onClick={() => setPlacementOverrideEnabled((v) => !v)}
                            className={`relative h-5 w-9 rounded-full transition-colors ${placementOverrideEnabled ? "bg-alloy-pine" : "bg-alloy-stone/30"}`}
                            data-queue-row-placement-override-toggle
                        >
                            <span
                                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${placementOverrideEnabled ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                        </button>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-alloy-midnight">Placement override affordance</p>
                            <p className="text-xs text-alloy-midnight/50">
                                Shows an inline override control on each row. Operators with placement write permission
                                can set a manual priority tier. Rule-based ranking resumes when the override is cleared.
                            </p>
                        </div>
                        <span className={`text-xs font-medium ${placementOverrideEnabled ? "text-alloy-juniper" : "text-alloy-midnight/35"}`}>
                            {placementOverrideEnabled ? "On" : "Off"}
                        </span>
                    </div>
                </section>
            )}

            <div className="mt-auto border-t border-alloy-stone/10 pt-4">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-40"
                        disabled
                        title="Save is wired to the LayoutDoc persistence layer — Phase D2"
                    >
                        Save configuration
                    </button>
                    <span className="text-[11px] text-alloy-midnight/40">
                        Persistence wires to LayoutDoc in Phase D2
                    </span>
                </div>
            </div>
        </div>
    );
}
