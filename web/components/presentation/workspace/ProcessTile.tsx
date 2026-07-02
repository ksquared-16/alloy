"use client";

/**
 * Presentation Runtime V2 — WS.PROCESS_TILE: a process's operational launchpad.
 *
 * The tile answers "where should I work?" — not "how many records exist?". It leads with the
 * process's meaningful operational STATE (what needs attention), makes the configured Work
 * Views the body (each row is "open this work"), and keeps counts visible but secondary.
 *
 * The tile itself is NOT interactive: only the Work View rows and the Open → control respond
 * to the pointer (no whole-card hover, no whole-card click). Open → soft-navigates to the
 * process entry; per the navigation contract loading belongs to the destination, so there is
 * no local spinner — the slug route is warmed on pointer intent instead.
 */

import { useMemo } from "react";
import Link from "next/link";
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

export function ProcessTile({ process }: { process: ProcessTileModel }) {
    const slug = useMemo(
        () => parseOperatorWorkUnitEntryHref(process.entryHref).workUnitSlug,
        [process.entryHref],
    );
    const warm = () => {
        if (slug) void warmWorkUnitSlugRoute(slug, "workspace_tile");
    };

    const attention = process.needsAttentionCount;
    const hasAttention = attention != null && attention > 0;

    return (
        <article
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTile)}
            data-alloy-section="WS.PROCESS_TILE"
            data-process-id={process.id}
            className="flex h-full min-h-[10rem] flex-col overflow-hidden rounded-xl border border-alloy-juniper/20 border-l-[4px] border-l-alloy-juniper/70 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)]"
        >
            <div className="flex flex-1 flex-col px-4 pb-3 pt-3.5">
                {/* Identity — configured process label + description (not a link). */}
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

                {/* Operational state — the headline. Attention forward (ember) when work is
                    waiting, a calm "clear" when the process is up to date; hidden when the
                    rollup didn't resolve (never a fabricated state). */}
                {attention != null ? (
                    <div className="mt-2.5 flex items-center gap-1.5 text-xs">
                        {hasAttention ? (
                            <>
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-alloy-ember" />
                                <span className="font-semibold text-alloy-ember">
                                    {attention.toLocaleString()} need attention
                                </span>
                            </>
                        ) : (
                            <>
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-alloy-juniper/50" />
                                <span className="font-medium text-alloy-midnight/50">
                                    Nothing needs attention
                                </span>
                            </>
                        )}
                    </div>
                ) : null}

                {/* Work Views — the launchpad body. */}
                {process.workViews.length ? (
                    <div className="mt-2.5 border-t border-alloy-midnight/8 pt-2.5">
                        <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/45">
                            Work Views
                        </p>
                        <WorkViewList workViews={process.workViews} />
                    </div>
                ) : null}

                {/* Footer — secondary count + the Open control (one of the two interactive
                    elements; the tile body itself never navigates). */}
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-alloy-midnight/8 pt-2.5">
                    {process.activeRecordCount != null ? (
                        <span className="text-[11px] text-alloy-midnight/45">
                            <span className="font-semibold tabular-nums text-alloy-midnight/60">
                                {process.activeRecordCount.toLocaleString()}
                            </span>{" "}
                            active
                        </span>
                    ) : (
                        <span aria-hidden />
                    )}
                    <Link
                        href={process.entryHref}
                        aria-label={`Open ${process.label}`}
                        onPointerEnter={warm}
                        onPointerDown={warm}
                        onFocus={warm}
                        className="shrink-0 rounded-md border border-alloy-juniper/35 bg-alloy-juniper/10 px-2.5 py-1.5 text-xs font-bold tracking-wide text-alloy-juniper no-underline transition-colors hover:border-alloy-juniper hover:bg-alloy-juniper hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper"
                    >
                        Open →
                    </Link>
                </div>
            </div>
        </article>
    );
}
