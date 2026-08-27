/**
 * Numbered slots in an imported Form are DESTINATIONS. They are not participant entities.
 *
 * ## The platform invariant
 *
 * "Parent/Guardian #1", "Parent/Guardian #2", "Emergency Contact #1..#3", "Authorized Adult" are
 * boxes a school printed on a page. They are not a statement that a family HAS two guardians and
 * three emergency contacts, and the participant runtime must never make a parent invent people to
 * fill them or refuse a family that has four.
 *
 * So the runtime collects canonical PARTIES — a person, their roles, their priority — and
 * realization maps those parties into whatever slots the source happens to offer. A family with one
 * emergency contact leaves slots 2 and 3 empty. A family with five fills three and the rest are
 * held canonically, where they remain true.
 *
 * ## Nothing here is new platform capability
 *
 * Alloy already models repeatable people with roles and ordering, and this reuses it verbatim:
 *
 * ```
 *   persons                          identity — name, email, phone
 *   person_child_relationships       person <-> child, with `relationship_type` and `priority`
 *   person_child_relationship_roles  MANY roles per relationship (`role_key`)
 *   customer_person_role_types       the vocabulary, already seeded: parent, guardian,
 *                                    emergency_contact, authorized_pickup, primary_contact, payer
 * ```
 *
 * `priority` is what "#1" means. `person_child_relationship_roles` being many-per-relationship is
 * what lets one aunt be BOTH the second emergency contact and an authorized pickup without being
 * collected twice — which is exactly the identity/role separation the source form cannot express,
 * because it prints her name in two unrelated boxes.
 *
 * ## What this module is
 *
 * The pure projection: given the parties a journey knows and the slots an artifact offers, decide
 * which party fills which slot. Deterministic, ordered by the relationship's own `priority`, and
 * carrying no knowledge whatsoever of this packet — a Form with two parent slots and four contact
 * slots is described by its slots, not by a rule about childcare.
 *
 * Pure. No I/O.
 */

/** A canonical role key. The vocabulary is `customer_person_role_types`, not this file. */
export type PartyRoleKey = string;

export type CollectedParty = {
    /** `persons.id` once durable; a local id while the conversation is still collecting. */
    readonly party_id: string;
    /** Every role this person holds for this child — one person, many roles. */
    readonly roles: readonly PartyRoleKey[];
    /** `person_child_relationships.priority` — what "#1" actually means. */
    readonly priority: number;
};

/** One numbered destination an artifact offers for a role. */
export type ArtifactPartySlot = {
    readonly slot_id: string;
    readonly role: PartyRoleKey;
    /** 1-based position the source prints — "#1", "#2". */
    readonly ordinal: number;
    /** The destinations that belong to this slot: name, phone, relationship to child… */
    readonly field_ids: readonly string[];
};

export type PartySlotAssignment = {
    readonly slot_id: string;
    readonly role: PartyRoleKey;
    readonly ordinal: number;
    /** Null when the family has fewer people than the source printed boxes. */
    readonly party_id: string | null;
};

export type PartyProjection = {
    readonly assignments: readonly PartySlotAssignment[];
    /**
     * Parties with this role that no slot could hold.
     *
     * NOT an error and NOT a reason to refuse the answer: the person remains canonically true and
     * the artifact simply has nowhere to print them. Reported so an operator surface can say so
     * rather than the platform silently losing a family's fourth emergency contact.
     */
    readonly unplaced: readonly { readonly role: PartyRoleKey; readonly party_id: string }[];
};

/**
 * Assign parties to an artifact's slots, per role, in priority order.
 *
 * Deterministic and stable: the same parties and the same slots always produce the same mapping, so
 * a regenerated artifact does not shuffle people between boxes.
 */
export function projectPartiesIntoSlots(
    parties: readonly CollectedParty[],
    slots: readonly ArtifactPartySlot[],
): PartyProjection {
    const assignments: PartySlotAssignment[] = [];
    const unplaced: { role: PartyRoleKey; party_id: string }[] = [];

    const roles = new Set<PartyRoleKey>(slots.map((s) => s.role));
    for (const role of roles) {
        const roleSlots = slots
            .filter((s) => s.role === role)
            .sort((a, b) => a.ordinal - b.ordinal);
        /*
         * Priority decides who is "#1", never collection order and never the source's box order.
         * Ties fall back to the party id so the mapping is total and reproducible.
         */
        const roleParties = parties
            .filter((p) => p.roles.includes(role))
            .sort((a, b) => a.priority - b.priority || a.party_id.localeCompare(b.party_id));

        roleSlots.forEach((slot, index) => {
            const party = roleParties[index] ?? null;
            assignments.push({
                slot_id: slot.slot_id,
                role: slot.role,
                ordinal: slot.ordinal,
                party_id: party ? party.party_id : null,
            });
        });
        for (const extra of roleParties.slice(roleSlots.length)) {
            unplaced.push({ role, party_id: extra.party_id });
        }
    }

    return {
        assignments: assignments.sort((a, b) => a.role.localeCompare(b.role) || a.ordinal - b.ordinal),
        unplaced,
    };
}

/**
 * How many people the runtime should ASK for, given the slots.
 *
 * The answer is deliberately not "as many as there are boxes". The source's slot count is a
 * ceiling on what can be PRINTED, never a floor on what must be COLLECTED: one emergency contact is
 * a complete answer for a family with one, and a parent must never be walked through "Emergency
 * Contact #3" because a PDF has three rows.
 */
export function minimumPartiesRequired(slots: readonly ArtifactPartySlot[], role: PartyRoleKey): number {
    // A role the artifact offers at all is worth asking about once; beyond that the family decides.
    return slots.some((s) => s.role === role) ? 1 : 0;
}

/**
 * Does this party already hold the role, under another name in the source?
 *
 * "Emergency Contact #1 Name" and "Authorized Adult Name" are two boxes; where the evidence says
 * they are the same person, they are ONE party holding two roles. Reusing the party is what stops
 * the runtime collecting an aunt's phone number twice and then disagreeing with itself.
 */
export function partyHoldingRole(
    parties: readonly CollectedParty[],
    partyId: string,
): CollectedParty | null {
    return parties.find((p) => p.party_id === partyId) ?? null;
}

export function withRole(party: CollectedParty, role: PartyRoleKey): CollectedParty {
    return party.roles.includes(role) ? party : { ...party, roles: [...party.roles, role] };
}
