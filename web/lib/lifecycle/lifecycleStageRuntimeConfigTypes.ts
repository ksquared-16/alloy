import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

/** Canonical snapshot returned by saveLifecycleStageRuntimeConfig — single source for validation. */
export type LifecycleStageRuntimeConfigSnapshot = {
    stageKey: string;
    selectedStatusKeys: string[];
    workUnitId: string | null;
    workUnitKey: string;
    workUnitName: string | null;
    queueFilterKeys: string[];
    metadataStatusKeys: string[];
    synced: boolean;
    statusStagesPayload: EnrollmentStatusStagesPayload;
    /** Internal — queue_definition on the work unit row (API strips before JSON). */
    queueDefinitionRaw?: unknown;
};

export type LifecycleStageSetupDebugTrace = {
    stageKey: string;
    selectedStatusKeysFromUi: string[];
    savedStatusKeysFromApi: string[];
    statusKeysPassedToWorkUnitSave: string[];
    queueDefinitionFilterKeys: string[];
    metadataStatusKeys: string[];
    validationExpectedKeys: string[];
    validationActualKeys: string[];
};

export const LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH =
    "/api/admin/enrollment-process/stage-runtime-config" as const;
