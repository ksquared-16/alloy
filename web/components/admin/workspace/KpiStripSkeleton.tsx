"use client";

import { ADMINV2_KPI_STRIP_CELL_COUNT } from "@/lib/ui-v2/adminV2LoadingGeometry";

/**
 * Deferred KPI placements — same row geometry as the live orientation strip (`premium-loading` cells).
 */
export function KpiStripSkeleton({
    id = "kpi-strip-skeleton",
    cellCount = ADMINV2_KPI_STRIP_CELL_COUNT,
}: {
    id?: string;
    /** Match resolved placement row count when known to avoid strip width jump. */
    cellCount?: number;
}) {
    const cells = Math.max(1, Math.min(cellCount, 8));
    return (
        <div
            id={id}
            className="adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact"
            aria-busy="true"
            aria-label="Loading key metrics"
        >
            <div
                className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation adminv2-ws-kpi-strip--premium-loading"
                role="presentation"
            >
                {Array.from({ length: cells }, (_, i) => (
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
