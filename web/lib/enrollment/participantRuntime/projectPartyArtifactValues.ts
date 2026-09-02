/**
 * Canonical people, printed into whatever slots an artifact happens to expose.
 *
 * ## The authoritative path
 *
 * ```
 *   canonical party graph  ->  role  ->  relationship priority  ->  role/ordinal destinations
 * ```
 *
 * Party-owned destinations are filled from HERE and from nowhere else. The generic shared-need fill
 * cannot reach them — that mechanism is what wrote one phone number into six different people's
 * boxes, because six destinations declared the same canonical key and it had no way to know they
 * belonged to six people. `ownedFieldIds` is returned precisely so the caller can apply this LAST
 * and prove nothing else overwrote it.
 *
 * ## Blanks stay blank
 *
 * A slot with no corresponding canonical party gets nothing. An artifact printing three emergency
 * contact rows for a family with one leaves two empty, which is the truth. Nothing here invents a
 * person to fill a box, and nothing borrows one from a neighbouring slot.
 *
 * Pure. No I/O.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import {
    artifactSlotsForProjection,
    artifactPartySlots,
    type PartyAttribute,
} from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { projectPartiesIntoSlots } from "@/lib/enrollment/participantRuntime/partySlotProjection";
import type { ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";

export type PartyArtifactFill = {
    /** Field id -> value, for party-owned destinations only. */
    readonly values: Readonly<Record<string, unknown>>;
    /** Every party-owned destination, filled or deliberately blank. */
    readonly ownedFieldIds: ReadonlySet<string>;
    /** Canonical parties an artifact had no room to print. Retained, never dropped. */
    readonly unplaced: readonly { readonly role: string; readonly party_id: string }[];
};

/**
 * What a party contributes to one destination.
 *
 * An attribute the canonical person does not carry yields nothing rather than a guess — an
 * employer's address is not something a `persons` row knows, and a blank there is honest.
 */
function attributeValue(party: ChildParty, attribute: PartyAttribute, role: string): unknown {
    switch (attribute) {
        case "name":
            return party.full_name || undefined;
        case "phone":
            return party.phone ?? undefined;
        case "email":
            return party.email ?? undefined;
        case "authorization":
            /*
             * THE PICKUP LINE IS NOT A SIDE EFFECT OF BEING A CONTACT.
             *
             * "Authorized adult allowed to pick my student up" carries a NAME, and it carries one
             * only when this person actually holds the pickup role. An emergency contact who was
             * never authorised leaves it blank — which is the whole reason the two roles are
             * attached separately rather than inferred from each other.
             */
            return party.roles.includes("authorized_pickup") ? party.full_name || undefined : undefined;
        case "relationship":
        case "address":
        case "employer":
        case "employer_address":
            // Not carried on the canonical person. Truthfully blank until a source of it exists.
            return undefined;
    }
}

export function projectPartyArtifactValues(
    schema: Pick<FormSchemaV1, "fields">,
    parties: readonly ChildParty[],
    vocabulary: readonly string[] = [],
): PartyArtifactFill {
    const destinations = artifactPartySlots(schema, vocabulary);
    const slots = artifactSlotsForProjection(schema, vocabulary);
    if (slots.length === 0) {
        return { values: {}, ownedFieldIds: new Set(), unplaced: [] };
    }

    const projection = projectPartiesIntoSlots(parties, slots);
    const partyBySlot = new Map(projection.assignments.map((a) => [a.slot_id, a.party_id]));
    const partyById = new Map(parties.map((p) => [p.party_id, p]));

    const values: Record<string, unknown> = {};
    const ownedFieldIds = new Set<string>();

    for (const destination of destinations) {
        ownedFieldIds.add(destination.field_id);
        const partyId = partyBySlot.get(`${destination.role}#${destination.ordinal}`);
        if (!partyId) continue;
        const party = partyById.get(partyId);
        if (!party) continue;
        const value = attributeValue(party, destination.attribute, destination.role);
        if (value !== undefined && value !== "") values[destination.field_id] = value;
    }

    return { values, ownedFieldIds, unplaced: projection.unplaced };
}

/**
 * Apply the party fill so it WINS over anything the generic path produced.
 *
 * Applied last, and it also CLEARS a party-owned destination the generic path had filled. That
 * second half is the point: a shared-value write that reached "Emergency Contact #2 Phone Number"
 * because six destinations shared one canonical key must not survive merely because it happened
 * first. A party-owned box shows a canonical party or nothing.
 */
export function applyPartyArtifactValues(
    base: Readonly<Record<string, unknown>>,
    fill: PartyArtifactFill,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const fieldId of fill.ownedFieldIds) delete out[fieldId];
    return { ...out, ...fill.values };
}
