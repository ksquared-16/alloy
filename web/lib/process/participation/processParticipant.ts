/**
 * ProcessParticipant — a process_instances row projected together with its context + subject into
 * the flat, presentation-safe shape the runtime reads. Grain-neutral and process-neutral: it holds
 * both the participant stage and the context stage; the CONTRACT decides how they coalesce. This is
 * the canonical read model's pure core (no I/O) — counts, Work Views, and the Focus Panel all
 * derive from it so they cannot disagree.
 *
 * Phase 1 deliverable: the projection + pure derivations + predicates. NO consumer is wired yet.
 */

import type { ProcessParticipationContract } from "./processParticipationContract";

/**
 * The exact columns a loader MUST select to build a ProcessParticipant: the process_instances row
 * plus the joined context (opportunity) and subject (customer_member) fields. Joined fields are
 * optional so the model tolerates pre-backfill data (e.g. `stage_entered_at` before Phase 6).
 */
export type ProcessParticipantSourceRow = {
    // ── process_instances ──
    id: string;
    org_id: string;
    process_key: string;
    subject_type: string;
    subject_id: string;
    context_type: string | null;
    context_id: string | null;
    stage_key: string | null;
    state: string | null;
    close_reason_key: string | null;
    /** process_instances.stage_entered_at — added in Phase 6; null before backfill. */
    stage_entered_at?: string | null;
    created_at?: string | null;
    // ── joined context (Enrollment: opportunities) ──
    context_stage_key?: string | null;
    context_status_key?: string | null;
    context_work_unit_id?: string | null;
    // ── joined subject (Enrollment: customer_members) ──
    subject_is_active?: boolean | null;
};

/** The projected participant — flat, grain-neutral, process-neutral. */
export type ProcessParticipant = {
    /** process_instances.id — the participant's stable id. */
    participantId: string;
    orgId: string;
    processKey: string;
    subjectType: string;
    /** The subject row id (Enrollment: customer_members.id / the child). */
    subjectId: string;
    contextType: string | null;
    /** The context row id (Enrollment: opportunities.id / the household lead). */
    contextId: string | null;
    /** process_instances.stage_key — the authoritative per-participant stage (null = rides context). */
    participantStageKey: string | null;
    /** The context's stage (Enrollment: opportunities.stage_key) — the coalesce fallback source. */
    contextStageKey: string | null;
    /** process_instances.state (Enrollment: waitlisted|enrolling|enrolled|withdrawn|not_enrolling). */
    state: string | null;
    /** process_instances.close_reason_key — non-null ⇒ the instance is closed. */
    closeReasonKey: string | null;
    /** The work unit that owns the context (Enrollment: opportunities.work_unit_id). */
    workUnitId: string | null;
    /** The context status (Enrollment: opportunities.status_key, collapsed open/closed). */
    contextStatusKey: string | null;
    /** The subject's active flag (Enrollment: customer_members.is_active !== false). */
    subjectActive: boolean;
    /** When the participant entered its current stage (null before Phase 6 backfill). */
    stageEnteredAt: string | null;
    createdAt: string | null;
};

function normId(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Project a joined source row into a ProcessParticipant. Pure. */
export function projectProcessParticipant(row: ProcessParticipantSourceRow): ProcessParticipant {
    return {
        participantId: String(row.id),
        orgId: String(row.org_id),
        processKey: String(row.process_key),
        subjectType: String(row.subject_type),
        subjectId: String(row.subject_id),
        contextType: normId(row.context_type),
        contextId: normId(row.context_id),
        participantStageKey: normId(row.stage_key),
        contextStageKey: normId(row.context_stage_key),
        state: normId(row.state),
        closeReasonKey: normId(row.close_reason_key),
        workUnitId: normId(row.context_work_unit_id),
        contextStatusKey: normId(row.context_status_key),
        subjectActive: row.subject_is_active !== false, // undefined/true ⇒ active
        stageEnteredAt: normId(row.stage_entered_at),
        createdAt: normId(row.created_at),
    };
}

export function projectProcessParticipants(rows: readonly ProcessParticipantSourceRow[]): ProcessParticipant[] {
    return rows.map(projectProcessParticipant);
}

/**
 * The effective stage of a participant, governed by the CONTRACT's stage ownership: the participant
 * stage, falling back to the context stage ONLY when the contract declares a `contextStageFallback`.
 * This is the one coalesce rule — `process_instances.stage_key ?? opportunities.stage_key` for
 * Enrollment, and participant-stage-alone for a process with no context inheritance.
 */
export function effectiveStage(
    participant: ProcessParticipant,
    contract: ProcessParticipationContract,
): string | null {
    if (participant.participantStageKey) return participant.participantStageKey;
    return contract.stageOwnership.contextStageFallback ? participant.contextStageKey : null;
}

/** The instance is open (not closed) — no close reason recorded. */
export function isOpenInstance(participant: ProcessParticipant): boolean {
    return participant.closeReasonKey === null;
}

/** True when a participant belongs to the given process (per the contract). */
export function participantMatchesProcess(
    participant: ProcessParticipant,
    contract: ProcessParticipationContract,
): boolean {
    return (
        participant.processKey === contract.processKey &&
        participant.subjectType === contract.subjectType
    );
}

/** Org + optional work-unit scope. NULL/mismatched work unit excluded when a workUnitId is given. */
export function participantInScope(
    participant: ProcessParticipant,
    scope: { orgId: string; workUnitId?: string | null },
): boolean {
    if (participant.orgId !== scope.orgId) return false;
    const wu = scope.workUnitId?.trim() || null;
    if (wu !== null && participant.workUnitId !== wu) return false;
    return true;
}
