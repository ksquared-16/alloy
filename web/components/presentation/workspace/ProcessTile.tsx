"use client";

/**
 * Presentation Runtime V2 — WS.PROCESS_TILE: the collapsed state of a process.
 *
 * Clicking the tile expands the process — soft nav to `/workspace/work-unit/<slug>`
 * (the only navigation on the Workspace surface). Per the navigation contract, loading
 * belongs to the destination: no local spinner, just intent-warm the slug route on
 * pointer intent so the destination paints warm.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ProcessTileModel } from "@/lib/presentation/runtime";
import {
    parseOperatorWorkUnitEntryHref,
    warmWorkUnitSlugRoute,
} from "@/lib/admin/operatorWorkUnitEntryWarm";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { WorkViewList } from "./WorkViewList";

/** Counts render "—" when the rollup has not resolved (null), never a fake zero. */
function formatCount(count: number | null): string {
    if (count == null || !Number.isFinite(count)) return "—";
    return count.toLocaleString();
}

const TILE_METRIC_PREVIEW_CAP = 3;

export function ProcessTile({ process }: { process: ProcessTileModel }) {
    const router = useRouter();
    const slug = useMemo(
        () => parseOperatorWorkUnitEntryHref(process.entryHref).workUnitSlug,
        [process.entryHref],
    );

    const warm = () => {
        if (slug) void warmWorkUnitSlugRoute(slug, "workspace_tile");
    };

    const hasAttention = process.needsAttentionCount != null && process.needsAttentionCount > 0;
    const metrics = process.performanceMetrics.slice(0, TILE_METRIC_PREVIEW_CAP);

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTile)}
            data-process-id={process.id}
            role="link"
            tabIndex={0}
            aria-label={`Open ${process.label}`}
            onPointerEnter={warm}
            onPointerDown={warm}
            onClick={() => router.push(process.entryHref)}
            onKeyDown={(e) => {
                if (e.key === "Enter") router.push(process.entryHref);
            }}
            className="group flex h-full cursor-pointer flex-col gap-2.5 rounded-lg border border-alloy-stone/18 bg-white px-4 py-3.5 transition-colors hover:border-alloy-juniper/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-alloy-juniper/60"
        >
            <div>
                <h3 className="text-[15px] font-semibold leading-snug text-alloy-midnight group-hover:text-alloy-juniper">
                    {process.label}
                </h3>
                {process.description ? (
                    <p className="mt-0.5 text-xs leading-snug text-alloy-midnight/55">
                        {process.description}
                    </p>
                ) : null}
            </div>

            <div className="flex gap-5">
                <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-stone">
                        Active
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-alloy-midnight">
                        {formatCount(process.activeRecordCount)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-stone">
                        Attention
                    </div>
                    <div
                        className={`text-sm font-semibold tabular-nums ${hasAttention ? "text-alloy-ember" : "text-alloy-midnight"}`}
                    >
                        {formatCount(process.needsAttentionCount)}
                    </div>
                </div>
            </div>

            {metrics.length ? (
                <ul className="space-y-1 border-t border-alloy-stone/18 pt-2">
                    {metrics.map((metric) => (
                        <li
                            key={metric.label}
                            className="flex items-baseline justify-between gap-2 text-xs"
                        >
                            <span className="min-w-0 truncate font-medium text-alloy-midnight/55">
                                {metric.label}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-alloy-midnight">
                                {metric.value}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {process.workViews.length ? (
                <div className="mt-auto border-t border-alloy-stone/18 pt-2">
                    <WorkViewList workViews={process.workViews} />
                </div>
            ) : null}
        </div>
    );
}
