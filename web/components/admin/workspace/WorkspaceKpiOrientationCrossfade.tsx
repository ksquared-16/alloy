"use client";

import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";

const PLACEHOLDER_CELLS = 5;

/**
 * Loading strip uses the same orientation flex geometry as `KPIBlock`; cells are styled via
 * `.adminv2-ws-kpi-strip--premium-loading` (muted surfaces, gentle pulse — no dashed debug chrome).
 */
function KpiOrientationPlaceholderStrip() {
    return (
        <div className="adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact" aria-hidden>
            <div
                className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation adminv2-ws-kpi-strip--premium-loading"
                role="presentation"
            >
                {Array.from({ length: PLACEHOLDER_CELLS }, (_, i) => (
                    <div
                        key={i}
                        className={[
                            "adminv2-ws-kpi-cell",
                            "adminv2-ws-kpi-cell--orientation",
                            "adminv2-ws-kpi-orient-loading-cell",
                            i >= 3 ? "adminv2-ws-kpi-orient-loading-cell--ai" : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        <span className="adminv2-ws-kpi-label adminv2-ws-kpi-orient-loading-label">
                            <span className="adminv2-ws-kpi-orient-loading-bar adminv2-ws-kpi-orient-loading-bar--label" />
                        </span>
                        <span className="adminv2-ws-kpi-value">
                            <span className="adminv2-ws-kpi-orient-loading-bar adminv2-ws-kpi-orient-loading-bar--value" />
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
