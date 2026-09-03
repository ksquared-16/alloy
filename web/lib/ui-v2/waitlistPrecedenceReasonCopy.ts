/**
 * Operator copy for typed waitlist precedence outcomes.
 *
 * The placement engine emits a REASON CODE; the words live here. Keeping copy out of the ordering
 * engine is what lets the explanation stay generic: it describes the ordering contract only, and can
 * never widen into a statement about whichever row is actually ahead — which on this queue may be a
 * candidate the viewer cannot access, or one whose identity is still contested.
 */
import type { WaitlistRuntimePrecedenceReason } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

/**
 * DELIBERATELY EMPTY — no reason code carries operator prose.
 *
 * The explanation used to render on every ranked row that had the reason, which meant recurring
 * copy down the queue for a fact most operators never needed. The Director's decision: no row
 * helper. Scope is instead communicated once, where the move is actually made, by the control's own
 * field label ("Group position") — a label rather than a sentence.
 *
 * The map and the resolver stay so the typed reason code keeps a single place to acquire words if a
 * future surface genuinely needs them. Callers already handle `null`, which is now the only answer.
 */
const COPY: Partial<Record<WaitlistRuntimePrecedenceReason, string>> = {};

/** Concise operator-facing copy for a typed precedence reason, or null when there is nothing to say. */
export function waitlistPrecedenceReasonCopy(reason: string | null | undefined): string | null {
    if (!reason) return null;
    return COPY[reason as WaitlistRuntimePrecedenceReason] ?? null;
}
