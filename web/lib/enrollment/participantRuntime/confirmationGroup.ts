/**
 * Known facts are confirmed by SEMANTIC SUBJECT, not one field at a time.
 *
 * ## The experience this replaces
 *
 * Real use produced eight consecutive turns: confirm the last name, confirm the first name, confirm
 * the birthday, ask the middle name, confirm the parent's name, the phone, the email, the address.
 * Each one correct, each one ask-once, and together a form read aloud. A specialist sitting beside
 * the parent does not do that. They say "let's make sure I have Solene's details right", show what
 * they hold, and ask one question.
 *
 * ## What is grouped, and what is emphatically not
 *
 * ONLY the confirmation interaction. Not identity, not persistence, not validation, not evidence.
 * Every need in a group keeps its own canonical key, its own `shared_values` entry, its own
 * deterministic validation pass and its own D-99 fingerprint — a group of four settles as four
 * independent confirmations, and one member failing validation leaves the other three settled and
 * that one still outstanding. The group exists for exactly as long as it takes to render one card.
 *
 * ## The subject comes from canonical identity — never from an artifact
 *
 * `field_source.entity_type` is carried on EVERY bound field, including fields bound by a
 * `shared_value_key` alias, and `fieldScope.ts` already rules on what those entities mean. So the
 * subject is read straight off the need:
 *
 * ```
 *   child scope        ->  the child     (`child:<subject_id>`)   — every child entity spelling
 *   household scope    ->  that entity   (`household:guardian`, `household:person`, …)
 * ```
 *
 * Two consequences matter, and both are product requirements rather than side effects:
 *
 *  - **`section_title` is not consulted.** A school printing the child's name and the parent's phone
 *    under one heading does not make them one subject, and a school splitting the child's name
 *    across two documents does not make them two.
 *  - **Two people never merge.** `guardian` and `person` are distinct canonical entities and stay
 *    distinct groups, however the source form printed them. The grouping layer can only ever
 *    SEPARATE what identity already separated; it has no power to join two records into one, which
 *    is the one mistake that would put one person's phone number beside another person's name.
 *
 * Pure. No I/O, no provider, no clock.
 */

import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";
import { isConfirmationOfPriorTruth } from "@/lib/enrollment/informationNeeds/enrollmentValueProvenance";

/**
 * Whose facts these are.
 *
 * `kind` exists so presentation can speak — it is the same vocabulary `conversationVoice` reads,
 * deliberately, so the card's heading and the question that follows it cannot describe different
 * people.
 */
export type ConfirmationSubject = {
    /** Deterministic and stable. Two needs share a group exactly when they share this. */
    readonly key: string;
    readonly kind: "child" | "person" | "household" | "other";
    /** The canonical entity, lower-cased. The discriminator that keeps two people apart. */
    readonly entity_type: string | null;
    readonly subject_id: string | null;
};

/** One known fact inside a group. It remains a whole need — this only says where it sits. */
export type ConfirmationGroupMember = {
    readonly need_key: string;
    /**
     * An opaque handle for THIS fact, so a browser can address one member without ever naming a
     * field, a canonical key or an internal id.
     *
     * The server re-derives the handles of the group it is currently offering and accepts nothing
     * else, so the reference can only ever reach a fact the platform just put on the screen.
     */
    readonly ref: string;
    /** True when this fact names the subject, and therefore belongs in the heading. */
    readonly is_identity: boolean;
};

export type ConfirmationGroup = {
    readonly subject: ConfirmationSubject;
    /** Members in the objective's own order — first appearance across the pinned Forms. */
    readonly members: readonly ConfirmationGroupMember[];
};

/** Entities `fieldScope.ts` classifies as the child. All spellings are the same person. */
const CHILD_ENTITIES = new Set(["customer_member", "child", "inquiry_child", "student"]);
/** Entities that denote a PERSON rather than the household as a whole. */
const PERSON_ENTITIES = new Set(["person", "parent", "guardian", "contact"]);
const HOUSEHOLD_ENTITIES = new Set(["customer", "household", "address", "location"]);

/**
 * The semantic subject of one need.
 *
 * Child scope collapses every child entity spelling onto the child itself, because
 * `classifyFieldScope` has already ruled that they mean the same person and the journey's
 * `subject_id` says which one. Everything else is keyed by its own canonical entity, so no two
 * entities are ever spoken about as one.
 */
export function confirmationSubjectFor(need: EnrollmentInformationNeed): ConfirmationSubject {
    const entity = (need.identity.entity_type ?? "").trim().toLowerCase() || null;

    if (need.scope === "child" || (entity && CHILD_ENTITIES.has(entity))) {
        return {
            key: `child:${need.subject_id ?? "-"}`,
            kind: "child",
            entity_type: entity,
            subject_id: need.subject_id,
        };
    }
    if (entity && PERSON_ENTITIES.has(entity)) {
        return { key: `person:${entity}`, kind: "person", entity_type: entity, subject_id: null };
    }
    if (entity && HOUSEHOLD_ENTITIES.has(entity)) {
        return { key: `household:${entity}`, kind: "household", entity_type: entity, subject_id: null };
    }
    /*
     * No canonical entity to reason about. Keyed by the entity spelling itself (or the scope when
     * there is none) so unrecognised subjects stay APART rather than piling into one bucket — the
     * failure that would merge two strangers is the one worth failing away from.
     */
    return {
        key: `other:${entity ?? need.scope}:${need.subject_id ?? "-"}`,
        kind: "other",
        entity_type: entity,
        subject_id: need.subject_id,
    };
}

/**
 * Does this fact NAME its subject?
 *
 * Read off the canonical key's own terminal token, not a list of childcare fields: `child_last_name`,
 * `guardian_name`, `person:first_name` and `customer_member:display_name` all name someone, and a
 * heading that reads "Solene Marchetti" is better than two rows reading "First name · Solene" and
 * "Last name · Marchetti". An identity fact is still an independent need — it is confirmed, edited
 * and evidenced exactly like every other member; only where it is DRAWN changes.
 */
const IDENTITY_KEY = /(?:^|[_:])(?:(?:first|last|middle|full|display|preferred)_)?name$/;

export function isIdentityFact(need: EnrollmentInformationNeed): boolean {
    const key = (need.identity.canonical_key ?? "").trim().toLowerCase();
    return key.length > 0 && IDENTITY_KEY.test(key);
}

/**
 * Order identity facts read in: given, middle, family, then whole-name forms.
 *
 * Purely so a heading says "Solene Marchetti" rather than "Marchetti Solene". Nothing downstream
 * depends on it, and it never reorders the needs themselves.
 */
const NAME_ORDER = ["first", "given", "middle", "last", "family", "surname", "full", "display", "preferred"];

export function identityFactRank(need: EnrollmentInformationNeed): number {
    const key = (need.identity.canonical_key ?? "").toLowerCase();
    for (let i = 0; i < NAME_ORDER.length; i += 1) {
        if (key.includes(NAME_ORDER[i]!)) return i;
    }
    // A bare `name` — the whole name in one field. It stands alone rather than joining a run.
    return NAME_ORDER.length;
}

/**
 * A short, stable handle for a need key.
 *
 * FNV-1a, deliberately not a cryptographic digest: this is a lookup handle, not a secret, and the
 * boundary that matters is that the server only honours handles belonging to the group it is
 * currently offering. Kept dependency-free so this module stays isomorphic — the same grouping runs
 * on the server that composes the card and in any test that reasons about it.
 */
export function confirmationRef(needKey: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < needKey.length; i += 1) {
        hash ^= needKey.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `f${hash.toString(36)}`;
}

/**
 * Group the needs awaiting confirmation by semantic subject.
 *
 * ONLY `known_requires_confirmation`. A missing fact is a question, and putting it in a card of
 * things Alloy claims to know — under a heading saying "is this right?" — would present an absence
 * as stored truth. That is the specific failure the middle-name case names: the confirmation shows
 * what is known, and "Does Solene have a middle name?" is asked afterwards, on its own.
 *
 * Order is the objective's own, for the groups and within them, so grouping decides how the
 * conversation is drawn and never what it asks or in what sequence.
 */
export function groupKnownConfirmations(
    needs: readonly EnrollmentInformationNeed[],
): ConfirmationGroup[] {
    const bySubject = new Map<string, { subject: ConfirmationSubject; members: ConfirmationGroupMember[] }>();

    for (const need of needs) {
        if (need.state !== "known_requires_confirmation") continue;
        const subject = confirmationSubjectFor(need);
        let bucket = bySubject.get(subject.key);
        if (!bucket) {
            bucket = { subject, members: [] };
            bySubject.set(subject.key, bucket);
        }
        bucket.members.push({
            need_key: need.identity.key,
            ref: confirmationRef(need.identity.key),
            is_identity: isIdentityFact(need),
        });
    }

    return [...bySubject.values()].map((bucket) => ({ subject: bucket.subject, members: bucket.members }));
}

/** The group the participant is being asked about right now, or null when they stand alone. */
export function activeConfirmationGroup(
    needs: readonly EnrollmentInformationNeed[],
    activeNeedKey: string | null,
): ConfirmationGroup | null {
    if (!activeNeedKey) return null;
    const group = groupKnownConfirmations(needs).find((g) =>
        g.members.some((m) => m.need_key === activeNeedKey),
    );
    /*
     * A group of ONE is not a group.
     *
     * One known fact under a heading, a summary line and two buttons is more ceremony than the
     * single sentence it replaces. Returning null here leaves that turn exactly as it has always
     * been — which is also why this whole feature is additive rather than a rewrite of the confirm
     * turn.
     */
    if (!group || group.members.length < 2) return null;
    return group;
}

/**
 * Facts the parent has already settled, grouped by the SAME semantic subject.
 *
 * ## Why history is derived, not remembered
 *
 * The surface used to keep the transcript in component state, so the record of a grouped
 * confirmation was the two sentences that produced it — "Let's make sure I have Chidinma's details
 * right." / "Yes, that's right" — and what was actually agreed to was gone. Worse, it was gone for
 * good on reload, which would make any Edit affordance in history a lie.
 *
 * So settled history is projected from the same durable needs the conversation is made of. It
 * survives a reload, it cannot drift from what is stored, and every row remains addressable — which
 * is what lets a parent change an answer after the conversation has moved past it.
 *
 * A settled fact is one that no longer needs the participant AND still has a value. A decline is
 * settlement without a value and is deliberately not a row here: there is nothing to show and
 * nothing to correct but the question itself.
 */
export function groupSettledConfirmations(
    needs: readonly EnrollmentInformationNeed[],
): ConfirmationGroup[] {
    const bySubject = new Map<string, { subject: ConfirmationSubject; members: ConfirmationGroupMember[] }>();

    for (const need of needs) {
        /*
         * PROVENANCE, NOT STATE.
         *
         * This filter used to be `state === "confirmed"`, which reads as "the parent confirmed
         * this" and does not mean it: the runtime records a D-99 confirmation when a participant
         * SUPPLIES a value too, because without that evidence the fact recomputes straight back to
         * `known_requires_confirmation` and the conversation asks about the value they typed
         * seconds earlier. `confirmed` means EVIDENCED.
         *
         * The result was a card headed "Your family's details · Confirmed" holding employers,
         * emergency contacts, custody arrangements, a physician, developmental history, toileting,
         * sleep, fears, previous schools and a material fee — every household-scoped question the
         * parent had just answered, handed back as things they had verified, thirty-one of them
         * behind a "Show 31 more". A confirmation card whose contents need a fold is proof the
         * boundary is wrong.
         */
        if (!need.has_value) continue;
        if (!isConfirmationOfPriorTruth(needProvenance(need))) continue;
        const subject = confirmationSubjectFor(need);
        let bucket = bySubject.get(subject.key);
        if (!bucket) {
            bucket = { subject, members: [] };
            bySubject.set(subject.key, bucket);
        }
        bucket.members.push({
            need_key: need.identity.key,
            ref: confirmationRef(need.identity.key),
            is_identity: isIdentityFact(need),
        });
    }

    return [...bySubject.values()].map((bucket) => ({ subject: bucket.subject, members: bucket.members }));
}

/**
 * The need a fact handle refers to — resolved ONLY against facts the platform is displaying.
 *
 * The bounded set is the whole security property. A handle is an opaque token the server issued for
 * a row the parent can currently see; resolving it against every need in the objective would let a
 * crafted handle reach a fact that was never on screen. So the candidates are exactly the settled
 * rows and the rows of the active card — nothing else, and never a canonical key supplied by the
 * browser.
 */
export function resolveDisplayedFactRef(
    needs: readonly EnrollmentInformationNeed[],
    activeNeedKey: string | null,
    ref: string,
): EnrollmentInformationNeed | null {
    const displayed = new Map<string, EnrollmentInformationNeed>();
    for (const group of groupSettledConfirmations(needs)) {
        for (const member of group.members) displayed.set(member.ref, needByKey(needs, member.need_key));
    }
    for (const member of collectedAnswers(needs)) {
        displayed.set(member.ref, needByKey(needs, member.need_key));
    }
    const active = activeConfirmationGroup(needs, activeNeedKey);
    for (const member of active?.members ?? []) {
        displayed.set(member.ref, needByKey(needs, member.need_key));
    }
    return displayed.get(ref) ?? null;
}

function needByKey(
    needs: readonly EnrollmentInformationNeed[],
    key: string,
): EnrollmentInformationNeed {
    // Every key here came from this same array moments ago, so the lookup cannot miss.
    return needs.find((n) => n.identity.key === key)!;
}

/** The provenance entry shape the need carries, as the classifier expects it. */
function needProvenance(need: EnrollmentInformationNeed) {
    return need.value_origin ? { origin: need.value_origin, recorded_at: "" } : undefined;
}

/**
 * Answers the participant gave DURING this session — collected, never confirmed.
 *
 * These are settled and evidenced exactly like a confirmation, and they are not one. A parent who
 * has just told the school their child's sleep routine has not verified anything; presenting it
 * back under "Confirmed" tells them they checked something they never saw.
 *
 * Returned FLAT and in the objective's own order rather than grouped by subject. Grouping is what a
 * confirmation card is for — "here is what we hold about this person, is it right" — and a list of
 * things the parent said this afternoon is a different object with a different job: it recedes,
 * stays legible, and stays editable.
 */
export function collectedAnswers(
    needs: readonly EnrollmentInformationNeed[],
): ConfirmationGroupMember[] {
    const out: ConfirmationGroupMember[] = [];
    for (const need of needs) {
        if (!need.has_value) continue;
        if (need.value_origin !== "collected_in_session") continue;
        out.push({
            need_key: need.identity.key,
            ref: confirmationRef(need.identity.key),
            is_identity: isIdentityFact(need),
        });
    }
    return out;
}
