/**
 * Operator copy for typed waitlist precedence outcomes.
 *
 * The placement engine emits a REASON CODE; the words live here. Keeping copy out of the ordering
 * engine is what lets the explanation stay generic: it describes the ordering contract only, and can
 * never widen into a statement about whichever row is actually ahead — which on this queue may be a
 * candidate the viewer cannot access, or one whose identity is still contested.
 */
import type { WaitlistRuntimePrecedenceReason } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

const COPY: Record<WaitlistRuntimePrecedenceReason, string> = {
    // Says three things an operator needs: the pin is accepted, it IS working, and its scope is the
    // group. It names no other row, no score, and no protected fact.
    pin_scoped_to_cohort: "Pinned within this group. Groups are ordered separately.",
};

/** Concise operator-facing copy for a typed precedence reason, or null when there is nothing to say. */
export function waitlistPrecedenceReasonCopy(reason: string | null | undefined): string | null {
    if (!reason) return null;
    return COPY[reason as WaitlistRuntimePrecedenceReason] ?? null;
}
