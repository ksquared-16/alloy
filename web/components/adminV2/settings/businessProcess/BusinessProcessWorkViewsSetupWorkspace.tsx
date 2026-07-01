"use client";

import WorkViewProcessEditorCard from "@/components/adminV2/settings/businessProcess/WorkViewProcessEditorCard";
import { useWorkViewsConfiguration } from "@/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext";

export default function BusinessProcessWorkViewsSetupWorkspace({
    departmentId,
    workUnitId,
    queueLanes = [],
}: {
    departmentId: string;
    workUnitId: string | null;
    queueLanes?: import("@/lib/lifecycle/workViewsRuntimeConvergence").WorkViewCompatQueueLane[];
}) {
    const {
        selected,
        layouts,
        loading,
        saving,
        dirty,
        error,
        savedFlash,
        updateSelected,
        deleteSelected,
        save,
        drafts,
    } = useWorkViewsConfiguration();

    if (loading) {
        return (
            <div className="process-config-setup-card p-8 text-sm text-alloy-midnight/50" data-testid="business-process-work-views-loading">
                Loading Work Views…
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="business-process-work-views-workspace">
            <p className="px-1 text-[11px] text-alloy-midnight/45">
                Work Views define the operational lens — which rows operators see, how they are filtered, sorted, and what surface they use. Row type (grain) is set per stage in Stage → Stage Context. Use separate Work Views for stages with different row types.
            </p>
            {error ?
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <div className="flex flex-wrap items-center justify-end gap-2 process-config-workspace-toolbar">
                {dirty ?
                    <span className="text-xs font-medium text-amber-800">Unsaved changes</span>
                :   null}
                {savedFlash ?
                    <span className="text-xs font-medium text-alloy-pine">Saved</span>
                :   null}
                <button
                    type="button"
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                    className="config-primary-btn config-primary-btn--sm"
                    data-testid="business-process-save-work-views"
                >
                    {saving ? "Saving…" : "Save Work Views"}
                </button>
            </div>

            {selected ?
                <WorkViewProcessEditorCard
                    view={selected}
                    selected
                    departmentId={departmentId}
                    workUnitId={workUnitId}
                    layouts={layouts}
                    queueLanes={queueLanes}
                    onSelect={() => {}}
                    onChange={updateSelected}
                    onDelete={drafts.length > 1 ? deleteSelected : undefined}
                />
            :   <div className="process-config-setup-card p-8 text-center text-sm text-alloy-midnight/50">
                    Select a Work View to configure.
                </div>}
        </div>
    );
}
