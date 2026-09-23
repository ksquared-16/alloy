/**
 * The words and rules a repeated-party collection contributes, in one place.
 *
 * The renderer, the builder and the inspector all need the same answers — what the button says,
 * whether the family may add another, whether a row is one Alloy already knows — and three copies
 * of that reasoning is how "Add item" and "+ Add emergency contact" end up disagreeing.
 *
 * Nothing here writes anything. A relationship is created by `lib/admin/relationship/` and nowhere
 * else; this only reads what a schema declared.
 */

import type { FormField, FormPartyCollection } from "@/lib/forms/schema";
import type { FormPayloadGroupRow } from "@/lib/forms/validateSubmission";

export type PartyGroupField = FormField & { type: "group"; party_collection?: FormPartyCollection };

export function partyCollectionOf(field: FormField): FormPartyCollection | null {
    if (field.type !== "group") return null;
    return (field as PartyGroupField).party_collection ?? null;
}

/**
 * The button the family reads.
 *
 * "Add item" is honest about a generic repeater and wrong about people: a parent adding a second
 * emergency contact is not adding an item. An authored label wins; otherwise the collection's own
 * label carries it, so a collection called "Emergency contacts" still reads better than "item".
 */
export function addAnotherLabel(field: FormField): string {
    const party = partyCollectionOf(field);
    if (!party) return "Add item";
    if (party.add_another_label?.trim()) return party.add_another_label.trim();
    // "Add Emergency contact" reads like a heading; "Add emergency contact" reads like a button.
    // An ALL-CAPS or CamelCase label is left alone, because that is someone's deliberate spelling.
    const one = singularise(field.label);
    const lowered = /^[A-Z][a-z]/.test(one) ? one[0]!.toLowerCase() + one.slice(1) : one;
    return `Add ${lowered}`;
}

/** The heading over one entry — "Emergency contact 2" rather than "Emergency contacts #2". */
export function entryHeading(field: FormField, index: number): string {
    const party = partyCollectionOf(field);
    const base = party?.entry_label?.trim() || (party ? singularise(field.label) : field.label);
    return party ? `${base} ${index + 1}` : `${base} #${index + 1}`;
}

/**
 * Whether the family may add to this collection.
 *
 * Absent `party_collection` this is an ordinary repeater and adding was always allowed; a party
 * collection may say otherwise, for a collection that exists only to confirm what Alloy knows.
 */
export function allowsAdd(field: FormField): boolean {
    return partyCollectionOf(field)?.allow_add ?? true;
}

/**
 * A row Alloy already knows, rather than one the family typed.
 *
 * `collection.origin` is the runtime's own statement, written when a bound collection is prefilled.
 * It is the difference between "correct this" and "you added this".
 */
export function rowIsKnown(row: FormPayloadGroupRow): boolean {
    return row.collection?.origin === "existing";
}

/**
 * Whether the family may remove this row.
 *
 * NEVER for a row Alloy already knows. Removing a known emergency contact from a form is the family
 * saying it does not belong on THIS paperwork — it is not an instruction to delete a person from
 * the record, and treating it as one would let a form quietly destroy canonical data. The minimum
 * still applies to the rows the family owns.
 */
export function rowIsRemovable(field: FormField, row: FormPayloadGroupRow, rowCount: number): boolean {
    if (rowIsKnown(row)) return false;
    const min = (field.type === "group" ? field.repeat?.min : 0) ?? 0;
    return rowCount > min;
}

/**
 * A blank entry is never created on the family's behalf.
 *
 * `repeat.min` used to be satisfied by pre-seeding empty rows, which is the paper form's three
 * blank contact blocks rendered in HTML. A minimum is a COMPLETION requirement — the family is told
 * what is still needed and adds it themselves — so a party collection starts empty and the
 * validator asks for the minimum at submit.
 */
export function preallocatesBlankRows(field: FormField): boolean {
    return partyCollectionOf(field) === null;
}

function singularise(label: string): string {
    const t = (label ?? "").trim();
    if (!t) return "entry";
    const lower = t.toLowerCase();
    if (lower.endsWith("ies")) return `${t.slice(0, -3)}y`;
    if (lower.endsWith("ses") || lower.endsWith("xes") || lower.endsWith("zes")) return t.slice(0, -2);
    if (lower.endsWith("s") && !lower.endsWith("ss")) return t.slice(0, -1);
    return t;
}
