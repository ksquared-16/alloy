"use client";

import {
    BUSINESS_PROCESS_WORK_VIEW_ADD,
    BUSINESS_PROCESS_WORK_VIEW_COMPAT_NOTE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { useWorkViewsConfiguration } from "@/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext";

export default function BusinessProcessWorkViewsListColumn() {
    const {
        drafts,
        selectedId,
        setSelectedId,
        loading,
        addWorkView,
        compatibilitySeed,
    } = useWorkViewsConfiguration();

    if (loading) {
        return <p className="text-sm text-alloy-midnight/50">Loading…</p>;
    }

    return (
        <div className="space-y-3" data-testid="business-process-work-views-list-column">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h4 className="text-sm font-semibold text-alloy-midnight">Work Views</h4>
                    <p className="text-[11px] text-alloy-midnight/50">{drafts.length} configured</p>
                </div>
                <button
                    type="button"
                    onClick={addWorkView}
                    className="rounded-lg bg-alloy-pine px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-pine/90"
                    data-testid="business-process-add-work-view"
                >
                    + {BUSINESS_PROCESS_WORK_VIEW_ADD}
                </button>
            </div>

            {compatibilitySeed ?
                <p className="text-[10px] leading-snug text-alloy-midnight/50">{BUSINESS_PROCESS_WORK_VIEW_COMPAT_NOTE}</p>
            :   null}

            <div className="space-y-2">
                {drafts.map((view) => {
                    const active = view.id === selectedId;
                    return (
                        <button
                            key={view.id}
                            type="button"
                            onClick={() => setSelectedId(view.id)}
                            className={`process-config-work-view-list-card ${active ? "process-config-work-view-list-card--active" : ""}`}
                            data-testid={`business-process-work-view-list-${view.id}`}
                        >
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 text-alloy-pine/80" aria-hidden>
                                    ⠿
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-alloy-midnight">{view.label}</p>
                                    {view.mission ?
                                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/55">
                                            {view.mission}
                                        </p>
                                    :   null}
                                </div>
                                <span className="shrink-0 rounded-full bg-alloy-stone/20 px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/60">
                                    {view.display_order ?? 1}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
