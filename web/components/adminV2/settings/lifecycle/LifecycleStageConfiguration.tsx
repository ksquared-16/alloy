"use client";

import { type ReactNode } from "react";
import LifecycleStageGuidedBoard from "@/components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import type { LifecycleStatusesSaveState } from "@/lib/lifecycle/lifecycleStatusesCardState";

export default function LifecycleStageConfiguration({
    departmentId,
    stageKey,
    bootstrap,
    bootstrapLoading,
    statusesPayload,
    statusesSaving,
    statusesSaveState,
    savedStatusKeys,
    statusesError,
    onToggleStatus,
    onSaveStatuses,
    canSaveStatuses,
    statusesSaveDisabledReason,
    pipeline,
    workUnitIdentityState,
    workUnitNeedsSync,
    onPipelineUpdated,
    statusDisplayLabels,
    validationSlot,
}: {
    departmentId: string;
    stageKey: string;
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    statusesPayload: EnrollmentStatusStagesPayload | null;
    statusesSaving: boolean;
    statusesSaveState: LifecycleStatusesSaveState;
    savedStatusKeys: readonly string[];
    statusesError: string | null;
    onToggleStatus: (statusKey: string, selected: boolean) => void;
    onSaveStatuses: () => void | Promise<void>;
    canSaveStatuses: boolean;
    statusesSaveDisabledReason: string | null;
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
    workUnitIdentityState: "not_created" | "synced" | "needs_sync" | "conflict";
    workUnitNeedsSync: boolean;
    onPipelineUpdated: (snapshot: EnrollmentPipelineWorkUnitSnapshot | null) => void | Promise<void>;
    statusDisplayLabels: string[];
    validationSlot: ReactNode;
}) {
    return (
        <div data-testid="lifecycle-stage-configuration">
            <LifecycleStageGuidedBoard
                departmentId={departmentId}
                stageKey={stageKey}
                bootstrap={bootstrap}
                bootstrapLoading={bootstrapLoading}
                statusesPayload={statusesPayload}
                statusesSaving={statusesSaving}
                statusesSaveState={statusesSaveState}
                savedStatusKeys={savedStatusKeys}
                statusesError={statusesError}
                onToggleStatus={onToggleStatus}
                onSaveStatuses={onSaveStatuses}
                canSaveStatuses={canSaveStatuses}
                statusesSaveDisabledReason={statusesSaveDisabledReason}
                pipeline={pipeline}
                workUnitIdentityState={workUnitIdentityState}
                workUnitNeedsSync={workUnitNeedsSync}
                onPipelineUpdated={onPipelineUpdated}
                statusDisplayLabels={statusDisplayLabels}
                validationSlot={validationSlot}
            />
        </div>
    );
}
