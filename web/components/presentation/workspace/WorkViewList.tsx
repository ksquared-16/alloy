/**
 * Presentation Runtime V2 — WS.WORK_VIEWS: the ONE Workspace render site for the
 * configured Work View links inside a process tile.
 *
 * The list is whatever `work_views_v1` configured for the process — no hardcoded view
 * names, no process-specific branches. Rows with an href are real links (the tile is
 * itself clickable, so link clicks stop propagation to avoid double navigation); rows
 * without an href render as plain text.
 */

import Link from "next/link";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

function WorkViewRowBody({ view }: { view: WorkViewLinkModel }) {
    return (
        <>
            <span className="min-w-0 truncate">{view.label}</span>
            {view.count != null ? (
                <span className="shrink-0 rounded-full bg-alloy-juniper/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-alloy-juniper">
                    {view.count.toLocaleString()}
                </span>
            ) : null}
        </>
    );
}

const ROW_BODY_CLASS =
    "flex items-center justify-between gap-3 px-1.5 py-1.5 text-xs font-semibold text-alloy-midnight/75";

export function WorkViewList({ workViews }: { workViews: WorkViewLinkModel[] }) {
    if (!workViews.length) return null;
    return (
        <ul
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workViewList)}
            className="flex flex-col divide-y divide-alloy-midnight/[0.06]"
            aria-label="Work views"
        >
            {workViews.map((view) => (
                <li key={view.id} data-work-view-id={view.id}>
                    {view.href ? (
                        <Link
                            href={view.href}
                            onClick={(e) => e.stopPropagation()}
                            className={`${ROW_BODY_CLASS} no-underline transition-colors hover:bg-alloy-juniper/[0.06] hover:text-alloy-juniper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-juniper`}
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
