"use client";

import { type ReactNode, useRef } from "react";
import LifecycleStageWorkspace, {
    type LifecycleStageSaveUiState,
    type LifecycleStageWorkspaceHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { LifecycleStatusesSaveState } from "@/lib/lifecycle/lifecycleStatusesCardState";
import type { LifecycleStageWorkUnitIdentityUiState } from "@/components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard";

export default function LifecycleStageConfiguration({
    departmentId,
    stageKey,
    stageLabel,
    lifecycleName,
    bootstrap,
    bootstrapLoading,
    statusesPayload,
    statusesSaveState,
    savedStatusKeys,
    statusesError,
    onToggleStatus,
    pipeline,
    workUnitIdentityState,
    workUnitNeedsSync,
    onPipelineUpdated,
    statusDisplayLabels,
    draftStatusLabels,
    enabledActionsCount,
    actionsSection,
    validationSlot,
    readyCheckRefreshKey,
    saveState,
    saveError,
    onSaveStage,
    onDirtyChange,
    workspaceHandleRef,
}: {
    departmentId: string;
    stageKey: string;
    stageLabel: string;
    lifecycleName: string;
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    statusesPayload: EnrollmentStatusStagesPayload | null;
    statusesSaveState: LifecycleStatusesSaveState;
    savedStatusKeys: readonly string[];
    statusesError: string | null;
    onToggleStatus: (statusKey: string, selected: boolean) => void;
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
    workUnitIdentityState: LifecycleStageWorkUnitIdentityUiState;
    workUnitNeedsSync: boolean;
    onPipelineUpdated: (snapshot: EnrollmentPipelineWorkUnitSnapshot | null) => void | Promise<void>;
    statusDisplayLabels: string[];
    draftStatusLabels: string[];
    enabledActionsCount: number;
    actionsSection: ReactNode;
    validationSlot: ReactNode;
    readyCheckRefreshKey?: string;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    onSaveStage: () => void | Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
    workspaceHandleRef?: React.RefObject<LifecycleStageWorkspaceHandle | null>;
}) {
    const localRef = useRef<LifecycleStageWorkspaceHandle | null>(null);
    const ref = workspaceHandleRef ?? localRef;

    return (
        <div data-testid="lifecycle-stage-configuration">
            <LifecycleStageWorkspace
                workspaceRef={ref}
                departmentId={departmentId}
                stageKey={stageKey}
                stageLabel={stageLabel}
                lifecycleName={lifecycleName}
                bootstrap={bootstrap}
                bootstrapLoading={bootstrapLoading}
                statusesPayload={statusesPayload}
                statusesSaveState={statusesSaveState}
                savedStatusKeys={savedStatusKeys}
                statusesError={statusesError}
                onToggleStatus={onToggleStatus}
                pipeline={pipeline}
                workUnitIdentityState={workUnitIdentityState}
                workUnitNeedsSync={workUnitNeedsSync}
                onPipelineUpdated={onPipelineUpdated}
                statusDisplayLabels={statusDisplayLabels}
                draftStatusLabels={draftStatusLabels}
                enabledActionsCount={enabledActionsCount}
                actionsSection={actionsSection}
                validationSlot={validationSlot}
                readyCheckRefreshKey={readyCheckRefreshKey}
                saveState={saveState}
                saveError={saveError}
                onSaveStage={onSaveStage}
                onDirtyChange={onDirtyChange}
            />
        </div>
    );
}
