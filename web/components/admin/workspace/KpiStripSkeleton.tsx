"use client";

/** Non-numeric placeholder for deferred KPI placements (Phase 3 — avoids flicker vs baseline). */
export function KpiStripSkeleton({ id = "kpi-strip-skeleton" }: { id?: string }) {
    return (
        <div
            id={id}
            className="adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact"
            aria-busy="true"
            aria-label="Loading key metrics"
        >
            <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation flex flex-wrap gap-4" role="presentation">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex min-w-[4.5rem] flex-col gap-1.5">
                        <div className="h-2.5 w-14 animate-pulse rounded bg-alloy-stone/20" />
                        <div className="h-5 w-10 animate-pulse rounded bg-alloy-stone/25" />
                    </div>
                ))}
            </div>
        </div>
    );
}
