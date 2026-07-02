"use client";

import WorkViewProcessEditorCard from "@/components/adminV2/settings/businessProcess/WorkViewProcessEditorCard";
import { useWorkViewsConfiguration } from "@/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext";
import { validateWorkViewGrainConsistency } from "@/lib/lifecycle/stageGrainV1";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";

export default function BusinessProcessWorkViewsSetupWorkspace({
    workUnitKey,
    stageGrains = [],
    queueLanes = [],
}: {
    workUnitKey: string | null;
    stageGrains?: (StageGrain | undefined)[];
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

    const isMixedGrain = !validateWorkViewGrainConsistency(stageGrains).valid;

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
                Work Views define how operators consume process work. They choose which stages/work to include, how to group and sort them, and which surfaces present the rows.
            </p>
            {error ?
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <div className="flex flex-wrap items-center justify-end gap-2 process-config-workspace-toolbar">
                {isMixedGrain ?
                    <span className="text-xs font-medium text-red-700" data-testid="work-views-mixed-grain-block">
                        Mixed row types — resolve before saving
                    </span>
                :   null}
                {dirty && !isMixedGrain ?
                    <span className="text-xs font-medium text-amber-800">Unsaved changes</span>
                :   null}
                {savedFlash ?
                    <span className="text-xs font-medium text-alloy-pine">Saved</span>
                :   null}
                <button
                    type="button"
                    disabled={!dirty || saving || isMixedGrain}
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
                    workUnitKey={workUnitKey}
                    layouts={layouts}
                    stageGrains={stageGrains}
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
