/**
 * Presentation Runtime V2 — WS.PROCESS_TILE_WORK_VIEWS: the ONE Workspace render site for
 * the configured Work View rows inside a process tile.
 *
 * These rows ARE the launchpad — each one is "open this work," not a dashboard line. The
 * list is whatever `work_views_v1` configured for the process (no hardcoded view names, no
 * process-specific branches). Each row leads with its configured label, carries ONE
 * secondary operational signal when available (records needing attention, else overdue),
 * and keeps the raw count aligned but secondary. Rows are individually clickable (real
 * links with obvious hover / press feedback) while the tile itself stays inert; a
 * label-less/href-less view is a config edge case and renders as plain, non-interactive text.
 *
 * Pure presenter of `WorkViewLinkModel[]` — a future universal SurfaceRenderer can map the
 * same model to Surface Components without touching this markup (PR #64 drop-in).
 */

import Link from "next/link";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

function positive(n: number | null | undefined): number | null {
    return typeof n === "number" && n > 0 ? n : null;
}

function rowAriaLabel(view: WorkViewLinkModel): string {
    const parts = [`Open ${view.label}`];
    if (typeof view.count === "number") parts.push(`${view.count} in view`);
    const attention = positive(view.attentionCount);
    const overdue = positive(view.overdueCount);
    if (attention) parts.push(`${attention} need attention`);
    else if (overdue) parts.push(`${overdue} overdue`);
    return parts.join(", ");
}

/** ONE secondary signal per row: attention (filled ember) takes priority over overdue (outlined). */
function RowSignal({ view }: { view: WorkViewLinkModel }) {
    const attention = positive(view.attentionCount);
    if (attention) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-full bg-alloy-ember/12 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-alloy-ember"
                title={`${attention} need attention`}
            >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-alloy-ember" />
                {attention.toLocaleString()}
            </span>
        );
    }
    const overdue = positive(view.overdueCount);
    if (overdue) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-full border border-alloy-ember/35 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-alloy-ember/90"
                title={`${overdue} overdue`}
            >
                <span aria-hidden className="text-[9px] leading-none">◷</span>
                {overdue.toLocaleString()}
            </span>
        );
    }
    return null;
}

function WorkViewRowBody({ view, showCounts }: { view: WorkViewLinkModel; showCounts: boolean }) {
    return (
        <>
            <span className="min-w-0 flex-1 truncate">{view.label}</span>
            <RowSignal view={view} />
            {/* Count: readable + right-aligned in a fixed slot so digits line up across rows and
                the layout never jumps when a pending count resolves. Secondary to the signal.
                Hidden when the surface config turns counts off. */}
            {showCounts ? (
                <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-alloy-midnight/55">
                    {view.count != null ? (
                        view.count.toLocaleString()
                    ) : (
                        <span
                            aria-hidden
                            className="ml-auto inline-block h-3 w-4 animate-pulse rounded bg-alloy-midnight/10 align-middle"
                        />
                    )}
                </span>
            ) : null}
            {/* Always faintly present so a row reads as clickable at rest; strengthens + nudges on hover. */}
            <span
                aria-hidden
                className="motion-control w-3 shrink-0 text-right text-alloy-juniper/40 group-hover/row:translate-x-0.5 group-hover/row:text-alloy-juniper"
            >
                →
            </span>
        </>
    );
}

const ROW_BODY_CLASS =
    "group/row flex w-full items-center gap-2 px-2 py-2 text-xs font-semibold text-alloy-midnight/80";

export function WorkViewList({
    workViews,
    showCounts = true,
}: {
    workViews: WorkViewLinkModel[];
    /** Render the per-view count badge (Workspace Process Surface config). */
    showCounts?: boolean;
}) {
    if (!workViews.length) return null;
    return (
        <ul
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTileWorkViews)}
            data-alloy-section="WS.PROCESS_TILE_WORK_VIEWS"
            className="-mx-2 flex flex-col divide-y divide-alloy-midnight/[0.06]"
            aria-label="Work views"
        >
            {workViews.map((view) => (
                <li key={view.id} data-work-view-id={view.id}>
                    {view.href ? (
                        <Link
                            href={view.href}
                            aria-label={rowAriaLabel(view)}
                            className={`${ROW_BODY_CLASS} motion-control no-underline hover:bg-alloy-juniper/[0.1] hover:text-alloy-juniper active:bg-alloy-juniper/[0.18] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-juniper`}
                        >
                            <WorkViewRowBody view={view} showCounts={showCounts} />
                        </Link>
                    ) : (
                        <div className={`${ROW_BODY_CLASS} text-alloy-midnight/55`}>
                            <WorkViewRowBody view={view} showCounts={showCounts} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}
