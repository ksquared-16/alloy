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
                <span className="shrink-0 rounded-full bg-alloy-stone/12 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-alloy-midnight/70">
                    {view.count.toLocaleString()}
                </span>
            ) : null}
        </>
    );
}

export function WorkViewList({ workViews }: { workViews: WorkViewLinkModel[] }) {
    if (!workViews.length) return null;
    return (
        <ul
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workViewList)}
            className="flex flex-col gap-0.5"
            aria-label="Work views"
        >
            {workViews.map((view) => (
                <li key={view.id} data-work-view-id={view.id}>
                    {view.href ? (
                        <Link
                            href={view.href}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs font-medium text-alloy-midnight/70 transition-colors hover:bg-alloy-juniper/8 hover:text-alloy-juniper"
                        >
                            <WorkViewRowBody view={view} />
                        </Link>
                    ) : (
                        <div className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs font-medium text-alloy-midnight/70">
                            <WorkViewRowBody view={view} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}
