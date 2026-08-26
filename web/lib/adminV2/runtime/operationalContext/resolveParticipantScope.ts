/**
 * THE ONE PLACE A PARTICIPANT SCOPE IS DECIDED.
 *
 * Cards must not each work out which child they are about. When they do, they disagree — one reads a
 * name, another takes the first row, a third keeps its own selection — and the panel starts answering
 * about different children in different places at the same time.
 *
 * ── THE REFUSAL IS THE FEATURE ──
 *
 * With several eligible participants and no explicit selection, this returns null. It does NOT pick
 * the first. A card that silently answers about Avery when the operator meant Riley is worse than a
 * card that says it needs a subject, because the operator cannot see the substitution — the name is
 * right there in the card and it is simply the wrong one.
 *
 * A single eligible participant is different: there is no ambiguity to resolve, so scoping to them is
 * a fact rather than a guess. That is the only implicit case, and it is deliberate.
 */

import type { OperationalParticipantScope } from "@/lib/adminV2/runtime/operationalContext/types";

/** The minimum a candidate must expose. Structural on purpose — several projections qualify. */
export type ParticipantScopeCandidate = {
    id: string;
    customerMemberId?: string | null;
    personId?: string | null;
    name?: string | null;
    imageUrl?: string | null;
    stageKey?: string | null;
    stageLabel?: string | null;
};

export type ResolveParticipantScopeResult =
    | { scope: OperationalParticipantScope; reason: "explicit" | "sole_participant" }
    | { scope: null; reason: "none_selected" | "ambiguous" | "not_found" };

function toScope(c: ParticipantScopeCandidate): OperationalParticipantScope {
    return {
        participationId: c.id,
        customerMemberId: c.customerMemberId ?? null,
        personId: c.personId ?? null,
        displayName: c.name ?? null,
        imageUrl: c.imageUrl ?? null,
        stageKey: c.stageKey ?? null,
        stageLabel: c.stageLabel ?? null,
    };
}

/**
 * Resolve the scoped participant for a case.
 *
 * `selectedParticipationId` is the runtime's explicit selection — a stable id, never a label. When it
 * names nobody on this case the answer is `not_found`, not "the first one": a stale selection
 * surviving a navigation is exactly the leak this refuses to launder into a plausible child.
 */
export function resolveParticipantScope(args: {
    selectedParticipationId?: string | null;
    participants: readonly ParticipantScopeCandidate[];
}): ResolveParticipantScopeResult {
    const selected = args.selectedParticipationId?.trim() || null;

    if (selected) {
        const hit = args.participants.find(
            (p) => p.id === selected || (p.customerMemberId ?? null) === selected,
        );
        // A selection that does not belong to THIS case is stale — carried over from the row the
        // operator just left. Answering with somebody else's child is the leak, so it is refused.
        return hit ? { scope: toScope(hit), reason: "explicit" } : { scope: null, reason: "not_found" };
    }

    if (args.participants.length === 1) {
        return { scope: toScope(args.participants[0]!), reason: "sole_participant" };
    }

    // Several children, nobody named. There is nothing to resolve, and guessing would be a lie the
    // operator cannot see.
    return { scope: null, reason: args.participants.length > 1 ? "ambiguous" : "none_selected" };
}
