"use client";

import WorkViewProcessEditorCard from "@/components/adminV2/settings/businessProcess/WorkViewProcessEditorCard";
import { useWorkViewsConfiguration } from "@/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext";
import { resolveWorkViewStageGrains, validateWorkViewGrainConsistency } from "@/lib/lifecycle/stageGrainV1";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";

export default function BusinessProcessWorkViewsSetupWorkspace({
    workUnitKey,
    stageGrains = [],
    stageGrainByKey,
    queueLanes = [],
    onDraftSaved,
}: {
    workUnitKey: string | null;
    stageGrains?: (StageGrain | undefined)[];
    /** stage key → grain. When provided, mixed-grain is evaluated per-view (its filtered stages), not process-wide. */
    stageGrainByKey?: Record<string, StageGrain | undefined>;
    queueLanes?: import("@/lib/lifecycle/workViewsRuntimeConvergence").WorkViewCompatQueueLane[];
    /** Called after a successful draft save so the process Apply bar can refresh. */
    onDraftSaved?: () => void | Promise<void>;
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

    // Mixed-grain is evaluated for the SELECTED view against the stages it filters to (not the whole
    // process) — a single-grain view must not be blocked because the process also has other-grain stages.
    const grainsForSelected = stageGrainByKey
        ? resolveWorkViewStageGrains(selected?.filters_v1, stageGrainByKey)
        : stageGrains;
    const isMixedGrain = !validateWorkViewGrainConsistency(grainsForSelected).valid;

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
                {" "}
                <span className="font-medium text-alloy-midnight/60">
                    Save only stores a draft. Labels and filters go live after{" "}
                    <span className="text-alloy-pine">Apply changes</span> in the bar above this page.
                </span>
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
                    <span className="text-xs font-medium text-alloy-pine" data-testid="work-views-saved-draft-flash">
                        Saved to draft · Apply changes to go live
                    </span>
                :   null}
                <button
                    type="button"
                    disabled={!dirty || saving || isMixedGrain}
                    onClick={() => {
                        void (async () => {
                            const ok = await save();
                            if (ok) await onDraftSaved?.();
                        })();
                    }}
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
                    stageGrainByKey={stageGrainByKey}
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
