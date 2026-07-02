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
            className="group flex h-full min-h-[10rem] cursor-pointer flex-col overflow-hidden rounded-xl border border-alloy-juniper/20 border-l-[4px] border-l-alloy-juniper/70 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)] transition-colors hover:border-alloy-juniper/35 hover:shadow-[0_4px_12px_rgba(0,162,131,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-alloy-juniper/60"
        >
            <div className="flex flex-1 flex-col px-4 pb-3 pt-3.5">
                <div>
                    <h3 className="min-w-0 text-base font-semibold leading-snug text-alloy-midnight">
                        {process.label}
                    </h3>
                    {process.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/62">
                            {process.description}
                        </p>
                    ) : null}
                </div>

                {metrics.length ? (
                    <ul className="mt-2.5 space-y-1.5">
                        {metrics.map((metric) => {
                            const attentionMetric =
                                metric.label.toLowerCase().includes("needs attention") &&
                                metric.value !== "—";
                            return (
                                <li
                                    key={metric.label}
                                    className="flex items-baseline justify-between gap-2 text-xs"
                                >
                                    <span className="min-w-0 truncate font-medium text-alloy-midnight/55">
                                        {metric.label}
                                    </span>
                                    <span
                                        className={`shrink-0 font-semibold tabular-nums ${
                                            attentionMetric ? "text-alloy-ember" : "text-alloy-midnight"
                                        }`}
                                    >
                                        {metric.value}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}

                {process.workViews.length ? (
                    <div className="mt-2.5 space-y-1.5 border-t border-alloy-midnight/8 pt-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/45">
                            Work Views
                        </p>
                        <WorkViewList workViews={process.workViews} />
                    </div>
                ) : null}

                <div className="mt-auto flex items-end justify-between gap-3 border-t border-alloy-midnight/8 pt-2.5">
                    {/* A stat renders only when its rollup resolved (non-null) — missing data
                        is hidden, never presented as a meaningful value. */}
                    <div className="flex gap-4">
                        {process.activeRecordCount != null ? (
                            <div>
                                <div className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    Active
                                </div>
                                <div className="text-[11px] font-semibold tabular-nums text-alloy-midnight/70">
                                    {process.activeRecordCount.toLocaleString()}
                                </div>
                            </div>
                        ) : null}
                        {process.needsAttentionCount != null ? (
                            <div>
                                <div className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    Attention
                                </div>
                                <div
                                    className={`text-[11px] font-semibold tabular-nums ${
                                        hasAttention ? "text-alloy-ember" : "text-alloy-midnight/70"
                                    }`}
                                >
                                    {process.needsAttentionCount.toLocaleString()}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    <span
                        aria-hidden
                        className="shrink-0 rounded-md border border-alloy-juniper/35 bg-alloy-juniper/10 px-2.5 py-1.5 text-xs font-bold tracking-wide text-alloy-juniper transition-colors group-hover:border-alloy-juniper group-hover:bg-alloy-juniper group-hover:text-white"
                    >
                        Open →
                    </span>
                </div>
            </div>
        </div>
    );
}
