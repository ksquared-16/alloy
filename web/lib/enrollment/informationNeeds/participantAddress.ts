/**
 * An address, as the CONVERSATION has to understand it.
 *
 * ## What was wrong
 *
 * `walkScalarFormFields` visits every scalar alone, so a declared address reached the participant as
 * four unrelated questions — "Street address?", "City?", "State?", "ZIP?" — with nothing to say they
 * were describing one thing. The parts are now suppressed from that walk, which stops the four
 * detached questions; this is the other half, the ONE interaction that replaces them.
 *
 * ## No second address model
 *
 * The parts stay exactly what they were: canonical Person fields, bound by `field_source`, written
 * through the same shared-value path every other scalar uses. Nothing here stores an address, and
 * nothing here writes one — the group's own declaration says whose address it is, and the canonical
 * owner still performs any finalization.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import {
    ADDRESS_PART_LABELS,
    addressBindingOf,
    addressParts,
    formatAddressLine,
    type AddressPartKey,
} from "@/lib/forms/fieldSemantics";

/** One question of an address, as the card draws it. */
export type ParticipantAddressPart = {
    readonly part: AddressPartKey;
    readonly field_id: string;
    readonly label: string;
    readonly required: boolean;
    /** The canonical shared key this part reads and writes — the same one a scalar would use. */
    readonly shared_value_key: string | null;
    readonly value: string;
};

/** The whole address, as one conversational obligation. */
export type ParticipantAddress = {
    readonly group_field_id: string;
    readonly label: string;
    readonly subject: "child" | "person";
    readonly role: string | null;
    readonly parts: readonly ParticipantAddressPart[];
    /** What Alloy already holds, written the way a person writes it. Empty when it holds nothing. */
    readonly known_line: string;
    /** Every part the Form asks for has a value. */
    readonly complete: boolean;
    /** Some but not all — the case that must never wipe what is already known. */
    readonly partial: boolean;
};

/** Every declared address group in this schema, in document order. */
export function addressGroups(schema: Pick<FormSchemaV1, "fields">): Array<FormField & { type: "group" }> {
    const out: Array<FormField & { type: "group" }> = [];
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            if (f.type !== "group") continue;
            if (addressBindingOf(f)) out.push(f);
            else walk(f.fields);
        }
    };
    walk(schema.fields);
    return out;
}

/**
 * The shared key one address part reads and writes.
 *
 * The SAME key a scalar bound to that canonical field would use, which is the whole reason this
 * needs no store of its own: a guardian's `address_line1` collected here and the same fact
 * collected anywhere else are one value, and correcting it once corrects it everywhere.
 */
export function addressPartSharedKey(group: FormField, field: FormField): string | null {
    const explicit = field.field_source?.shared_value_key?.trim();
    if (explicit) return explicit;
    const source = field.field_source;
    if (!source?.entity_type || !source?.field_key) return null;
    const binding = addressBindingOf(group);
    const role = binding?.role?.trim();
    // A role-scoped address belongs to the person in that relationship, so the key says which.
    return role ? `${source.entity_type}.${role}.${source.field_key}` : `${source.entity_type}.${source.field_key}`;
}

/** Project one declared address group into the conversational obligation, with what is known. */
export function projectParticipantAddress(
    group: FormField & { type: "group" },
    values: Readonly<Record<string, unknown>>,
): ParticipantAddress | null {
    const binding = addressBindingOf(group);
    if (!binding) return null;

    const parts: ParticipantAddressPart[] = addressParts(group).map(({ field, part }) => {
        const key = addressPartSharedKey(group, field);
        const raw = (key ? values[key] : undefined) ?? values[field.id];
        return {
            part,
            field_id: field.id,
            label: field.label?.trim() || ADDRESS_PART_LABELS[part],
            required: field.required === true,
            shared_value_key: key,
            value: typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim(),
        };
    });

    const answered = parts.filter((p) => p.value.length > 0);
    return {
        group_field_id: group.id,
        label: group.label,
        subject: binding.subject,
        role: binding.role ?? null,
        parts,
        known_line: formatAddressLine(Object.fromEntries(parts.map((p) => [p.part, p.value]))),
        complete: parts.length > 0 && parts.every((p) => p.value.length > 0),
        partial: answered.length > 0 && answered.length < parts.length,
    };
}

/**
 * Whether the Form's requirement for this address is met.
 *
 * Only the parts the Form marks REQUIRED are demanded. A school that asks for a street and a ZIP and
 * treats the rest as optional is not blocked on a city it never insisted on.
 */
export function addressSatisfied(address: ParticipantAddress): boolean {
    const required = address.parts.filter((p) => p.required);
    if (required.length === 0) return address.parts.some((p) => p.value.length > 0);
    return required.every((p) => p.value.length > 0);
}

/**
 * The shared-value writes one submitted address makes.
 *
 * A part the family left untouched is NOT written, which is what stops a correction to one line
 * from wiping a city Alloy already held. Every write goes to the canonical shared key, so this
 * introduces no second destination.
 */
export function addressWrites(
    address: ParticipantAddress,
    submitted: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const part of address.parts) {
        if (!Object.prototype.hasOwnProperty.call(submitted, part.part)) continue;
        const raw = submitted[part.part];
        const text = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
        // An empty box the family cleared is a deliberate clear; an absent key is "they did not say".
        const key = part.shared_value_key ?? part.field_id;
        out[key] = text;
    }
    return out;
}
