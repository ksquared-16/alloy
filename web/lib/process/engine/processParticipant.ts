/**
 * Process Engine — the canonical ProcessParticipant shape + generic primitives.
 *
 * Every process Projection produces this shape; every consumer reads it. The engine holds ONLY
 * subject · context · stage · state (+ a generic scope key and a typed per-process `attributes`
 * bag it never inspects). No grain, no table names, no process constants.
 */

import type { ProcessParticipationContract } from "./processParticipationContract";

/** The canonical participant. `Attr` is a per-process bag the engine passes through untouched. */
export type ProcessParticipant<Attr = Record<string, never>> = {
    /** process_instances.id — the participant's stable id. */
    participantId: string;
    orgId: string;
    processKey: string;
    subjectType: string;
    /** The subject row id (Enrollment: customer_members.id). */
    subjectId: string;
    /** The context row id (Enrollment: opportunities.id). */
    contextId: string | null;
    /** process_instances.stage_key — the authoritative per-participant stage (null = rides context). */
    participantStageKey: string | null;
    /** The context's stage — the coalesce source when the contract inheritsContextStage. */
    contextStageKey: string | null;
    /** process_instances.state — durable per-participant outcome (process-defined vocabulary). */
    state: string | null;
    /** process_instances.close_reason_key — non-null ⇒ the instance is closed. */
    closeReasonKey: string | null;
    /** Generic scope key the projection resolves (Enrollment→work_unit, Compliance→location). */
    scopeId: string | null;
    /** When the participant entered its current stage (null before backfill). */
    stageEnteredAt: string | null;
    /** Process-specific fields (liveness signals, rank, …). The engine never reads this. */
    attributes: Attr;
};

/** The process_instances base columns a projection maps into a participant (engine-owned mapping). */
export type ProcessInstanceBase = {
    id: string;
    org_id: string;
    process_key: string;
    subject_type: string;
    subject_id: string;
    context_id?: string | null;
    stage_key?: string | null;
    state?: string | null;
    close_reason_key?: string | null;
    stage_entered_at?: string | null;
};

function normId(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Build a participant from process_instances base fields + the projection-resolved context stage,
 * scope, and attributes. The engine normalizes the base; the projection supplies everything that
 * requires knowing the process's tables. No table names appear here.
 */
export function buildProcessParticipant<Attr>(
    base: ProcessInstanceBase,
    resolved: { contextStageKey?: string | null; scopeId?: string | null; attributes: Attr },
): ProcessParticipant<Attr> {
    return {
        participantId: String(base.id),
        orgId: String(base.org_id),
        processKey: String(base.process_key),
        subjectType: String(base.subject_type),
        subjectId: String(base.subject_id),
        contextId: normId(base.context_id),
        participantStageKey: normId(base.stage_key),
        contextStageKey: normId(resolved.contextStageKey),
        state: normId(base.state),
        closeReasonKey: normId(base.close_reason_key),
        scopeId: normId(resolved.scopeId),
        stageEnteredAt: normId(base.stage_entered_at),
        attributes: resolved.attributes,
    };
}

/**
 * The participant's effective stage under the CONTRACT's stage ownership: the participant stage,
 * falling back to the context stage ONLY when the contract declares `inheritsContextStage`.
 */
export function effectiveStage(
    participant: ProcessParticipant<unknown>,
    contract: ProcessParticipationContract,
): string | null {
    if (participant.participantStageKey) return participant.participantStageKey;
    return contract.inheritsContextStage ? participant.contextStageKey : null;
}

/** The instance is open (no close reason recorded). */
export function isOpenInstance(participant: ProcessParticipant<unknown>): boolean {
    return participant.closeReasonKey === null;
}

/** True when a participant belongs to a process (process_key + subject_type match the contract). */
export function participantMatchesProcess(
    participant: ProcessParticipant<unknown>,
    contract: ProcessParticipationContract,
): boolean {
    return (
        participant.processKey === contract.processKey &&
        participant.subjectType === contract.subjectType
    );
}

/** Org + optional scope. NULL/mismatched scope excluded when a scopeId is given. */
export function participantInScope(
    participant: ProcessParticipant<unknown>,
    scope: { orgId: string; scopeId?: string | null },
): boolean {
    if (participant.orgId !== scope.orgId) return false;
    const scopeId = scope.scopeId?.trim() || null;
    if (scopeId !== null && participant.scopeId !== scopeId) return false;
    return true;
}

/** True when the participant's state is in a given set (case-insensitive). */
export function participantStateIn(
    participant: ProcessParticipant<unknown>,
    states: ReadonlySet<string>,
): boolean {
    const state = participant.state?.trim().toLowerCase();
    return state != null && states.has(state);
}

/** True when the participant's effective stage equals a given stage key. */
export function participantHasEffectiveStage(
    participant: ProcessParticipant<unknown>,
    contract: ProcessParticipationContract,
    stageKey: string,
): boolean {
    return effectiveStage(participant, contract) === stageKey;
}

/** Count participants matching a predicate within optional org/scope. */
export function countParticipants<Attr>(
    participants: readonly ProcessParticipant<Attr>[],
    predicate: (p: ProcessParticipant<Attr>) => boolean,
    scope?: { orgId: string; scopeId?: string | null },
): number {
    let n = 0;
    for (const p of participants) {
        if ((scope ? participantInScope(p, scope) : true) && predicate(p)) n += 1;
    }
    return n;
}
