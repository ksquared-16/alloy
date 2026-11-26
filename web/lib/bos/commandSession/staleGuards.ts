/**
 * Stale-response / latest-input-wins helpers for async parse and preview.
 */

export type BosRequestSeqGate = {
    /** Sequence at the time the async work was started. */
    startedWithSeq: number;
    /** Current session requestSeq after later bumps. */
    currentSeq: number;
};

/** True when this response still matches the latest operator input generation. */
export function isBosRequestSeqCurrent(gate: BosRequestSeqGate): boolean {
    return gate.startedWithSeq === gate.currentSeq;
}

/**
 * Apply an async result only when the session requestSeq has not advanced.
 * Returns the next session from `apply`, or the prior session when stale.
 */
export function applyIfBosRequestSeqCurrent<TSession extends { requestSeq: number }>(
    session: TSession,
    startedWithSeq: number,
    apply: (session: TSession) => TSession
): { session: TSession; applied: boolean } {
    if (startedWithSeq !== session.requestSeq) {
        return { session, applied: false };
    }
    return { session: apply(session), applied: true };
}
