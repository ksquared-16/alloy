/**
 * CANONICAL CHILD PARTICIPATION IDENTITY — the one definition of who a child row is about.
 *
 * A child in enrollment has FOUR ids, and they are four different things:
 *
 *   subjectId        `customer_members.id`   the durable CHILD — stable across leads, across OCM→PI
 *   participationId  `process_instances.id`  this child's journey through THIS lead
 *   contextId        `opportunities.id`      the family case the journey hangs off
 *   legacyOcmId      `opportunity_customer_members.id`  only when a genuine legacy row is behind it
 *
 * Alloy kept losing this. The upstream mapper put a `process_instances.id` in a field named
 * `opportunity_customer_member_id` with nothing to distinguish the two vintages
 * (`docs/runtime/GRAIN-AUTHORITY-MAP.md` §4); the drawer's stage-work cache collapsed three of them
 * into one `child:` component with `a || b || c`; and the stage-work projection resolved a child by
 * taking the first open task that carried any of them. Each of those is the same mistake — treating
 * "some id that might name a child" as "the child" — and each produces a WRITE against a subject the
 * operator did not choose.
 *
 * So identity is a TUPLE here, never a scalar, and it is never guessed:
 *
 *  - `childParticipationIdentityKey` is INJECTIVE. Every id occupies its own slot, so two different
 *    identities cannot collide onto one cache key and one identity cannot split across two.
 *  - There is no "resolve from context" function. An identity is supplied or it is absent, and
 *    absence is a value callers must handle — not a hole to fill from whatever is nearby.
 */

export type ChildParticipationIdentity = {
    /** The durable CHILD — `customer_members.id`. */
    subjectId: string | null;
    /** This child's journey through THIS lead — `process_instances.id`. */
    participationId: string | null;
    /** The family case the journey hangs off — `opportunities.id`. */
    contextId: string | null;
    /** Only when a genuine legacy OCM row is behind this — never a process-instance id wearing its name. */
    legacyOcmId: string | null;
};

export const EMPTY_CHILD_PARTICIPATION_IDENTITY: ChildParticipationIdentity = {
    subjectId: null,
    participationId: null,
    contextId: null,
    legacyOcmId: null,
};

const trim = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * The snake_case shape identity travels in across the execution/API boundary (task metadata, the
 * stage-work query string, `StageOutcomeExecutionSubject`).
 */
export type ChildParticipationIdentityWire = {
    customer_member_id?: string | null;
    process_instance_id?: string | null;
    opportunity_customer_member_id?: string | null;
    opportunity_id?: string | null;
};

/** Read an identity off the wire. Total, lossless, and it invents nothing. */
export function childParticipationIdentityFromWire(
    raw: ChildParticipationIdentityWire | null | undefined,
): ChildParticipationIdentity {
    return {
        subjectId: trim(raw?.customer_member_id),
        participationId: trim(raw?.process_instance_id),
        contextId: trim(raw?.opportunity_id),
        legacyOcmId: trim(raw?.opportunity_customer_member_id),
    };
}

/** Write an identity back to the wire, omitting what is genuinely absent rather than sending nulls. */
export function childParticipationIdentityToWire(
    identity: ChildParticipationIdentity,
): ChildParticipationIdentityWire {
    const wire: ChildParticipationIdentityWire = {};
    if (identity.subjectId) wire.customer_member_id = identity.subjectId;
    if (identity.participationId) wire.process_instance_id = identity.participationId;
    if (identity.legacyOcmId) wire.opportunity_customer_member_id = identity.legacyOcmId;
    if (identity.contextId) wire.opportunity_id = identity.contextId;
    return wire;
}

/**
 * True when the identity names a CHILD at all — the subject, its participation, or a legacy row.
 * The family case alone is not a child: `contextId` deliberately does not count.
 */
export function namesAChild(identity: ChildParticipationIdentity): boolean {
    return Boolean(identity.subjectId || identity.participationId || identity.legacyOcmId);
}

/**
 * INJECTIVE key fragment for caching. Positional, so `{subjectId: "x"}` and `{legacyOcmId: "x"}` —
 * genuinely different claims about the same string, and reachable in real data because a PI id was
 * once carried under the OCM name — produce DIFFERENT keys. A collapsed `a || b || c` produced the
 * same key for both and served one subject's stage work to the other.
 */
export function childParticipationIdentityKey(identity: ChildParticipationIdentity): string {
    return [
        `cm=${identity.subjectId ?? ""}`,
        `pi=${identity.participationId ?? ""}`,
        `ocm=${identity.legacyOcmId ?? ""}`,
    ].join("|");
}

/** Two identities are the same participation only when every component agrees. */
export function sameChildParticipation(
    a: ChildParticipationIdentity,
    b: ChildParticipationIdentity,
): boolean {
    return childParticipationIdentityKey(a) === childParticipationIdentityKey(b) && a.contextId === b.contextId;
}
