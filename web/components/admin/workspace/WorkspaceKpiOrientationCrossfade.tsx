"use client";

import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";

const PLACEHOLDER_CELLS = 5;

/** Same cell geometry as live KPI strip — reserved from first paint; crossfades to values when `placeholderPending` clears. */
function KpiOrientationPlaceholderStrip() {
    return (
        <div className="adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact" aria-hidden>
            <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation" role="presentation">
                {Array.from({ length: PLACEHOLDER_CELLS }, (_, i) => (
                    <div
                        key={i}
                        className={[
                            "adminv2-ws-kpi-cell",
                            "adminv2-ws-kpi-cell--orientation",
                            "adminv2-ws-kpi-cell--placeholder",
                            i >= 3 ? "adminv2-ws-kpi-cell--lane-ai" : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        <span className="adminv2-ws-kpi-label">
                            <span className="adminv2-shimmer-bar inline-block h-2 w-[3.25rem] max-w-[92%] rounded bg-alloy-stone/22" />
                        </span>
                        <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">
                            <span className="adminv2-shimmer-bar inline-block h-[1.05rem] w-10 max-w-[90%] rounded bg-alloy-stone/28" />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function WorkspaceKpiOrientationCrossfade({
    kpis,
    placeholderPending,
    maxVisible = 5,
}: {
    kpis: KPIVm[];
    placeholderPending: boolean;
    maxVisible?: number;
}) {
    return (
        <div
            className="adminv2-ws-kpi-orient-crossfade"
            data-workspace-zone="kpi-banner"
            role="group"
            aria-label={placeholderPending ? "Loading key metrics" : "Key metrics"}
        >
            <div
                className="adminv2-ws-kpi-orient-crossfade-layer adminv2-ws-kpi-orient-crossfade-layer--ph"
                data-active={placeholderPending ? "true" : "false"}
            >
                <KpiOrientationPlaceholderStrip />
            </div>
            <div
                className="adminv2-ws-kpi-orient-crossfade-layer adminv2-ws-kpi-orient-crossfade-layer--data"
                data-active={placeholderPending ? "false" : "true"}
            >
                <KPIBlock kpis={kpis} maxVisible={maxVisible} />
            </div>
        </div>
    );
}
