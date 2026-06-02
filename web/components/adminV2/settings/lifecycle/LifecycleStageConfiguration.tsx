"use client";

import { type ReactNode } from "react";
import LifecycleStageGuidedBoard from "@/components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";

export default function LifecycleStageConfiguration({
    departmentId,
    stageKey,
    bootstrap,
    bootstrapLoading,
    statusesPayload,
    statusesSaving,
    draftStatusKeys,
    savedStatusKeys,
    statusesError,
    onToggleStatus,
    onSaveStatuses,
    canSaveStatuses,
    pipeline,
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
    draftStatusKeys: Set<string>;
    savedStatusKeys: Set<string>;
    statusesError: string | null;
    onToggleStatus: (statusKey: string, selected: boolean) => void;
    onSaveStatuses: () => void | Promise<void>;
    canSaveStatuses: boolean;
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
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
                draftStatusKeys={draftStatusKeys}
                savedStatusKeys={savedStatusKeys}
                statusesError={statusesError}
                onToggleStatus={onToggleStatus}
                onSaveStatuses={onSaveStatuses}
                canSaveStatuses={canSaveStatuses}
                pipeline={pipeline}
                onPipelineUpdated={onPipelineUpdated}
                statusDisplayLabels={statusDisplayLabels}
                validationSlot={validationSlot}
            />
        </div>
    );
}
