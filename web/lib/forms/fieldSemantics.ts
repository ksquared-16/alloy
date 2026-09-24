/**
 * The four things a Form can now say about a question, read in one place.
 *
 * Each of these follows the move `party_collection` made: the structure already existed, and what
 * was missing was the Form SAYING what it means. None of them creates a store, a writer, or a
 * second copy of anything canonical.
 *
 *   absence      "there are none" is one of the answers, and this is what it is called
 *   retention    nothing canonical owns this yet, and the Form is holding it on purpose
 *   supplied_by  the organisation owns this value; the family is never asked for it
 *   address      these fields are the parts of one address, belonging to one person
 *
 * Read through here rather than off the field, so a second surface cannot invent a fifth reading.
 */

import type { FormField, FormAddressBinding, FormFieldAbsence, FormFieldRetention, FormFieldSuppliedBy } from "@/lib/forms/schema";

/** The default words for an absence answer when the author supplied none of their own. */
export const DEFAULT_ABSENCE_LABEL = "None";

export function absenceOf(field: FormField): FormFieldAbsence | null {
    return field.absence?.offered === true ? field.absence : null;
}

/**
 * What the family reads on the absence answer.
 *
 * AUTHORED, never inferred. This replaced a rule that tested whether the question's own words
 * contained "allerg" — so "Please list any food sensitivities" offered "Nothing to add" while
 * "Allergy information" offered "No known allergies". Same fact, different paperwork, decided by
 * spelling. A question with no absence statement has no absence answer at all.
 */
export function absenceLabel(field: FormField): string | null {
    const absence = absenceOf(field);
    if (!absence) return null;
    return absence.label?.trim() || DEFAULT_ABSENCE_LABEL;
}

/**
 * The stored form of "the family said there are none".
 *
 * A STRUCTURED answer, never an empty string and never the button's own words. Empty is
 * indistinguishable from a question nobody reached; the label is a description of what the parent
 * did, and writing it as the value is what once printed "Middle name: Nothing to add" on a signed
 * health form. This marks the state; the label is applied when it is read.
 */
export const ABSENCE_VALUE = "__absence__" as const;

export function isAbsenceValue(value: unknown): boolean {
    return value === ABSENCE_VALUE;
}

/**
 * How an answered-as-absent field reads wherever a person sees it.
 *
 * Three states, never collapsed: nothing here (unanswered), the authored absence words (the family
 * said there are none), or the detail they gave.
 */
export function displayWithAbsence(field: FormField, value: unknown): { kind: "unanswered" | "absent" | "detail"; text: string } {
    if (isAbsenceValue(value)) return { kind: "absent", text: absenceLabel(field) ?? DEFAULT_ABSENCE_LABEL };
    if (value === undefined || value === null || value === "") return { kind: "unanswered", text: "" };
    return { kind: "detail", text: String(value) };
}

export function retentionOf(field: FormField): FormFieldRetention | null {
    return field.retention?.kind === "form_only_pending_canonical_owner" ? field.retention : null;
}

/**
 * True when this question's answer is evidence only — real, structured, retained, and owned by
 * nothing canonical yet.
 *
 * The schema already refuses `retention` beside `field_source`, so this can never be true of a
 * field that also claims a canonical destination.
 */
export function isFormOnlyEvidence(field: FormField): boolean {
    return retentionOf(field) !== null;
}

/** The domain the author expects to own this eventually — a note for a human, never a binding. */
export function pendingOwnerHint(field: FormField): string | null {
    return retentionOf(field)?.owner_hint?.trim() || null;
}

export function suppliedByOf(field: FormField): FormFieldSuppliedBy | null {
    return field.supplied_by ?? null;
}

/**
 * True when the organisation supplies this value, so the participant is never asked for it.
 *
 * Distinct from `read_only`, which says a value cannot be EDITED here. This says the question does
 * not belong to the family at all — a registration fee is the school's number, and asking a parent
 * to type it only invites them to get it wrong.
 */
export function isConfigurationSupplied(field: FormField): boolean {
    return suppliedByOf(field) !== null;
}

export function addressBindingOf(field: FormField): FormAddressBinding | null {
    if (field.type !== "group") return null;
    return field.address_binding ?? null;
}

/** The canonical person fields one address is made of, in the order a person reads them. */
export const ADDRESS_PART_KEYS = ["address_line1", "city", "state", "postal_code"] as const;
export type AddressPartKey = (typeof ADDRESS_PART_KEYS)[number];

export const ADDRESS_PART_LABELS: Readonly<Record<AddressPartKey, string>> = Object.freeze({
    address_line1: "Street address",
    city: "City",
    state: "State",
    postal_code: "ZIP / postal code",
});

/**
 * Which part of the address one child field carries.
 *
 * The canonical binding leads, exactly as it does for a party collection's entry questions. The
 * label is consulted only where the Form carries no binding, and only inside a group that has
 * DECLARED itself an address — so this reading is never offered to an ordinary field.
 */
export function addressPartOf(group: FormField, field: FormField): AddressPartKey | null {
    if (!addressBindingOf(group)) return null;
    const key = field.field_source?.field_key?.trim().toLowerCase() ?? "";
    if ((ADDRESS_PART_KEYS as readonly string[]).includes(key)) return key as AddressPartKey;
    const label = (field.label ?? "").toLowerCase();
    if (/\bstreet\b|\bline\s*1\b|\baddress\b/.test(label)) return "address_line1";
    if (/\bcity\b|\btown\b/.test(label)) return "city";
    if (/\bstate\b|\bprovince\b/.test(label)) return "state";
    if (/\bzip\b|\bpostal\b|\bpostcode\b/.test(label)) return "postal_code";
    return null;
}

/** The parts this address group actually asks for, in canonical reading order. */
export function addressParts(group: FormField): Array<{ field: FormField; part: AddressPartKey }> {
    if (group.type !== "group" || !addressBindingOf(group)) return [];
    const found = new Map<AddressPartKey, FormField>();
    for (const f of group.fields) {
        const part = addressPartOf(group, f);
        if (part && !found.has(part)) found.set(part, f);
    }
    return ADDRESS_PART_KEYS.filter((k) => found.has(k)).map((k) => ({ field: found.get(k)!, part: k }));
}

/**
 * One address as a person writes it: "12 Alder Lane, Bend, OR 97701".
 *
 * Empty parts are omitted rather than printed as gaps — a document with "12 Alder Lane, , OR" on it
 * looks like a bug to the family who signed it.
 */
export function formatAddressLine(parts: Partial<Record<AddressPartKey, unknown>>): string {
    const t = (k: AddressPartKey) => {
        const v = parts[k];
        return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    };
    const street = t("address_line1");
    const city = t("city");
    const state = t("state");
    const postal = t("postal_code");
    const region = [state, postal].filter(Boolean).join(" ");
    return [street, city, region].filter(Boolean).join(", ");
}

/**
 * Field ids that belong to a declared address — the scalar walk must not ask for them alone.
 *
 * The same protection `partyCollectionChildFieldIds` gives a collection of people. Without it a
 * group that has DECLARED itself one address is flattened back into four detached questions, which
 * is exactly the participant experience the declaration exists to prevent: "City" arriving on its
 * own, with nothing to say it is part of an address the family is in the middle of giving.
 */
export function addressPartFieldIds(schema: { fields: readonly FormField[] }): Set<string> {
    const ids = new Set<string>();
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            if (f.type !== "group") continue;
            if (addressBindingOf(f)) {
                for (const child of f.fields) ids.add(child.id);
                continue;
            }
            walk(f.fields);
        }
    };
    walk(schema.fields);
    return ids;
}
