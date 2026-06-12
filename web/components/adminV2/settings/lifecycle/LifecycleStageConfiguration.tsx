"use client";

import { type ReactNode, useRef } from "react";
import LifecycleStageWorkspace, {
    type LifecycleStageSaveUiState,
    type LifecycleStageWorkspaceHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import type { StatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";

export default function LifecycleStageConfiguration({
    departmentId,
    stageKey,
    stageLabel,
    lifecycleName,
    bootstrap,
    bootstrapLoading,
    statusesError,
    onStatusRollupChange,
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
    statusesError: string | null;
    onStatusRollupChange: (rollup: StatusRollupV1, flatKeys: string[]) => void;
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
                statusesError={statusesError}
                onStatusRollupChange={onStatusRollupChange}
                validationSlot={validationSlot}
                readyCheckRefreshKey={readyCheckRefreshKey}
                saveState={saveState}
                saveError={saveError}
                onSaveStage={onSaveStage}
                onDirtyChange={onDirtyChange}
                entityDisplayLabels={bootstrap?.entity_display_labels ?? undefined}
            />
        </div>
    );
}
