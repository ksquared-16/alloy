"use client";

/**
 * Work Items queue rail.
 *
 * Three permanent taxonomies (folders, views, sources) stacked as equals made the rail the busiest
 * thing on screen and buried the handful of lenses an operator actually reaches for. The hierarchy
 * now matches how the work is used: MY WORK is the daily driver, FOLDERS is operator organization,
 * and the system taxonomy (sources, completed) collapses under MORE — present, but not competing.
 *
 * Folders and views are kept visually distinct on purpose: a folder is where an operator PUT
 * something, a view is a QUERY over everything. Rendering them as one undifferentiated list is what
 * made the two read as interchangeable.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
    WORK_ITEM_FOLDER_DEFS,
    WORK_ITEM_SOURCE_DEFS,
    WORK_ITEM_VIEW_DEFS,
    WORK_ITEM_PRIMARY_VIEW_KEYS,
    type WorkItemFolderKey,
    type WorkItemQueueScope,
    type WorkItemSourceKey,
    type WorkItemViewKey,
} from "@/lib/workItems/workItemQueueScope";
import type { WorkItemsProcessGroup } from "@/lib/agent/taskAssist/myTasksProcessGroups";

type CounterMap<T extends string> = Partial<Record<T, number>>;

export type FoldersViewsSourcesRailProps = {
    scope: WorkItemQueueScope;
    onScopeChange: (next: WorkItemQueueScope) => void;
    folderCounts: CounterMap<WorkItemFolderKey>;
    viewCounts: CounterMap<WorkItemViewKey>;
    sourceCounts: CounterMap<WorkItemSourceKey>;
    processGroups?: WorkItemsProcessGroup[];
};

function rowClass(active: boolean): string {
    return active ?
            "flex w-full items-center justify-between gap-2 rounded-md bg-alloy-juniper/[0.09] px-2 py-1.5 text-left text-[12px] font-semibold text-alloy-juniper"
        :   "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-alloy-midnight/62 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/85";
}

function countClass(active: boolean): string {
    return `shrink-0 text-[10px] tabular-nums ${active ? "text-alloy-juniper/75" : "text-alloy-midnight/35"}`;
}

function GroupHeading({ children }: { children: string }) {
    return (
        <h3 className="px-2 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-alloy-midnight/35">
            {children}
        </h3>
    );
}

export default function FoldersViewsSourcesRail({
    scope,
    onScopeChange,
    folderCounts,
    viewCounts,
    sourceCounts,
    processGroups,
}: FoldersViewsSourcesRailProps) {
    const secondaryActive =
        scope.source !== "all" || !WORK_ITEM_PRIMARY_VIEW_KEYS.includes(scope.view);
    const [moreOpen, setMoreOpen] = useState(secondaryActive);

    const primaryViews = WORK_ITEM_VIEW_DEFS.filter((d) =>
        WORK_ITEM_PRIMARY_VIEW_KEYS.includes(d.key),
    );
    const secondaryViews = WORK_ITEM_VIEW_DEFS.filter(
        (d) => !WORK_ITEM_PRIMARY_VIEW_KEYS.includes(d.key),
    );

    return (
        <div
            className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-2"
            data-work-items-fvs-rail="true"
        >
            <section data-work-items-fvs-section="views">
                <GroupHeading>My work</GroupHeading>
                <div className="space-y-0.5">
                    {primaryViews.map((def) => {
                        const active = scope.view === def.key;
                        return (
                            <button
                                key={def.key}
                                type="button"
                                data-work-items-view={def.key}
                                className={rowClass(active)}
                                onClick={() => onScopeChange({ ...scope, view: def.key })}
                            >
                                <span className="truncate">{def.label}</span>
                                <span className={countClass(active)}>{viewCounts[def.key] ?? 0}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section data-work-items-fvs-section="folders">
                <GroupHeading>Folders</GroupHeading>
                <div className="space-y-0.5">
                    {WORK_ITEM_FOLDER_DEFS.map((def) => {
                        const active = scope.folder === def.key;
                        return (
                            <button
                                key={def.key}
                                type="button"
                                data-work-items-folder={def.key}
                                className={rowClass(active)}
                                onClick={() => onScopeChange({ ...scope, folder: def.key })}
                            >
                                <span className="truncate">{def.label}</span>
                                <span className={countClass(active)}>{folderCounts[def.key] ?? 0}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section data-work-items-fvs-section="more">
                <button
                    type="button"
                    aria-expanded={moreOpen}
                    data-work-items-rail-more="true"
                    className="flex w-full items-center gap-1 px-2 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-alloy-midnight/35 hover:text-alloy-midnight/60"
                    onClick={() => setMoreOpen((v) => !v)}
                >
                    <ChevronRight
                        className={`h-3 w-3 transition-transform ${moreOpen ? "rotate-90" : ""}`}
                        aria-hidden
                    />
                    More
                </button>

                {moreOpen ? (
                    <div className="space-y-2.5 pt-0.5">
                        <div className="space-y-0.5" data-work-items-fvs-section="secondary-views">
                            {secondaryViews.map((def) => {
                                const active = scope.view === def.key;
                                return (
                                    <button
                                        key={def.key}
                                        type="button"
                                        data-work-items-view={def.key}
                                        className={rowClass(active)}
                                        onClick={() => onScopeChange({ ...scope, view: def.key })}
                                    >
                                        <span className="truncate">{def.label}</span>
                                        <span className={countClass(active)}>
                                            {viewCounts[def.key] ?? 0}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div data-work-items-fvs-section="sources">
                            <GroupHeading>Sources</GroupHeading>
                            <div className="space-y-0.5">
                                {WORK_ITEM_SOURCE_DEFS.filter((d) => d.available).map((def) => {
                                    const active = scope.source === def.key;
                                    return (
                                        <button
                                            key={def.key}
                                            type="button"
                                            data-work-items-source={def.key}
                                            className={rowClass(active)}
                                            onClick={() =>
                                                onScopeChange({
                                                    ...scope,
                                                    source: active ? "all" : def.key,
                                                })
                                            }
                                        >
                                            <span className="truncate">{def.label}</span>
                                            <span className={countClass(active)}>
                                                {sourceCounts[def.key] ?? 0}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {processGroups?.length ? (
                            <div data-work-items-fvs-section="process-groups">
                                <GroupHeading>Process groups</GroupHeading>
                                <ul className="space-y-0.5 px-2">
                                    {processGroups.slice(0, 4).map((group) => (
                                        <li
                                            key={group.key}
                                            className="flex items-center justify-between gap-2 text-[11px] text-alloy-midnight/50"
                                        >
                                            <span className="truncate">{group.label}</span>
                                            <span className="tabular-nums text-alloy-midnight/35">
                                                {group.count}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </section>
        </div>
    );
}
