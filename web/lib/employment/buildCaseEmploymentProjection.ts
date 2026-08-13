/**
 * CASE → EMPLOYMENT PROJECTION (related-subject, read-only).
 *
 * Employment is PERSON-owned truth. `buildPersonEmploymentComposition` is its one
 * producer and this module never becomes a second one: it resolves WHICH of a
 * case's linked persons hold employment here, then asks the canonical provider for
 * each one's composition and carries the answer verbatim.
 *
 *     case (opportunity) → its linked persons → buildPersonEmploymentComposition → composition
 *
 * ── WHY THE CASE CARRIES IT AT ALL ──
 *
 * `resolveOperatorFocusTarget` types `host_entity_type` as the literal
 * `"opportunities"`: a person has no host Work Unit of its own, so a Person
 * attention gesture resolves THROUGH the household to its case, and the case's
 * Focus Panel is the only surface that composes for that person. The opportunity
 * payload is therefore the platform's composition ENVELOPE for related-subject
 * projections — the same role `_opportunity_persons` and `_inquiry_children`
 * already play — not a second authority.
 *
 * The ownership line this must not cross:
 *   - No employment truth is persisted on the opportunity.
 *   - No employment SEMANTICS are computed here. `is_staff`, `current`, the state
 *     labels and the configured facts all come from the person-owned composition.
 *   - Removing this module removes a projection, never a fact.
 *
 * ── COST ──
 *
 * A family case has linked persons on every panel compose, and almost none of them
 * are employed. So the applicability test is ONE indexed query over the whole
 * linked set; the per-person composition (which fans out to positions, locations
 * and configured facts) runs only for persons that actually have an employment
 * row. The common answer costs one empty result.
 *
 * Ids are chunked because PostgREST serializes `.in(…)` into the request URI, where
 * an over-long filter reads as an empty result rather than as an error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { chunkIds } from "@/lib/admin/opportunity/opportunityLeadDeletionDb";
import {
    buildPersonEmploymentComposition,
    type PersonEmploymentComposition,
} from "@/lib/employment/buildPersonEmploymentComposition";

/** One linked person of the case that holds (or has held) employment in this org. */
export type CaseEmploymentPerson = {
    person_id: string;
    /** Operator-facing name, supplied by the caller that already resolved the person rows. */
    person_label: string | null;
    /** Verbatim person-owned composition. The case adds nothing to it. */
    employment: PersonEmploymentComposition;
};

export type CaseEmploymentProjection = {
    /**
     * The case's primary person, when that person holds employment. Null covers both
     * "no primary person" and "the primary person does not work here" — the card must
     * not distinguish them into a claim.
     */
    primary: CaseEmploymentPerson | null;
    /** Every linked person with at least one employment period, primary first. */
    people: CaseEmploymentPerson[];
};

/** A linked person the opportunity payload already knows, used to avoid re-reading names. */
export type CaseLinkedPerson = {
    id: string;
    label: string | null;
};

export type CaseEmploymentInput = {
    /** The case's household. Its `customer_persons` are the authoritative contact set. */
    householdId: string | null;
    /** The case's primary person, when it has one. Ordering only — never a filter. */
    primaryPersonId: string | null;
    /**
     * Contacts the caller already resolved, used for their LABELS and as extra candidates.
     *
     * ⚠ Deliberately not the only source. The payload's contact arrays are populated at different
     * points of the record build, and a household case can legitimately carry an empty
     * `_opportunity_persons` and a null `primary_person_id` — which is exactly how this projection
     * first shipped empty against a case whose primary contact WAS employed.
     */
    knownContacts?: readonly CaseLinkedPerson[];
};

export const EMPTY_CASE_EMPLOYMENT_PROJECTION: CaseEmploymentProjection = {
    primary: null,
    people: [],
};

function normalizeLinkedPersons(persons: readonly CaseLinkedPerson[]): Map<string, string | null> {
    const out = new Map<string, string | null>();
    for (const person of persons) {
        const id = typeof person?.id === "string" ? person.id.trim() : "";
        if (!id || out.has(id)) continue;
        const label = typeof person?.label === "string" ? person.label.trim() : "";
        out.set(id, label || null);
    }
    return out;
}

/**
 * Which of these person ids have any employment row in this org.
 *
 * Deliberately selects `person_id` alone: this is the applicability test, not the
 * answer. Reading the rest of the row here would make it tempting to derive meaning
 * from them, which is the composition provider's job.
 */
async function personIdsWithEmployment(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Set<string>> {
    const found = new Set<string>();
    if (personIds.length === 0) return found;

    for (const chunk of chunkIds(personIds)) {
        const { data, error } = await supabase
            .from("employments")
            .select("person_id")
            .eq("org_id", orgId)
            .in("person_id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ person_id?: string | null }>) {
            const id = typeof row.person_id === "string" ? row.person_id.trim() : "";
            if (id) found.add(id);
        }
    }
    return found;
}

/** The household's adult contacts — the authoritative candidate set for a case. */
async function householdContactIds(
    supabase: SupabaseClient,
    orgId: string,
    householdId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from("customer_persons")
        .select("person_id")
        .eq("org_id", orgId)
        .eq("customer_id", householdId);
    if (error) throw new Error(error.message);
    return (data ?? [])
        .map((row) => {
            const id = (row as { person_id?: string | null }).person_id;
            return typeof id === "string" ? id.trim() : "";
        })
        .filter(Boolean);
}

/** Names for the few people who turned out to be employed. */
async function labelsFor(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (personIds.length === 0) return out;
    for (const chunk of chunkIds(personIds)) {
        const { data, error } = await supabase
            .from("persons")
            .select("id, first_name, last_name, full_name")
            .eq("org_id", orgId)
            .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{
            id: string;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
        }>) {
            const full = (row.full_name ?? "").trim();
            const composed = [row.first_name ?? "", row.last_name ?? ""].join(" ").trim();
            out.set(String(row.id), full || composed || null);
        }
    }
    return out;
}

/**
 * Project the employment of a case's contacts.
 *
 * `primaryPersonId` only ORDERS the result — it never filters it. A case whose second guardian is
 * the employed one still answers truthfully.
 */
export async function buildCaseEmploymentProjection(
    supabase: SupabaseClient,
    orgId: string,
    input: CaseEmploymentInput
): Promise<CaseEmploymentProjection> {
    const org = typeof orgId === "string" ? orgId.trim() : "";
    if (!org) return EMPTY_CASE_EMPLOYMENT_PROJECTION;

    const labelById = normalizeLinkedPersons(input.knownContacts ?? []);
    const householdId = typeof input.householdId === "string" ? input.householdId.trim() : "";
    const primaryPersonId = typeof input.primaryPersonId === "string" ? input.primaryPersonId.trim() : "";
    if (primaryPersonId && !labelById.has(primaryPersonId)) labelById.set(primaryPersonId, null);
    if (householdId) {
        for (const id of await householdContactIds(supabase, org, householdId)) {
            if (!labelById.has(id)) labelById.set(id, null);
        }
    }

    const ids = [...labelById.keys()];
    if (ids.length === 0) return EMPTY_CASE_EMPLOYMENT_PROJECTION;

    const employed = await personIdsWithEmployment(supabase, org, ids);
    if (employed.size === 0) return EMPTY_CASE_EMPLOYMENT_PROJECTION;

    // Primary first, then the caller's own order — stable, so the card does not reshuffle
    // between composes.
    const ordered = ids.filter((id) => employed.has(id));
    ordered.sort((a, b) => {
        if (a === primaryPersonId) return -1;
        if (b === primaryPersonId) return 1;
        return 0;
    });

    // Names only for the people who are actually employed — never for the whole household.
    const missingLabels = ordered.filter((id) => !labelById.get(id));
    const resolvedLabels = await labelsFor(supabase, org, missingLabels);

    const people: CaseEmploymentPerson[] = [];
    for (const personId of ordered) {
        const employment = await buildPersonEmploymentComposition(supabase, org, personId);
        // `never_employed` cannot be true here (the person has a row), but the
        // composition is the authority on that, not this module's query.
        if (employment.never_employed) continue;
        people.push({
            person_id: personId,
            person_label: labelById.get(personId) || resolvedLabels.get(personId) || null,
            employment,
        });
    }

    return {
        primary: people.find((p) => p.person_id === primaryPersonId) ?? null,
        people,
    };
}
