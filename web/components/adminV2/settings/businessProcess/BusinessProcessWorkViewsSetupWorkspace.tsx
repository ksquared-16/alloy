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
            {error ?
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <div className="flex flex-wrap items-center justify-end gap-2">
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
                    className="rounded-lg border border-alloy-pine/30 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-pine disabled:opacity-50"
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
