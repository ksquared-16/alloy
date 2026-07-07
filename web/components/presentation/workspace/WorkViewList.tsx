/**
 * Presentation Runtime V2 — WS.PROCESS_TILE_WORK_VIEWS: the ONE Workspace render site for
 * the configured Work View rows inside a process tile.
 *
 * Each row is a scannable launchpad: configured icon → name → optional mission → count →
 * attention/overdue signal → affordance. Pure presenter of `WorkViewLinkModel[]`.
 */

import Link from "next/link";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { ProcessCardGlyph } from "./ProcessCardGlyph";

function positive(n: number | null | undefined): number | null {
    return typeof n === "number" && n > 0 ? n : null;
}

function rowAriaLabel(view: WorkViewLinkModel): string {
    const parts = [`Open ${view.label}`];
    if (view.description) parts.push(view.description);
    if (typeof view.count === "number") parts.push(`${view.count} in view`);
    const attention = positive(view.attentionCount);
    const overdue = positive(view.overdueCount);
    if (attention) parts.push(`${attention} need attention`);
    else if (overdue) parts.push(`${overdue} overdue`);
    return parts.join(", ");
}

/** Configured glyph in a soft neutral well — the row's scan anchor. */
function RowGlyph({ view }: { view: WorkViewLinkModel }) {
    return (
        <span
            aria-hidden
            data-work-view-icon={view.icon ?? "fallback"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloy-midnight/[0.04] text-alloy-midnight/45 group-hover/row:text-alloy-midnight/70"
        >
            <ProcessCardGlyph icon={view.icon ?? "grid"} className="h-[17px] w-[17px]" />
        </span>
    );
}

/** Work View operational signal — attention first, else overdue. Never a stage metric. */
function RowSignal({ view }: { view: WorkViewLinkModel }) {
    const attention = positive(view.attentionCount);
    if (attention) {
        return (
            <span
                className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-alloy-ember px-1.5 text-[10px] font-bold tabular-nums leading-none text-white"
                title={`${attention} need attention`}
                data-work-view-attention
            >
                {attention.toLocaleString()}
            </span>
        );
    }
    const overdue = positive(view.overdueCount);
    if (overdue) {
        return (
            <span
                className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border border-alloy-ember/40 px-1.5 text-[10px] font-bold tabular-nums leading-none text-alloy-ember"
                title={`${overdue} overdue`}
                data-work-view-overdue
            >
                {overdue.toLocaleString()}
            </span>
        );
    }
    return null;
}

function WorkViewRowBody({ view, showCounts }: { view: WorkViewLinkModel; showCounts: boolean }) {
    return (
        <>
            <RowGlyph view={view} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-snug text-alloy-midnight">
                    {view.label}
                </span>
                {view.description ? (
                    <span
                        className="mt-0.5 block line-clamp-1 text-[11px] leading-relaxed text-alloy-midnight/45"
                        data-work-view-description
                    >
                        {view.description}
                    </span>
                ) : null}
            </span>
            <div className="flex shrink-0 items-center gap-2.5">
                <RowSignal view={view} />
                {showCounts ? (
                    <span
                        className="min-w-[1.75rem] text-right text-[15px] font-bold tabular-nums leading-none text-alloy-midnight"
                        data-work-view-count
                    >
                        {view.count != null ? (
                            view.count.toLocaleString()
                        ) : (
                            <span
                                aria-hidden
                                className="ml-auto inline-block h-3.5 w-5 animate-pulse rounded bg-alloy-midnight/10 align-middle"
                            />
                        )}
                    </span>
                ) : null}
                <span
                    aria-hidden
                    className="motion-control w-4 shrink-0 text-center text-[13px] text-alloy-midnight/30 group-hover/row:text-alloy-midnight/55"
                >
                    ›
                </span>
            </div>
        </>
    );
}

const ROW_BODY_CLASS =
    "group/row flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left";

export function WorkViewList({
    workViews,
    showCounts = true,
}: {
    workViews: WorkViewLinkModel[];
    showCounts?: boolean;
}) {
    if (!workViews.length) return null;
    return (
        <ul
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTileWorkViews)}
            data-alloy-section="WS.PROCESS_TILE_WORK_VIEWS"
            className="flex flex-col gap-0.5"
            aria-label="Work views"
        >
            {workViews.map((view) => (
                <li key={view.id} data-work-view-id={view.id}>
                    {view.href ? (
                        <Link
                            href={view.href}
                            aria-label={rowAriaLabel(view)}
                            className={`${ROW_BODY_CLASS} motion-control no-underline hover:bg-alloy-midnight/[0.03] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-midnight/25`}
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
