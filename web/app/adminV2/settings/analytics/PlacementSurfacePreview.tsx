"use client";

import type { MetricVisualizationRow } from "@/lib/metrics/platform/types";
import { humanPlacementLabel, SURFACE_OPTIONS, ZONE_LABELS, type SurfaceKey } from "@/app/adminV2/settings/analytics/platformBuilderLabels";

type Props = {
    surface: string;
    zone: string;
    visualizationLabel?: string;
};

function ZoneBlock({ label, active }: { label: string; active?: boolean }) {
    return (
        <div
            className={`rounded-md border px-2 py-1.5 text-[10px] ${
                active
                    ? "border-alloy-juniper/35 bg-alloy-juniper/10 font-semibold text-alloy-juniper"
                    : "border-alloy-stone/20 bg-white text-alloy-midnight/40"
            }`}
        >
            {label}
        </div>
    );
}

export function PlacementSurfacePreview({ surface, zone, visualizationLabel }: Props) {
    if (surface === "operational_intelligence") {
        const zones = ["overview", "health", "trends", "comparisons"];
        return (
            <div className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.03] p-3" data-placement-preview="oi">
                <p className="text-xs font-semibold text-alloy-midnight">Operational Intelligence preview</p>
                <div className="mt-2 grid gap-2">
                    {zones.map((z) => (
                        <ZoneBlock
                            key={z}
                            label={ZONE_LABELS.operational_intelligence[z] ?? z}
                            active={z === zone}
                        />
                    ))}
                </div>
                {visualizationLabel && zone ?
                    <p className="mt-2 text-[11px] text-alloy-midnight/55">
                        Placing <strong>{visualizationLabel}</strong> in {humanPlacementLabel(surface, zone)}.
                    </p>
                :   null}
            </div>
        );
    }

    if (surface === "workspace_header") {
        return (
            <div className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.03] p-3">
                <p className="text-xs font-semibold text-alloy-midnight">Workspace header preview</p>
                <div className="mt-2 space-y-2">
                    <ZoneBlock label="Primary metrics" active={zone === "primary_metrics"} />
                    <ZoneBlock label="Secondary metrics" active={zone === "secondary_metrics"} />
                </div>
            </div>
        );
    }

    if (surface === "work_unit_header") {
        return (
            <div className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.03] p-3">
                <p className="text-xs font-semibold text-alloy-midnight">Work unit header preview</p>
                <div className="mt-2 rounded-lg border border-alloy-stone/20 bg-white p-2">
                    <div className="h-2 w-24 rounded bg-alloy-stone/20" />
                    <div className="mt-2 flex gap-2">
                        <ZoneBlock label="Header metrics" active />
                    </div>
                </div>
            </div>
        );
    }

    if (surface === "business_process_tile") {
        return (
            <div className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.03] p-3">
                <p className="text-xs font-semibold text-alloy-midnight">Business process tile preview</p>
                <div className="mt-2 max-w-[14rem] rounded-lg border border-alloy-stone/25 bg-white p-3">
                    <div className="h-2.5 w-28 rounded bg-alloy-stone/25" />
                    <div className="mt-3">
                        <ZoneBlock label="Tile metrics" active />
                    </div>
                </div>
            </div>
        );
    }

    const surfaceMeta = SURFACE_OPTIONS.find((s) => s.key === surface);
    const zoneLabel = ZONE_LABELS[surface]?.[zone] ?? zone.replace(/_/g, " ");
    return (
        <div className="rounded-lg border border-dashed border-alloy-stone/25 px-3 py-2 text-xs text-alloy-midnight/50">
            {surfaceMeta?.label ?? surface} — {zoneLabel}
        </div>
    );
}

export function SurfacePicker({
    value,
    onChange,
}: {
    value: SurfaceKey;
    onChange: (surface: SurfaceKey) => void;
}) {
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {SURFACE_OPTIONS.map((surface) => (
                <button
                    key={surface.key}
                    type="button"
                    onClick={() => onChange(surface.key)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        value === surface.key
                            ? "border-alloy-juniper/35 bg-alloy-juniper/8"
                            : "border-alloy-stone/25 bg-white hover:border-alloy-stone/40"
                    }`}
                >
                    <p className="text-sm font-semibold text-alloy-midnight">{surface.label}</p>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{surface.description}</p>
                </button>
            ))}
        </div>
    );
}

export function visualizationLabelById(
    visualizations: MetricVisualizationRow[],
    id: string
): string | undefined {
    return visualizations.find((v) => v.id === id)?.label;
}
