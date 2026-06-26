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
                    className="config-primary-btn config-primary-btn--sm"
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
                            <p className="truncate text-[13px] font-semibold leading-snug text-alloy-midnight">
                                {view.label.trim() || "Untitled work view"}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
