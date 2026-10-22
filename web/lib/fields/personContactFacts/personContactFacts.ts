/**
 * A PARENT'S WORK AND CONTACT FACTS — where they live, and the one writer.
 *
 * An enrollment form asks a parent for their cell, home and work phone, employer, work hours and
 * work address (Oregon TA-806 does). Until FI-06/07 only `employer` had a home, nothing wrote it,
 * and the rest stayed on the submission. These are facts about the ADULT, not the child or the
 * household: Pat's work phone is Pat's on every child's paperwork, and a sibling's form reads it
 * back instead of asking again.
 *
 *   persons.phone              the adult's MOBILE / primary number. Identity-bearing
 *                              (`phone_canonical`); not written here — identity owns it.
 *   person field values        home_phone, work_phone, employer, work_hours, work_address,
 *                              communication_preference (the preferred contact method).
 *
 * The field DEFINITIONS are the organisation's configuration (Settings → Fields, entity Person),
 * not seeded here: an org that has not defined one is told so (`fact_not_configured`) and nothing
 * is written — never a silent drop.
 *
 * Distinct numbers stay distinct: a home or work number is never folded into `phone`, and a
 * blank answer never clears a value on record. Values reach Person only through an operator's
 * approval in Processing (`executePersonContactFactsProposalCommit`) — never straight from a
 * submission.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { payloadFromFieldType } from "@/lib/admin/typedFieldValues";

export const PERSON_CONTACT_FACT_KEYS = [
    "home_phone",
    "work_phone",
    "employer",
    "work_hours",
    "work_address",
    "communication_preference",
] as const;
export type PersonContactFactKey = (typeof PERSON_CONTACT_FACT_KEYS)[number];

export const PERSON_CONTACT_FACT_LABELS: Readonly<Record<PersonContactFactKey, string>> = {
    home_phone: "Home phone",
    work_phone: "Work phone",
    employer: "Employer",
    work_hours: "Work hours",
    work_address: "Work address",
    communication_preference: "Preferred contact method",
};

/** The option keys of the existing `communication_preference` option set. */
export const COMMUNICATION_PREFERENCE_KEYS = ["email", "sms", "phone"] as const;

export function isPersonContactFactKey(key: string): key is PersonContactFactKey {
    return (PERSON_CONTACT_FACT_KEYS as readonly string[]).includes(key);
}

/**
 * A preferred contact method in the option set's own words, or null — never a guess. "Text" and
 * "cell" are SMS; "call" is phone.
 */
export function normalizeCommunicationPreference(raw: unknown): (typeof COMMUNICATION_PREFERENCE_KEYS)[number] | null {
    if (typeof raw !== "string") return null;
    const v = raw.trim().toLowerCase();
    if (v === "email" || v === "e-mail") return "email";
    if (v === "sms" || v === "text" || v === "text message" || v === "texting") return "sms";
    if (v === "phone" || v === "call" || v === "phone call") return "phone";
    return null;
}

/** The value a fact will be written as, or null when there is nothing to write. */
export function normalizePersonContactFactValue(key: PersonContactFactKey, raw: unknown): string | null {
    if (key === "communication_preference") return normalizeCommunicationPreference(raw);
    if (typeof raw !== "string") return null;
    const v = raw.trim().replace(/\s+/g, " ");
    return v.length > 0 ? v : null;
}

/** The adult's facts on record, keyed by fact. Absent = never recorded. */
export async function readPersonContactFacts(
    supabase: SupabaseClient,
    input: { orgId: string; personId: string },
): Promise<Partial<Record<PersonContactFactKey, string>>> {
    const { data: defs, error: defError } = await supabase
        .from("field_definitions")
        .select("id, field_key")
        .eq("org_id", input.orgId)
        .eq("entity_type", "person")
        .in("field_key", [...PERSON_CONTACT_FACT_KEYS]);
    if (defError) throw new Error(defError.message);
    const keyByDef = new Map(((defs ?? []) as { id: string; field_key: string }[]).map((d) => [d.id, d.field_key]));
    if (keyByDef.size === 0) return {};
    const { data: rows, error } = await supabase
        .from("field_values")
        .select("field_definition_id, value_text")
        .eq("org_id", input.orgId)
        .eq("entity_type", "person")
        .eq("entity_id", input.personId)
        .in("field_definition_id", [...keyByDef.keys()]);
    if (error) throw new Error(error.message);
    const out: Partial<Record<PersonContactFactKey, string>> = {};
    for (const r of (rows ?? []) as { field_definition_id: string; value_text: string | null }[]) {
        const key = keyByDef.get(r.field_definition_id);
        if (key && isPersonContactFactKey(key) && r.value_text?.trim()) out[key] = r.value_text.trim();
    }
    return out;
}

export type PersonContactFactWrite = { key: PersonContactFactKey; previous: string | null; value: string };

/**
 * Write approved facts onto the adult — definition-checked, never a blank over a value. A fact whose
 * definition is missing is REPORTED (`missing_definitions`) and nothing is written.
 */
export async function writePersonContactFacts(
    supabase: SupabaseClient,
    input: { orgId: string; personId: string; facts: Partial<Record<PersonContactFactKey, string>> },
): Promise<{ written: PersonContactFactWrite[]; unchanged: PersonContactFactKey[]; missing_definitions: PersonContactFactKey[] }> {
    const keys = (Object.keys(input.facts) as PersonContactFactKey[]).filter((k) => isPersonContactFactKey(k) && input.facts[k]?.trim());
    const out = { written: [] as PersonContactFactWrite[], unchanged: [] as PersonContactFactKey[], missing_definitions: [] as PersonContactFactKey[] };
    if (keys.length === 0) return out;
    const { data: defs, error: defError } = await supabase
        .from("field_definitions")
        .select("id, field_key, field_type")
        .eq("org_id", input.orgId)
        .eq("entity_type", "person")
        .eq("is_system", false)
        .in("field_key", keys);
    if (defError) throw new Error(defError.message);
    const defByKey = new Map(((defs ?? []) as { id: string; field_key: string; field_type: string }[]).map((d) => [d.field_key, d]));
    // All or nothing: an approval is recorded whole, so a fact with nowhere to go stops the write
    // BEFORE anything lands — never half the parent's details with no ledger entry for them.
    out.missing_definitions.push(...keys.filter((k) => !defByKey.has(k)));
    if (out.missing_definitions.length > 0) return out;
    for (const key of keys) {
        const def = defByKey.get(key)!;
        const value = input.facts[key]!.trim();
        const { data: existing, error: readError } = await supabase
            .from("field_values")
            .select("id, value_text")
            .eq("org_id", input.orgId)
            .eq("entity_type", "person")
            .eq("entity_id", input.personId)
            .eq("field_definition_id", def.id)
            .maybeSingle();
        if (readError) throw new Error(readError.message);
        const prior = existing as { id: string; value_text: string | null } | null;
        if (prior?.value_text?.trim() === value) {
            out.unchanged.push(key);
            continue;
        }
        const typed = payloadFromFieldType(def.field_type, value);
        const { error } = prior
            ? await supabase.from("field_values").update({ ...typed, updated_at: new Date().toISOString() }).eq("id", prior.id)
            : await supabase.from("field_values").insert({ org_id: input.orgId, entity_type: "person", entity_id: input.personId, field_definition_id: def.id, ...typed });
        if (error) throw new Error(error.message);
        out.written.push({ key, previous: prior?.value_text?.trim() || null, value });
    }
    return out;
}

/**
 * Is this adult one of this household's adults? `customer_persons` is the household's membership
 * (the same check the participant payer passes); a household contact or a relationship to one of
 * its children also counts. A parent's facts are written only onto an adult the family names.
 */
export async function personBelongsToHousehold(
    supabase: SupabaseClient,
    input: { orgId: string; personId: string; customerId: string },
): Promise<boolean> {
    const { data: member, error: memberError } = await supabase
        .from("customer_persons")
        .select("person_id")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("person_id", input.personId)
        .limit(1);
    if (memberError) throw new Error(memberError.message);
    if ((member ?? []).length > 0) return true;
    const { data: contact, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("person_id", input.personId)
        .limit(1);
    if (error) throw new Error(error.message);
    if ((contact ?? []).length > 0) return true;
    const { data: rel, error: relError } = await supabase
        .from("person_child_relationships")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("person_id", input.personId)
        .limit(1);
    if (relError) throw new Error(relError.message);
    return (rel ?? []).length > 0;
}

const nameKey = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Do the names the respondent gave for themselves contradict the adult on record? A name not given
 * contradicts nothing; a different one does (the form was filled by — or about — another adult).
 */
export function statedNameContradictsPerson(
    stated: { first: string | null; last: string | null },
    person: { first_name: string | null; last_name: string | null },
): boolean {
    const firstClash = stated.first && person.first_name && nameKey(stated.first) !== nameKey(person.first_name);
    const lastClash = stated.last && person.last_name && nameKey(stated.last) !== nameKey(person.last_name);
    return Boolean(firstClash || lastClash);
}
