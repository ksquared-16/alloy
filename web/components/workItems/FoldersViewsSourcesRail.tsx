"use client";

import {
    WORK_ITEM_FOLDER_DEFS,
    WORK_ITEM_SOURCE_DEFS,
    WORK_ITEM_VIEW_DEFS,
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

function sectionButton(active: boolean): string {
    return active ?
            "flex w-full items-center justify-between gap-2 rounded-md bg-alloy-juniper/[0.08] px-2 py-1.5 text-left text-[12px] font-semibold text-alloy-juniper ring-1 ring-alloy-juniper/20"
        :   "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-alloy-midnight/65 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/85";
}

function countBadge(active: boolean): string {
    return active ? "text-alloy-juniper/78" : "text-alloy-midnight/40";
}

export default function FoldersViewsSourcesRail({
    scope,
    onScopeChange,
    folderCounts,
    viewCounts,
    sourceCounts,
    processGroups,
}: FoldersViewsSourcesRailProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2" data-work-items-fvs-rail="true">
            <section data-work-items-fvs-section="folders">
                <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Folders</h3>
                <div className="space-y-0.5">
                    {WORK_ITEM_FOLDER_DEFS.map((def) => {
                        const active = scope.folder === def.key;
                        return (
                            <button
                                key={def.key}
                                type="button"
                                data-work-items-folder={def.key}
                                className={sectionButton(active)}
                                onClick={() => onScopeChange({ ...scope, folder: def.key })}
                            >
                                <span className="truncate">{def.label}</span>
                                <span className={`shrink-0 text-[10px] tabular-nums ${countBadge(active)}`}>
                                    {folderCounts[def.key] ?? 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section data-work-items-fvs-section="views">
                <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Views</h3>
                <div className="space-y-0.5">
                    {WORK_ITEM_VIEW_DEFS.map((def) => {
                        const active = scope.view === def.key;
                        return (
                            <button
                                key={def.key}
                                type="button"
                                data-work-items-view={def.key}
                                className={sectionButton(active)}
                                onClick={() => onScopeChange({ ...scope, view: def.key })}
                            >
                                <span className="truncate">{def.label}</span>
                                <span className={`shrink-0 text-[10px] tabular-nums ${countBadge(active)}`}>
                                    {viewCounts[def.key] ?? 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section data-work-items-fvs-section="sources">
                <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Sources</h3>
                <div className="space-y-0.5">
                    {WORK_ITEM_SOURCE_DEFS.map((def) => {
                        const active = scope.source === def.key;
                        return (
                            <button
                                key={def.key}
                                type="button"
                                disabled={!def.available}
                                title={!def.available ? def.deferredReason : undefined}
                                data-work-items-source={def.key}
                                className={`${sectionButton(active)} disabled:cursor-not-allowed disabled:opacity-45`}
                                onClick={() => {
                                    if (!def.available) return;
                                    onScopeChange({ ...scope, source: def.key });
                                }}
                            >
                                <span className="truncate">{def.label}</span>
                                <span className={`shrink-0 text-[10px] tabular-nums ${countBadge(active)}`}>
                                    {sourceCounts[def.key] ?? 0}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {processGroups?.length ? (
                <section className="mt-1 rounded-lg border border-dashed border-alloy-stone/20 px-2 py-1.5" data-work-items-fvs-section="process-groups">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Process groups</h3>
                    <ul className="mt-1 space-y-0.5">
                        {processGroups.slice(0, 4).map((group) => (
                            <li key={group.key} className="flex items-center justify-between gap-2 text-[10px] text-alloy-midnight/52">
                                <span className="truncate">{group.label}</span>
                                <span className="tabular-nums text-alloy-midnight/40">{group.count}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
