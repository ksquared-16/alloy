/**
 * Presentation Runtime V2 — WS.PROCESS_TILE_WORK_VIEWS: the ONE Workspace render site for
 * the configured Work View rows inside a process tile.
 *
 * These rows ARE the launchpad — each one is "open this work," not a dashboard line. The
 * list is whatever `work_views_v1` configured for the process (no hardcoded view names, no
 * process-specific branches). A row leads with its configured label and its operational
 * signal (attention needing action, ember); the raw count is kept but secondary. Rows with
 * an href are real links (the tile is NOT clickable — only these rows and Open → respond);
 * a label-less/href-less view is a config edge case and renders as plain text.
 */

import Link from "next/link";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

function hasAttention(view: WorkViewLinkModel): boolean {
    return typeof view.attentionCount === "number" && view.attentionCount > 0;
}

function rowAriaLabel(view: WorkViewLinkModel): string {
    const parts = [`Open ${view.label}`];
    if (typeof view.count === "number") parts.push(`${view.count} in view`);
    if (hasAttention(view)) parts.push(`${view.attentionCount} need attention`);
    return parts.join(", ");
}

function WorkViewRowBody({ view }: { view: WorkViewLinkModel }) {
    return (
        <>
            <span className="min-w-0 flex-1 truncate">{view.label}</span>
            <span className="flex shrink-0 items-center gap-2">
                {hasAttention(view) ? (
                    <span
                        className="inline-flex items-center gap-1 rounded-full bg-alloy-ember/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-alloy-ember"
                        title={`${view.attentionCount} need attention`}
                    >
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-alloy-ember" />
                        {view.attentionCount!.toLocaleString()}
                    </span>
                ) : null}
                {/* Count stays visible but secondary — it supports the decision, it is not the headline. */}
                {view.count != null ? (
                    <span className="min-w-[1.25rem] text-right text-[11px] font-semibold tabular-nums text-alloy-midnight/45">
                        {view.count.toLocaleString()}
                    </span>
                ) : null}
                <span
                    aria-hidden
                    className="text-alloy-juniper opacity-0 transition-opacity group-hover/row:opacity-100"
                >
                    →
                </span>
            </span>
        </>
    );
}

const ROW_BODY_CLASS =
    "group/row flex items-center gap-2 rounded-md px-2 py-[7px] text-xs font-semibold text-alloy-midnight/80";

export function WorkViewList({ workViews }: { workViews: WorkViewLinkModel[] }) {
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
                            className={`${ROW_BODY_CLASS} no-underline transition-colors hover:bg-alloy-juniper/[0.07] hover:text-alloy-juniper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-juniper`}
                        >
                            <WorkViewRowBody view={view} />
                        </Link>
                    ) : (
                        <div className={ROW_BODY_CLASS}>
                            <WorkViewRowBody view={view} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}
