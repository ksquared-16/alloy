/**
 * A canonical binding must agree about WHO the fact is about.
 *
 * `suggestFieldBinding` matches a label against an ordered pattern list and returns a canonical
 * field. It is a good matcher and it has no idea whose fact it is looking at: "Primary Physician
 * Phone Number" matches `/phone/` and binds to the person contact phone — the same field the
 * guardian's phone binds to. Accepted, a school's physician would overwrite a parent's phone number
 * on the parent's own record.
 *
 * The same hole runs through the rest of the list. An emergency contact's name matches the guardian
 * name rule. The ACH form's "City" matches the household address rule. Every one of those is a
 * DIFFERENT party wearing the same attribute.
 *
 * Discovery already knows the party — `scalarSemantics` derives it from the label before the concept
 * is built. This module is the boundary that refuses a binding whose party disagrees, and it is
 * deliberately asymmetric: **a false binding is worse than a missing one.** A missing binding costs
 * an operator one decision. A false one silently writes a stranger's phone number onto a family's
 * record, and looks correct while doing it.
 *
 * Where a party HAS registered canonical fields — child and guardian both do — the binding is
 * redirected to that party's own field rather than the generic person one, which is both safer and
 * more specific than what the matcher offered.
 *
 * Pure + deterministic.
 */

import type { FormFieldSource } from "@/lib/forms/schema";

/** The party a concept is about, as derived from its label. @see conceptDiscovery.labelParty */
export type ConceptParty =
    | "child"
    | "guardian"
    | "emergency_contact"
    | "physician"
    | "dentist"
    | "account_holder"
    | "sibling"
    | "employer"
    | "prior_program"
    | "financial_institution"
    | "household"
    | "unknown";

/**
 * The party a canonical field belongs to. Derived from the field's own entity_type + key, so a
 * registry change moves this with it instead of leaving a stale table behind.
 */
export function partyOfFieldSource(fs: FormFieldSource): ConceptParty {
    const entity = (fs.entity_type ?? "").toLowerCase();
    const key = (fs.field_key ?? "").toLowerCase();
    if (entity === "child" || entity === "customer_member" || key.startsWith("child_")) return "child";
    if (entity === "guardian" || key.startsWith("guardian_")) return "guardian";
    if (entity === "customer") return "household";
    if (entity === "person") return "unknown"; // a bare person field names no particular person
    return "unknown";
}

/**
 * Parties with their own registered canonical fields. A binding for one of these must land on that
 * party's field — never on the generic person record, which cannot say which person it means.
 */
const PARTY_FIELDS: Partial<Record<ConceptParty, Partial<Record<string, FormFieldSource>>>> = {
    child: {
        name: { entity_type: "child", field_key: "child_first_name", shared_value_key: "child_first_name" },
        date_of_birth: { entity_type: "customer_member", field_key: "dob" },
    },
    guardian: {
        name: { entity_type: "guardian", field_key: "guardian_first_name", shared_value_key: "guardian_first_name" },
        email: { entity_type: "guardian", field_key: "guardian_email", shared_value_key: "guardian_email" },
        phone: { entity_type: "guardian", field_key: "guardian_phone", shared_value_key: "guardian_phone" },
    },
};

/**
 * Parties Alloy has no canonical home for. A physician is not a household person record; a bank is
 * not a party at all. Binding their attributes to a person or household field is the exact failure
 * this module exists to stop.
 */
export const PARTIES_WITHOUT_A_CANONICAL_HOME = new Set<ConceptParty>([
    "physician",
    "dentist",
    "sibling",
    "employer",
    "prior_program",
    "financial_institution",
]);

/**
 * Parties that ARE people but whose identity a bare canonical field cannot carry. An emergency
 * contact is a real person record — reached through the relationship model, not by writing their
 * phone number into the household's person field.
 */
const PARTIES_OWNED_BY_A_RELATIONSHIP = new Set<ConceptParty>(["emergency_contact", "account_holder"]);

/**
 * True when Alloy has no canonical field for this party — the case where a relationship definition,
 * if one exists for the role, is the right owner instead of a field.
 */
export function partyHasNoCanonicalHome(party: ConceptParty): boolean {
    return PARTIES_WITHOUT_A_CANONICAL_HOME.has(party);
}

export type BindingVerdict =
    | { ok: true; field_source: FormFieldSource; redirected: boolean; reason: string }
    | { ok: false; refused: FormFieldSource; reason: string };

/**
 * Decide whether a matcher's canonical binding may be proposed for a concept about `party`.
 *
 * `attribute` is the concept's derived attribute (name / phone / email / address / date_of_birth)
 * where one was recognized; it is what lets a compatible party be REDIRECTED to its own field.
 */
/**
 * A whole address, or one component of some address?
 *
 * The matcher binds `city`, `state` and `zip` to the household's ADDRESS field, so the bank's city on
 * an ACH authorization would land on the family's address. A component names no address in
 * particular; only a label that actually says "address" does.
 */
const ADDRESS_COMPONENT_ONLY = /\b(city|state|province|zip|postal|county|street)\b/i;
const NAMES_AN_ADDRESS = /\baddress(es)?\b/i;

export function checkBindingParty(
    party: ConceptParty,
    attribute: string | null,
    suggested: FormFieldSource,
    label?: string
): BindingVerdict {
    const suggestedParty = partyOfFieldSource(suggested);

    // A bare address component binds to nobody's address, whatever party is derived.
    if (attribute === "address" && label && ADDRESS_COMPONENT_ONLY.test(label) && !NAMES_AN_ADDRESS.test(label)) {
        return {
            ok: false,
            refused: suggested,
            reason: `"${label.trim()}" is one component of some address, and never says whose — binding it to ${suggested.entity_type}.${suggested.field_key} would write it into the household's address`,
        };
    }

    // Nothing derived about whose fact this is: keep the matcher's answer. It is the pre-existing
    // behaviour and the operator still reviews it — but it is never upgraded to a party it did not
    // earn either.
    if (party === "unknown") {
        return { ok: true, field_source: suggested, redirected: false, reason: "no party derived from the label — matcher result kept as-is" };
    }

    if (PARTIES_WITHOUT_A_CANONICAL_HOME.has(party)) {
        return {
            ok: false,
            refused: suggested,
            reason: `this is the ${party.replace(/_/g, " ")}'s ${attribute ?? "attribute"}, and Alloy has no canonical field for a ${party.replace(/_/g, " ")} — binding it to ${suggested.entity_type}.${suggested.field_key} would write it onto the wrong record`,
        };
    }

    if (PARTIES_OWNED_BY_A_RELATIONSHIP.has(party)) {
        return {
            ok: false,
            refused: suggested,
            reason: `an ${party.replace(/_/g, " ")} is a person reached through the relationship model — ${suggested.entity_type}.${suggested.field_key} cannot say WHICH person, so it would land on the household's own record`,
        };
    }

    // The party has its own registered field for this attribute: prefer it over the generic one.
    const own = attribute ? PARTY_FIELDS[party]?.[attribute] : undefined;
    if (own) {
        const redirected = own.entity_type !== suggested.entity_type || own.field_key !== suggested.field_key;
        return {
            ok: true,
            field_source: own,
            redirected,
            reason: redirected
                ? `redirected from ${suggested.entity_type}.${suggested.field_key} to the ${party}'s own registered field ${own.entity_type}.${own.field_key}`
                : `matches the ${party}'s own registered field`,
        };
    }

    // Party and field agree.
    if (suggestedParty === party) {
        return { ok: true, field_source: suggested, redirected: false, reason: `${suggested.entity_type}.${suggested.field_key} belongs to the ${party}` };
    }

    // A household-scoped fact may bind a household field; anything else is a party mismatch.
    if (party === "household" && suggestedParty === "household") {
        return { ok: true, field_source: suggested, redirected: false, reason: "household fact on a household field" };
    }

    return {
        ok: false,
        refused: suggested,
        reason: `the label names the ${party.replace(/_/g, " ")}, but ${suggested.entity_type}.${suggested.field_key} belongs to ${suggestedParty === "unknown" ? "no particular party" : `the ${suggestedParty}`}`,
    };
}
