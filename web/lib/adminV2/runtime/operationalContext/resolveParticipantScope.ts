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

/**
 * THE SCOPE WHEN THE PANEL'S SUBJECT IS ITSELF A CHILD — no selection, and nothing to guess.
 *
 * Everything above resolves a selection against a CASE's several children, where refusing is the
 * whole point. This answers a different situation: a child opened from a child-grain lens, where the
 * record of attention IS the participant. The runtime already states that identity canonically —
 * `subjectIdentityTruth` carries `child.customer_member_id`, `child.display_name` and
 * `child.process_instance_id`, merged onto truth by `mergeSubjectIdentityTruthOntoSettled` — so this
 * reads it rather than inferring anything.
 *
 * It exists because a child-grain answer carries NO `_inquiry_children` collection. The candidate
 * list was therefore empty, the scope resolved to nobody, and the Attendance card asked the operator
 * to "select a child" while displaying that child's own record. The panel stays case-grain; what
 * changes is only that a stated subject is recognised as the participant it already is.
 */
export function participantScopeFromChildSubjectTruth(
    truth: Record<string, unknown>,
): OperationalParticipantScope | null {
    const str = (v: unknown): string | null => {
        const s = v != null ? String(v).trim() : "";
        return s || null;
    };
    const customerMemberId = str(truth["child.customer_member_id"]);
    // The durable child subject is the identity Attendance resolves against. Without it there is no
    // participant, whatever else the payload says.
    if (!customerMemberId) return null;
    /*
     * `participationId` is REQUIRED by the type, and rightly: a scope with no participation identity
     * is not a participation. On a child-grain subject the journey IS that identity, and when truth
     * does not state one there is no participation to scope to — so this refuses rather than
     * inventing an id or widening the contract to admit a scope that cannot be identified.
     */
    const participationId = str(truth["child.process_instance_id"]);
    if (!participationId) return null;
    return {
        participationId,
        customerMemberId,
        personId: str(truth["child.person_id"]),
        displayName: str(truth["child.display_name"]),
        // Same precedence as the candidate mapper: the resolved/signed URL is the one that renders.
        imageUrl:
            str(truth["child.resolved_photo_url"])
            ?? str(truth["child.photo_url"])
            ?? str(truth["child.image_url"]),
        stageKey: str(truth["child.stage_key"]),
        stageLabel: str(truth["child.outcome_status_label"]),
    };
}
