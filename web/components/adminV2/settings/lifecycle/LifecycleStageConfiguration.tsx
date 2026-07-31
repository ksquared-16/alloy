"use client";

import { useRef } from "react";
import StageEditorV2, {
    type StageEditorV2Handle,
} from "@/components/adminV2/settings/lifecycle/StageEditorV2";
import type { LifecycleStageSaveUiState } from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { ReactNode } from "react";

export type { StageEditorV2Handle as LifecycleStageConfigurationHandle };

export default function LifecycleStageConfiguration({
    departmentId,
    businessProcessKey,
    stageKey,
    stageLabel,
    lifecycleName: _lifecycleName,
    stageRecord,
    allStages,
    processTracks,
    process,
    bootstrap,
    bootstrapLoading,
    statusesError,
    validationSlot: _validationSlot,
    saveState,
    saveError,
    onSaveStage,
    onDirtyChange,
    onDeleteStage,
    workspaceHandleRef,
    onValidateConfiguration,
    onPublishConfiguration,
    onReloadConfiguration,
    publicationBusy,
    publicationNotice,
}: {
    departmentId: string;
    businessProcessKey: string;
    stageKey: string;
    stageLabel: string;
    lifecycleName: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    allStages?: LifecycleBuilderStageRecord[];
    processTracks?: ProcessTracksV1 | null;
    process?: LifecycleBuilderProcessRecord | null;
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    statusesError: string | null;
    validationSlot?: ReactNode;
    readyCheckRefreshKey?: string;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    onSaveStage: () => void | Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
    onDeleteStage?: () => void;
    workspaceHandleRef?: React.RefObject<StageEditorV2Handle | null>;
    onValidateConfiguration?: () => void | Promise<void>;
    onPublishConfiguration?: () => void | Promise<void>;
    onReloadConfiguration?: () => void | Promise<void>;
    publicationBusy?: boolean;
    publicationNotice?: string | null;
}) {
    const localRef = useRef<StageEditorV2Handle | null>(null);
    const ref = workspaceHandleRef ?? localRef;

    return (
        <div data-testid="lifecycle-stage-configuration" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <StageEditorV2
                workspaceRef={ref}
                departmentId={departmentId}
                businessProcessKey={businessProcessKey}
                stageKey={stageKey}
                stageLabel={stageLabel}
                stageRecord={stageRecord}
                allStages={allStages}
                processTracks={processTracks ?? null}
                process={process ?? null}
                bootstrap={bootstrap}
                bootstrapLoading={bootstrapLoading}
                statusesError={statusesError}
                saveState={saveState}
                saveError={saveError}
                onSaveStage={onSaveStage}
                onDirtyChange={onDirtyChange}
                onDeleteStage={onDeleteStage}
                entityDisplayLabels={bootstrap?.entity_display_labels ?? undefined}
                onValidateConfiguration={onValidateConfiguration}
                onPublishConfiguration={onPublishConfiguration}
                onReloadConfiguration={onReloadConfiguration}
                publicationBusy={publicationBusy}
                publicationNotice={publicationNotice}
            />
        </div>
    );
}
