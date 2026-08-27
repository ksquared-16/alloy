/**
 * What the platform ALREADY KNOWS about this journey's child, keyed the way needs are keyed.
 *
 * ## The gap this closes
 *
 * `resolveEnrollmentInformationNeeds` has always accepted `canonicalValues` and always treated a
 * present value as `known_requires_confirmation` rather than `missing`. Nothing ever supplied it.
 * Both public routes called the objective resolver with org and process instance only, so every
 * fact the record already held arrived as unknown, and a parent whose child's date of birth is on
 * file was asked "What is Child Dob?".
 *
 * That is the whole of the defect. The confirmation path, the D-99 fingerprint and the ask-once
 * dedupe were all built and correct; they were being fed an empty record.
 *
 * ## Keyed by `shared_value_key`, because that is what a need is keyed by
 *
 * `packetFieldPlan.canonicalKeyFor` produces one of two shapes, and this module answers both:
 *
 *   `field_source.shared_value_key`          →  the alias itself, e.g. `child_date_of_birth`
 *   `entity_type` + `field_key`              →  `entity:field`, e.g. `customer_member:allergies`
 *
 * A form authored either way therefore finds its value. Emitting only one shape would silently
 * answer half the fields on a real tenant's form — Firefly's own QA form uses both.
 *
 * ## Reads the record, never the session
 *
 * Session `shared_values` are what the PARTICIPANT has said; this is what the ORGANIZATION holds.
 * Keeping them separate is what makes "confirm what we know, collect what we don't" meaningful —
 * merging them would make a participant's own answer look like a fact to re-confirm.
 *
 * Absent, empty and whitespace values are omitted rather than emitted as null: a key that is present
 * means "we have this", and a null under that contract would claim knowledge of nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Canonical child fields the platform holds durably, mapped to the keys a need carries. */
const CHILD_FIELD_ALIASES: ReadonlyArray<{
    readonly column: string;
    /** Every key a form could have used to mean this fact. */
    readonly keys: readonly string[];
}> = [
    { column: "dob", keys: ["child_date_of_birth", "customer_member:dob", "child:date_of_birth", "child:dob"] },
    { column: "first_name", keys: ["child_first_name", "customer_member:first_name", "child:first_name"] },
    { column: "last_name", keys: ["child_last_name", "customer_member:last_name", "child:last_name"] },
    { column: "display_name", keys: ["child_full_name", "customer_member:display_name"] },
];

function usable(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
}

/**
 * Canonical PRIMARY-GUARDIAN fields, mapped to the keys a need carries.
 *
 * Both binding shapes are emitted for the same reason the child list emits both: a form binds by
 * `shared_value_key` alias or by `entity_type` + `field_key`, and a tenant using the other spelling
 * would otherwise be told the platform knows nothing about the parent it is talking to.
 */
const GUARDIAN_FIELD_ALIASES: ReadonlyArray<{
    readonly column: string;
    readonly keys: readonly string[];
}> = [
    { column: "first_name", keys: ["guardian_first_name", "guardian:first_name"] },
    { column: "last_name", keys: ["guardian_last_name", "guardian:last_name"] },
    { column: "full_name", keys: ["guardian_name", "guardian_full_name", "guardian:name"] },
    { column: "email", keys: ["guardian_email", "guardian:email", "guardian:guardian_email"] },
    { column: "phone", keys: ["guardian_phone", "guardian:phone", "guardian:guardian_phone"] },
];

export type ParticipantCanonicalValues = Readonly<Record<string, unknown>>;

export type ParticipantCanonicalContext = {
    readonly values: ParticipantCanonicalValues;
    /**
     * The child's name, for participant-facing copy.
     *
     * Read here because this module already loads the row — a second query for a name the
     * conversation needs on every turn would be a second source for the same fact.
     */
    readonly subjectDisplayName: string | null;
};

/**
 * Resolve the canonical values for the child this Enrollment journey is about.
 *
 * Never throws and never refuses: a read failure yields an empty record, which degrades the
 * experience to "ask for everything" — worse, but still complete and still correct. A participant
 * must not be blocked from enrolling because a prefill lookup failed.
 */
export async function resolveParticipantCanonicalContext(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly processInstanceId: string },
): Promise<ParticipantCanonicalContext> {
    try {
        const { data: instance } = await supabase
            .from("process_instances")
            .select("subject_id")
            .eq("org_id", input.orgId)
            .eq("id", input.processInstanceId)
            .maybeSingle();
        const subjectId = String((instance as { subject_id?: string } | null)?.subject_id ?? "").trim();
        if (!subjectId) return { values: {}, subjectDisplayName: null };

        const { data: child } = await supabase
            .from("customer_members")
            .select("id, customer_id, first_name, last_name, display_name, dob, metadata")
            .eq("org_id", input.orgId)
            .eq("id", subjectId)
            .maybeSingle();
        if (!child) return { values: {}, subjectDisplayName: null };

        const row = child as Record<string, unknown>;
        const out: Record<string, unknown> = {};

        for (const alias of CHILD_FIELD_ALIASES) {
            const value = row[alias.column];
            if (!usable(value)) continue;
            for (const key of alias.keys) out[key] = value;
        }

        /**
         * Operator-authored custom fields live under `customer_members.metadata`, keyed by the same
         * field key a form's `field_source` names. Read generically rather than by allow-list — the
         * registry is tenant-authored, so an allow-list here would go stale the first time an
         * operator added a field.
         */
        const metadata = row.metadata;
        if (metadata != null && typeof metadata === "object" && !Array.isArray(metadata)) {
            for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
                if (key === "source" || !usable(value)) continue;
                out[`customer_member:${key}`] = value;
                out[key] = value;
            }
        }

        /**
         * The HOUSEHOLD this child belongs to, and the adult the school deals with.
         *
         * Both are facts the organization already holds — usually from the inquiry months earlier —
         * and until this read existed the participant runtime could not see either, so a parent whose
         * name, phone and email were on file was asked for all three as though they were strangers.
         *
         * ## `person:*` is deliberately NOT emitted from the guardian record
         *
         * On a real packet `person:phone` is bound by seven destinations at once — Parent/Guardian
         * #2, three emergency contacts, the dentist and the physician — which the identity layer
         * correctly collapses into ONE need, because they share one canonical key. Filling that need
         * from the primary guardian would print this parent's phone number in the emergency
         * contact's box and the dentist's. The guardian's facts are emitted under the `guardian`
         * entity ONLY, which is a different subject and a different need; the generic `person`
         * bucket stays unknown and is asked for, which is the truthful outcome.
         */
        const customerId = String(row.customer_id ?? "").trim();
        if (customerId) {
            await mergeHouseholdValues(supabase, input.orgId, customerId, out);
        }

        const displayName =
            String(row.display_name ?? "").trim() ||
            [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
            null;

        return { values: out, subjectDisplayName: displayName };
    } catch {
        return { values: {}, subjectDisplayName: null };
    }
}

/**
 * Household-grain canonical facts: the customer record, and its primary adult.
 *
 * Reads only. Never throws — a failure here degrades to "ask for it" exactly as the child read does,
 * because a parent must not be blocked from enrolling by a prefill lookup.
 *
 * The customer's own `metadata` is read GENERICALLY, mirroring the child's: the field registry is
 * tenant-authored, so an allow-list would go stale the first time an operator added a household
 * field. A household fact emitted here keeps its household identity — `customer:address` is one
 * need however many address boxes the packet's artifacts print, which is why the parent is not asked
 * for their address again because a second document happens to contain another address box.
 */
async function mergeHouseholdValues(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
    out: Record<string, unknown>,
): Promise<void> {
    try {
        const [{ data: customer }, { data: link }] = await Promise.all([
            supabase
                .from("customers")
                .select("id, metadata")
                .eq("org_id", orgId)
                .eq("id", customerId)
                .maybeSingle(),
            supabase
                .from("customer_persons")
                .select("person_id, is_primary, role_type")
                .eq("org_id", orgId)
                .eq("customer_id", customerId)
                .eq("is_primary", true)
                .limit(1)
                .maybeSingle(),
        ]);

        const metadata = (customer as { metadata?: unknown } | null)?.metadata;
        if (metadata != null && typeof metadata === "object" && !Array.isArray(metadata)) {
            for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
                if (key === "source" || !usable(value)) continue;
                out[`customer:${key}`] = value;
                out[`household:${key}`] = value;
            }
        }

        const personId = String((link as { person_id?: unknown } | null)?.person_id ?? "").trim();
        if (!personId) return;

        const { data: person } = await supabase
            .from("persons")
            .select("first_name, last_name, full_name, email, phone")
            .eq("org_id", orgId)
            .eq("id", personId)
            .maybeSingle();
        if (!person) return;

        const personRow = person as Record<string, unknown>;
        for (const alias of GUARDIAN_FIELD_ALIASES) {
            let value = personRow[alias.column];
            // A record with the parts but no composed name still knows the parent's name.
            if (alias.column === "full_name" && !usable(value)) {
                value = [personRow.first_name, personRow.last_name].filter(Boolean).join(" ").trim();
            }
            if (!usable(value)) continue;
            for (const key of alias.keys) out[key] = value;
        }
    } catch {
        // Nothing merged. Every affected fact simply arrives as a question.
    }
}

/** Values only, for callers that do not render copy. */
export async function resolveParticipantCanonicalValues(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly processInstanceId: string },
): Promise<ParticipantCanonicalValues> {
    return (await resolveParticipantCanonicalContext(supabase, input)).values;
}
