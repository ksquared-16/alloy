"use client";

import {
    BUSINESS_PROCESS_WORK_VIEW_ADD,
    BUSINESS_PROCESS_WORK_VIEW_UNSAVED_HINT,
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
                    <h4 className="config-typo-queue-section-label">Work Views</h4>
                    <p className="config-typo-sublabel">{drafts.length} configured</p>
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
                <p className="config-typo-sublabel">{BUSINESS_PROCESS_WORK_VIEW_UNSAVED_HINT}</p>
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
                            <p className="config-typo-queue-item-title truncate leading-snug">
                                {view.label.trim() || "Untitled work view"}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
