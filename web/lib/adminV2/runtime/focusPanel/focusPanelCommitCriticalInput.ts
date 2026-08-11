import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { SubjectIdentityTruth } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/** Commit-critical (provisioning answer) input — used until the drawer VM settles. */
export type FocusPanelCommitCriticalInput = {
    subjectId: string;
    statusKey: string | null;
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    publishedStageInputs: PublishedStageInputsForCurrentWork | null;
    situation: { stageKey: string; stageLabel: string; purpose: string | null } | null;
    primaryAction: { actionRef: string; label: string } | null;
    /**
     * Set when the answer resolved that this subject has NO configured action. Distinct from
     * `primaryAction: null` alone, which cannot tell "nothing is configured" from "not resolved yet".
     */
    actionAbsence: { code: string; message: string } | null;
    subjectIdentityTruth: SubjectIdentityTruth | null;
    /** R2 — the subject grain resolved by the answer. Forwarded to the builder; never derived here. */
    subjectGrain: { grain: OperationalGrain; subjectType: OperationalSubjectType } | null;
};
