/**
 * WHAT TO CALL THE PERSON THIS BLOCK IS ABOUT.
 *
 * ## The defect
 *
 * The conversation grouped correctly and then named the groups after the packet's boxes:
 *
 * ```
 *   Guardian #1 · 6 answers          Emergency contact #1 · 4 answers
 *   Guardian #2 · 5 answers          Emergency contact #2 · 4 answers
 * ```
 *
 * Every one of those is implementation vocabulary. "#1" is a position in a printed form, and a
 * family who has just told us the person's name is entitled to see it used. Worse, "Guardian #1"
 * was being said about someone the platform knows is the household's PRIMARY CONTACT — a truth it
 * holds canonically and declined to speak.
 *
 * ## Where the name is allowed to come from
 *
 * In order, and the order is the whole point:
 *
 * ```
 *   1  the canonical party assigned to this slot   persons + person_child_relationships
 *   2  the answer in this slot's own `name` box    only when no such person exists
 *   3  nothing — the numbered slot stands          until one of the above arrives
 * ```
 *
 * Rule 1 outranks rule 2 deliberately. An authoritative person carries a relationship the packet
 * cannot express, and reading a name out of an answer when a person record exists would let a typo
 * in a text box rename someone the platform already knows.
 *
 * Rule 2 is not label-matching by this module: `artifactPartySlots` already classifies each
 * destination's ATTRIBUTE — name, phone, relationship, employer — and this simply asks it which box
 * holds the name. The same reading serves a boarding kennel's owner rows.
 *
 * ## The role label is read, never assumed
 *
 * "Guardian #1" is not "the primary contact" by definition; that is a canonical role a person either
 * holds or does not. So the label comes from the assigned party's own roles, and falls back to the
 * slot's role only when no party is assigned. Nothing here knows that this tenant's first guardian
 * happens to be Kelly Kurzman.
 *
 * Pure. No I/O.
 */

import type { ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import type { PartySlotDestination } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { groupPartySlots } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { projectPartiesIntoSlots } from "@/lib/enrollment/participantRuntime/partySlotProjection";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

export type ParticipantPersonLabel = {
    /** "Kelly Kurzman" — null until this slot has acquired one. */
    readonly name: string | null;
    /** "Primary contact", "Guardian", "Emergency contact" — the person's, not the box's. */
    readonly role_label: string;
    /** Where the name came from, so a surface can be honest about it and a test can assert it. */
    readonly source: "canonical_party" | "slot_answer" | "none";
};

/** `guardian#2` — role and position, the only thing a slot is identified by. */
export function personSlotKey(role: string, ordinal: number): string {
    return `${role}#${ordinal}`;
}

/**
 * The canonical role a person should be INTRODUCED by.
 *
 * A person holds many roles at once — this tenant's primary contact is also a guardian and may be
 * an authorized pickup. The one spoken is the most specific thing that is true of them, because
 * that is what a parent reading a summary needs in order to recognise who is meant.
 */
const ROLE_PRECEDENCE = ["primary_contact", "guardian", "parent", "emergency_contact", "authorized_pickup", "payer"];

function humanize(role: string): string {
    const words = role.replace(/[_-]+/g, " ").trim();
    if (!words) return "";
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** The words for a role: Alloy's own relationship vocabulary first, the key itself as a fallback. */
export function personRoleLabel(role: string): string {
    const definition = relationshipDefinitionForRole(role);
    return humanize(definition?.iteration_alias ?? role);
}

function labelForParty(party: ChildParty, slotRole: string): string {
    for (const candidate of ROLE_PRECEDENCE) {
        if (party.roles.includes(candidate)) return personRoleLabel(candidate);
    }
    // A party with roles the vocabulary does not rank is still introduced by one of its own.
    return personRoleLabel(party.roles[0] ?? slotRole);
}

/**
 * Who each numbered slot is actually about, keyed `role#ordinal`.
 *
 * Slots with neither a party nor an answered name are ABSENT from the map rather than present with
 * a null name, so a caller that forgets to check gets the numbered fallback rather than "null".
 */
export function participantPersonLabels(input: {
    readonly parties?: readonly ChildParty[];
    readonly slots?: readonly PartySlotDestination[];
    readonly needs?: readonly EnrollmentInformationNeed[];
}): ReadonlyMap<string, ParticipantPersonLabel> {
    const out = new Map<string, ParticipantPersonLabel>();
    /*
     * Every input is optional and absence means "say nothing new".
     *
     * An objective assembled by an older caller — or by a test fixture that predates party slots —
     * carries no destinations, and the correct answer for it is the numbered title it already had.
     * Throwing there would make a presentation nicety a hard dependency of the whole wire model.
     */
    const slots = input.slots ?? [];
    const parties = input.parties ?? [];
    const needs = input.needs ?? [];
    if (slots.length === 0) return out;

    const grouped = groupPartySlots(slots);
    const projection = projectPartiesIntoSlots(parties, grouped);
    const partyById = new Map(parties.map((p) => [p.party_id, p]));

    // The value currently held against each Form destination — for rule 2 only.
    const valueByFieldId = new Map<string, unknown>();
    for (const need of needs) {
        if (!need.has_value) continue;
        for (const occurrence of need.occurrences) valueByFieldId.set(occurrence.form_field_id, need.current_value);
    }

    for (const assignment of projection.assignments) {
        const key = personSlotKey(assignment.role, assignment.ordinal);

        const party = assignment.party_id ? partyById.get(assignment.party_id) : undefined;
        if (party) {
            const name = (party.full_name ?? "").trim();
            if (name) {
                out.set(key, { name, role_label: labelForParty(party, assignment.role), source: "canonical_party" });
                continue;
            }
        }

        /*
         * Rule 2: this slot's own naming box, asked for by ATTRIBUTE rather than by reading a label.
         *
         * `name` first, then `authorization`. The second is not a guess: a school that prints
         * "LOCAL Emergency Contact #1 Authorized adult allowed to pick my student up" has written an
         * authorization line and put a PERSON in it, and on this packet that line is the only place
         * the contact is ever named. Measured — all three emergency-contact slots classify as
         * `authorization` and none of them has a `name` destination, so reading only `name` left
         * every emergency contact numbered however much the family had told us.
         */
        const naming = slots.filter((s) => s.role === assignment.role && s.ordinal === assignment.ordinal);
        const nameField =
            naming.find((s) => s.attribute === "name") ?? naming.find((s) => s.attribute === "authorization");
        const answered = nameField ? valueByFieldId.get(nameField.field_id) : undefined;
        if (typeof answered === "string" && answered.trim()) {
            out.set(key, {
                name: answered.trim(),
                role_label: personRoleLabel(assignment.role),
                source: "slot_answer",
            });
        }
    }

    return out;
}
