/**
 * Which destinations on an artifact are PARTY SLOTS — boxes waiting for a person.
 *
 * ## Why this has to exist
 *
 * R1 established the invariant that "Parent/Guardian #2" and "Emergency Contact #3" are
 * destinations rather than runtime people, and proved the projection that fills them. What it could
 * not do was find them on a real imported artifact: the synthetic proofs hand-authored their slots.
 *
 * Without that, the damage is not merely cosmetic. Seven destinations belonging to SIX different
 * parties — Parent/Guardian #2, Emergency Contacts #1-#3, the Primary Physician and the Dentist —
 * all carry `field_source.field_key = "phone"` under `entity_type = "person"`, so the ask-once
 * layer correctly collapsed them into ONE canonical need and one answer would be printed into all
 * seven boxes. A parent confirmed their own phone number and was then asked "What is your phone
 * number?" for a need that actually belongs to their child's dentist.
 *
 * A destination that belongs to a party slot must therefore never join shared-value dedupe. It is
 * per-party by construction, and it is filled by projecting a party into it — not by asking a
 * question about it.
 *
 * ## This is destination parsing, not identity
 *
 * R1's rule is that LABELS MUST NOT DRIVE SEMANTIC IDENTITY, and that rule is intact: nothing here
 * decides what a value MEANS or which canonical datum it is. This decides which BOX a person's
 * details get printed in, which is the same job `pdf_slot` does and the same thing a person reading
 * the form does when they see "#2" after a name.
 *
 * ## Generic by construction
 *
 * The role vocabulary is supplied by the caller from `customer_person_role_types` — Alloy's own
 * seeded roles — so a tenant whose forms say "Carer" or "Trustee" works with no code change. The
 * ordinal is a digit. The attribute is a small set of universal person attributes. There is no
 * School-of-Enrichment field list anywhere in this file, and the tests prove it against two
 * unrelated synthetic Forms.
 *
 * Pure. No I/O.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { walkScalarFormFields } from "@/lib/forms/formSchemaFieldWalk";
import { detectRelationshipDefinitionForTitle } from "@/lib/fields/relationship/relationshipDefinitions";

/** The universal person attributes a slot can ask for. Not packet-specific. */
export const PARTY_ATTRIBUTES = [
    "name",
    "phone",
    "email",
    "address",
    "relationship",
    "employer",
    "employer_address",
    "authorization",
] as const;

export type PartyAttribute = (typeof PARTY_ATTRIBUTES)[number];

export type PartySlotDestination = {
    readonly field_id: string;
    /** Canonical role key where the vocabulary names one, else the slug the label yields. */
    readonly role: string;
    /** True when `role` matched the caller's canonical vocabulary. */
    readonly canonical_role: boolean;
    /** 1-based. Absent ordinals mean a single-instance slot, which is ordinal 1. */
    readonly ordinal: number;
    readonly attribute: PartyAttribute;
    readonly label: string;
};

/**
 * Attribute phrases, longest first so "Employer Address" is not read as "Address".
 *
 * Ordinary English for the attribute a person HAS. The same eight cover a boarding kennel's owner
 * rows and a sailing club's trustee rows; none of them names a School of Enrichment field.
 */
const ATTRIBUTE_PATTERNS: ReadonlyArray<{ readonly attribute: PartyAttribute; readonly test: RegExp }> = [
    { attribute: "employer_address", test: /\bemployer('?s)?\s+address\b/i },
    { attribute: "employer", test: /\bemployer\b|\bplace of work\b/i },
    { attribute: "relationship", test: /\brelationship\b|\brelation to\b/i },
    { attribute: "authorization", test: /\bauthori[sz]ed?\b|\bpick(\s|-)?up\b|\bcollect the (child|student)\b/i },
    { attribute: "email", test: /\be-?mail\b/i },
    { attribute: "phone", test: /\bphone\b|\bmobile\b|\btelephone\b|\bcell\b/i },
    { attribute: "address", test: /\baddress\b/i },
    { attribute: "name", test: /\bnames?\b/i },
];

function attributeFor(text: string): PartyAttribute | null {
    for (const row of ATTRIBUTE_PATTERNS) if (row.test.test(text)) return row.attribute;
    return null;
}

/** Words that qualify a slot without naming its role — a prefix the ordinal does not own. */
const SLOT_NOISE = /\b(local|optional|primary|secondary|please|list|if applicable|the)\b/gi;

function roleSlug(phrase: string): string {
    return phrase
        .replace(SLOT_NOISE, " ")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

/**
 * Match a label's role phrase against the tenant's canonical role vocabulary.
 *
 * Token overlap rather than equality, because a form writes "Parent/Guardian" for the role Alloy
 * calls `guardian`. The MOST specific match wins — a phrase naming both `parent` and `guardian`
 * resolves to the one whose key shares more tokens with it, so neither is arbitrarily preferred.
 */
export function matchCanonicalRole(
    phrase: string,
    vocabulary: readonly string[] = [],
): string | null {
    /*
     * THE CANONICAL OWNER DETECTS ITS OWN ROLES.
     *
     * `relationshipDefinitions.ts` is the source of truth for configured relationships, and it
     * already carries `detection_patterns` plus a priority order — which is why "Emergency Contact"
     * cannot be claimed by the parent/guardian definition. Delegating here means physician and
     * dentist were canonical roles all along; they were invisible only because this module was
     * reading `customer_person_role_types`, the CUSTOMER-scoped vocabulary, which does not carry
     * child-scoped provider roles.
     *
     * Adding a role therefore remains ONE definition row, exactly as that module's own
     * future-proof rule promises. No vocabulary is authored here.
     */
    const detected = detectRelationshipDefinitionForTitle(phrase);
    if (detected) return detected.operational_role_key;

    /*
     * A tenant vocabulary the relationship model does not (yet) define.
     *
     * Kept as a narrow fallback so a tenant whose forms say "Owner" or "Trustee" still groups its
     * slots by role — those slots are recognised and stop broadcasting even though no canonical
     * relationship exists to write. Exact token match only; the canonical detector owns anything
     * resembling a real relationship.
     */
    const slug = roleSlug(phrase);
    return vocabulary.find((key) => key === slug) ?? null;
}

/**
 * Read one destination as a party slot, or null when it is an ordinary question.
 *
 * A slot needs BOTH a role phrase and a recognisable person attribute. "Comments regarding
 * authorized adults and emergency contacts" names roles and asks for no attribute of a person, so
 * it stays an ordinary question — which is right, because it is one.
 */
/** Entities that ARE the journey's subject. The child is not a repeatable party. */
const SUBJECT_ENTITIES = new Set(["child", "customer_member", "inquiry_child", "student"]);

export function partySlotForField(
    field: FormField,
    vocabulary: readonly string[],
): PartySlotDestination | null {
    const label = (field.label ?? "").trim();
    if (!label) return null;

    /*
     * "Childs Last Name" ends in a name and is not a party slot — it is the subject of the whole
     * journey. A destination already bound to a child entity can never be a repeatable person, and
     * saying so structurally is safer than hoping the label heuristics never reach it. Without this
     * the child's own name boxes were suppressed and the confirmation card lost first and last name.
     */
    const entity = field.field_source?.entity_type?.trim().toLowerCase() ?? "";
    if (entity && SUBJECT_ENTITIES.has(entity)) return null;

    const ordinalMatch = /#\s*(\d+)/.exec(label);
    const ordinal = ordinalMatch ? Number(ordinalMatch[1]) : 1;
    const head = ordinalMatch ? label.slice(0, ordinalMatch.index) : label;
    const tail = ordinalMatch ? label.slice(ordinalMatch.index + ordinalMatch[0].length) : label;

    // The attribute is what the box asks for; with an ordinal it is always after it.
    const attribute = attributeFor(ordinalMatch ? tail : label);
    if (!attribute) return null;

    /*
     * Without an ordinal the role phrase is whatever precedes the attribute word, so a single
     * "Dentist Phone Number" is a party slot of one. With an ordinal the phrase is what precedes
     * the number, which is what "#2" is numbering.
     */
    // The alternation MUST be grouped: `\bphone|mobile|...` without a group anchors `.*$` to the
    // last branch only, so "Primary Physician Phone Number" kept "Number" and produced a role
    // called `physician_number`.
    const phrase = ordinalMatch
        ? head
        : label.replace(new RegExp(`\\b(?:${attributeWord(attribute)}).*$`, "i"), "");
    const slug = roleSlug(phrase);
    if (!slug) return null;

    const canonical = matchCanonicalRole(phrase, vocabulary);
    return {
        field_id: field.id,
        role: canonical ?? slug,
        canonical_role: canonical !== null,
        ordinal: ordinal > 0 ? ordinal : 1,
        attribute,
        label,
    };
}

/** The first word of an attribute, for trimming it off an un-numbered role phrase. */
function attributeWord(attribute: PartyAttribute): string {
    switch (attribute) {
        case "employer_address": return "employer";
        case "employer": return "employer";
        case "relationship": return "relation";
        case "authorization": return "authori";
        case "email": return "e-?mail";
        case "phone": return "phone|mobile|telephone|cell";
        case "address": return "address";
        case "name": return "name";
    }
}

/** Every party-slot destination on one artifact. */
export function artifactPartySlots(
    schema: Pick<FormSchemaV1, "fields">,
    vocabulary: readonly string[],
): PartySlotDestination[] {
    const candidates: PartySlotDestination[] = [];
    walkScalarFormFields(schema as FormSchemaV1, (field) => {
        const slot = partySlotForField(field, vocabulary);
        if (slot) candidates.push(slot);
    });

    /*
     * A PARTY SLOT DESCRIBES A PERSON, AND A PERSON YOU PRINT HAS A NAME.
     *
     * Without this, "Mailing Address or Secondary Parent Address" reads as a slot for a role called
     * "mailing" and the household's own address would be suppressed from the conversation. So a
     * non-canonical role is admitted only when its family also has a name destination — the
     * Physician and the Dentist do, "Mailing" does not.
     *
     * A CANONICAL role needs no such evidence: `emergency_contact` is a person because Alloy's own
     * vocabulary says so, and this packet never prints an emergency contact's name in a box of its
     * own — the name is written on the authorization line.
     */
    const attributesByRole = new Map<string, Set<string>>();
    const numbered = new Set<string>();
    for (const c of candidates) {
        if (!attributesByRole.has(c.role)) attributesByRole.set(c.role, new Set());
        attributesByRole.get(c.role)!.add(c.attribute);
        if (/#\s*\d/.test(c.label)) numbered.add(c.role);
    }

    /*
     * EVIDENCE PROPORTIONATE TO THE CLAIM.
     *
     * A canonical role is a person because Alloy's own vocabulary says so, and an explicitly
     * numbered family is a person because the form numbered it. Anything else must look like a
     * person the form actually describes — MORE THAN ONE attribute. "First Name" and "Childs Last
     * Name" each yield a lone name and are not people; the Physician and the Dentist each have a
     * name AND a phone, and are.
     *
     * The single-attribute rule is what keeps this from swallowing ordinary questions: before it,
     * every label ending in "Name" became a slot and the child's own identity left the conversation.
     */
    return candidates.filter((c) => {
        if (c.canonical_role || numbered.has(c.role)) return true;
        return (attributesByRole.get(c.role)?.size ?? 0) >= 2;
    });
}

/**
 * The field ids that belong to a party slot, for suppression from conversational needs.
 *
 * A destination in this set is filled by projecting a party into it. It is not a question, and it
 * must not join shared-value dedupe — which is what made one phone number reach the dentist's box.
 */
export function partySlotFieldIds(
    schema: Pick<FormSchemaV1, "fields">,
    vocabulary: readonly string[],
): ReadonlySet<string> {
    return new Set(artifactPartySlots(schema, vocabulary).map((s) => s.field_id));
}

/**
 * The party destinations that must not be asked about, because asking would BROADCAST.
 *
 * ## The precise defect
 *
 * Six different parties' phone boxes — Parent/Guardian #2, Emergency Contacts #1-#3, the Physician
 * and the Dentist — all declare `entity_type: person, field_key: phone`. The ask-once layer is
 * right that they are one canonical key; it cannot know they belong to six people. So one answer
 * was written into all six, and the parent was asked "What is your phone number?" for a need that
 * is partly their child's dentist.
 *
 * ## Why not simply suppress every party slot
 *
 * Because a slot is not automatically a duplicate. "Parent/Guardian #1 Phone Number" carries
 * `guardian_phone`, which no other party claims — it is that one person's number, asked once, and
 * removing it would delete the primary guardian's phone from the conversation without anything
 * else collecting it yet.
 *
 * So the rule is narrow and exactly matched to the harm: a party destination is suppressed when its
 * canonical binding is SHARED BY MORE THAN ONE PARTY on the same artifact. Those boxes are filled
 * by projecting parties into them; the rest keep working as they always did.
 *
 * An unfilled box is a truthful gap. A box filled with another person's phone number is not.
 */
export function broadcastingPartyFieldIds(
    schema: Pick<FormSchemaV1, "fields">,
    vocabulary: readonly string[],
): ReadonlySet<string> {
    const slots = artifactPartySlots(schema, vocabulary);
    const bindingByField = new Map<string, string>();
    walkScalarFormFields(schema as FormSchemaV1, (field) => {
        const source = field.field_source;
        const alias = source?.shared_value_key?.trim();
        const entity = source?.entity_type?.trim();
        const key = source?.field_key?.trim();
        const binding = alias || (entity && key ? `${entity}:${key}` : "");
        if (binding) bindingByField.set(field.id, binding);
    });

    /** How many distinct parties (role + ordinal) claim each canonical binding. */
    const partiesByBinding = new Map<string, Set<string>>();
    for (const slot of slots) {
        const binding = bindingByField.get(slot.field_id);
        if (!binding) continue;
        if (!partiesByBinding.has(binding)) partiesByBinding.set(binding, new Set());
        partiesByBinding.get(binding)!.add(`${slot.role}#${slot.ordinal}`);
    }

    const out = new Set<string>();
    for (const slot of slots) {
        const binding = bindingByField.get(slot.field_id);
        if (!binding) continue;
        if ((partiesByBinding.get(binding)?.size ?? 0) > 1) out.add(slot.field_id);
    }
    return out;
}

/**
 * Group destinations into SLOTS — one per role and ordinal, carrying all its fields.
 *
 * The missing bridge between reading an artifact and projecting into it. `artifactPartySlots`
 * answers per DESTINATION ("Trustee #1 Name" and "Trustee #1 Email" are two boxes"), while
 * `projectPartiesIntoSlots` seats one person per SLOT. Handing it the destination list directly
 * made every attribute its own slot, so a role with three attributes looked like capacity three and
 * the second and third seats were filled with nobody — a trust deed with three trustee lines
 * reported capacity four, and a sailing club seated its one guardian into the name box while
 * leaving the phone box empty.
 *
 * Found by running the cross-domain proof, not by reading either module.
 */
export function groupPartySlots(
    destinations: readonly PartySlotDestination[],
): { slot_id: string; role: string; ordinal: number; field_ids: string[] }[] {
    const bySlot = new Map<string, { slot_id: string; role: string; ordinal: number; field_ids: string[] }>();
    for (const d of destinations) {
        const slotId = `${d.role}#${d.ordinal}`;
        const slot = bySlot.get(slotId) ?? { slot_id: slotId, role: d.role, ordinal: d.ordinal, field_ids: [] };
        slot.field_ids.push(d.field_id);
        bySlot.set(slotId, slot);
    }
    return [...bySlot.values()].sort((a, b) => a.role.localeCompare(b.role) || a.ordinal - b.ordinal);
}

/** Read an artifact straight into projectable slots. */
export function artifactSlotsForProjection(
    schema: Pick<FormSchemaV1, "fields">,
    vocabulary: readonly string[] = [],
) {
    return groupPartySlots(artifactPartySlots(schema, vocabulary));
}
