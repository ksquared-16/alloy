import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { FocusPanelOperationalProjection } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { SubjectIdentityTruth } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/** Commit-critical (provisioning answer) input — used until the drawer VM settles. */
export type FocusPanelCommitCriticalInput = {
    subjectId: string;
    statusKey: string | null;
    stageWorkRuntime: StageWorkRuntimeProjection | null;
    /**
     * SERVER-SIDE PROJECTION INPUT ONLY — optional, and the browser no longer supplies it.
     *
     * The server chokepoint builds its context from the answer directly and needs this; the browser
     * carries the PROJECTION instead, so every client call site omits it. Kept on the type because
     * the server path still names it, not because anything on the wire does.
     */
    publishedStageInputs?: PublishedStageInputsForCurrentWork | null;
    /** The server's operational projection for this subject, commit frame. */
    operationalProjection?: FocusPanelOperationalProjection | null;
    situation: { stageKey: string; stageLabel: string; purpose: string | null } | null;
    primaryAction: { actionRef: string; label: string } | null;
    /**
     * Set when the answer resolved that this subject has NO configured action. Distinct from
     * `primaryAction: null` alone, which cannot tell "nothing is configured" from "not resolved yet".
     */
    actionAbsence: { code: string; message: string } | null;
    subjectIdentityTruth: SubjectIdentityTruth | null;
    /** Configured lifecycle rail, resolved server-side by the canonical pure builder. */
    businessProcessStages?: ReadonlyArray<{ key: string; label: string; support?: readonly string[] }> | null;
    /** Configured process name ("Enrollment"), not the generic card title. */
    businessProcessName?: string | null;
/**
 * THE AUTHORITATIVE PARTICIPATION, resolved once on the server and carried to the browser.
 *
 * IDENTITY, NOT PERMISSION. It is the member id and the OCM row that names it, and nothing else —
 * no profile, no photo, no health facts, no authorization answer. Every producer that consumes it
 * still resolves its own grants at request time.
 *
 * It exists because the server already knew this and the browser did not. Measured on deployed
 * 41c67ec17: the document's producers ran Attendance (141ms) and Health (470ms) and put their
 * answers in `operationalProjection`, but the browser decides card readiness from its OWN context,
 * which had no participantScope — so those cards stayed reserved and remounted only when the
 * drawer settled, ~3.5s later, to learn what the answer already carried.
 */
    /*
     * OPTIONAL, and that is the safe default rather than a convenience: absent means the answer
     * resolved no participant — zero candidates, or an ambiguous set — and the participant-scoped
     * cards must then reserve exactly as they do today. A required field would force every caller
     * to state something, and the first thing a caller invents when forced is a fallback.
     */
    resolvedParticipant?: { participationId: string; customerMemberId: string } | null;
    /** R2 — the subject grain resolved by the answer. Forwarded to the builder; never derived here. */
    subjectGrain: { grain: OperationalGrain; subjectType: OperationalSubjectType } | null;
};
