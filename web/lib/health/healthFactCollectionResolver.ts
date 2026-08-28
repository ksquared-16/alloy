/**
 * H3 — the Health fact resolver. READ PATH ONLY.
 *
 * Per `docs/platform/operator/health-foundation-h1-h4-contract.md`: filters `status = active` and
 * an unexpired effective range, orders per the provider's `orderingPolicy`, and returns items
 * shaped for the collection contract.
 *
 * ── IT NEVER INTERPRETS ──
 *
 * A severity that arrived from Trust is CARRIED, not recomputed. Health owns approved durable
 * truth; interpretation belongs to Processing/Trust, and a resolver that re-derived severity would
 * be Health silently overruling the owner of that judgement — in exactly the cases where the two
 * answers differing matters most.
 *
 * ── AND IT NEVER WRITES ──
 *
 * Corrections and endings are H4 capabilities. This module has no write path at all, which is what
 * makes "Trust proposes, Health writes, the card reads" enforceable rather than aspirational.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    assertHealthAccess,
    HEALTH_VIEW_PERMISSION,
    type HealthAccessSubject,
} from "@/lib/health/healthAccess";
import {
    PERSON_HEALTH_FACTS_TABLE,
    PERSON_HEALTH_FACT_SELECT,
    type HealthFactKind,
    type HealthSubjectType,
    type PersonHealthFactRow,
} from "@/lib/health/healthFactModel";

export type HealthFactQuery = {
    orgId: string;
    /**
     * D-H6. REQUIRED, and deliberately not optional: an optional access argument is a check every
     * future caller may forget, and the forgetting is silent. Passing it is the only way to get
     * health data out of this module.
     */
    access: HealthAccessSubject;
    subjectEntityId: string;
    subjectEntityType?: HealthSubjectType;
    /** Omit for every kind — the four provider refs each pass exactly one. */
    factKind?: HealthFactKind;
    /** The day the read is "as of". Defaults to today. */
    asOf?: string | null;
};

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * ACTIVE, AS OF A DAY.
 *
 * `status = 'active'` alone is not enough: a fact may be active and already have an
 * `effective_to` in the past (a medication course that ended), and a card that showed it would be
 * telling staff to administer something that stopped. The status and the date are two different
 * questions and both are asked.
 */
export async function resolveActiveHealthFacts(
    supabase: SupabaseClient,
    query: HealthFactQuery,
): Promise<PersonHealthFactRow[]> {
    // The permission is checked BEFORE the arguments are validated, so a caller without access
    // cannot probe for a valid subject id by watching which inputs change the error.
    assertHealthAccess(query.access, HEALTH_VIEW_PERMISSION);
    const orgId = (query.orgId ?? "").trim();
    const subjectId = (query.subjectEntityId ?? "").trim();
    if (!orgId || !subjectId) return [];
    const asOf = (query.asOf ?? "").trim() || todayYmd();

    let q = supabase
        .from(PERSON_HEALTH_FACTS_TABLE)
        .select(PERSON_HEALTH_FACT_SELECT)
        .eq("org_id", orgId)
        .eq("subject_entity_id", subjectId)
        .eq("status", "active")
        .or(`effective_to.is.null,effective_to.gte.${asOf}`)
        .order("created_at", { ascending: true });

    // The subject TYPE is filtered only when the caller states one. A bare subject id is already
    // unique; over-filtering would silently drop a fact whose grain the caller guessed wrong.
    if (query.subjectEntityType) q = q.eq("subject_entity_type", query.subjectEntityType);
    if (query.factKind) q = q.eq("fact_kind", query.factKind);

    const { data, error } = await q;
    if (error) {
        /*
         * A MISSING TABLE IS NOT A HEALTH ANSWER.
         *
         * H1 has not been applied to every environment, and a card that rendered "no allergies"
         * because the table does not exist would be the most dangerous possible failure mode. The
         * caller gets the throw and must state that health is unavailable.
         */
        throw new Error(`health facts unavailable: ${error.message}`);
    }
    return (data ?? []) as unknown as PersonHealthFactRow[];
}

/**
 * The correction lineage behind one fact, oldest first.
 *
 * Provenance is a first-class read: "who said so, and what did this replace" is the question an
 * operator asks when a health fact surprises them, and the answer is already in the rows.
 */
export async function resolveHealthFactLineage(
    supabase: SupabaseClient,
    orgId: string,
    factId: string,
    access: HealthAccessSubject,
): Promise<PersonHealthFactRow[]> {
    // Provenance is health data too — the lineage carries every prior payload.
    assertHealthAccess(access, HEALTH_VIEW_PERMISSION);
    const lineage: PersonHealthFactRow[] = [];
    let cursor: string | null = (factId ?? "").trim() || null;
    // Bounded: a lineage longer than this is a data defect, and following it forever would hang the
    // read rather than surface the defect.
    for (let hops = 0; cursor && hops < 50; hops += 1) {
        const { data, error } = await supabase
            .from(PERSON_HEALTH_FACTS_TABLE)
            .select(PERSON_HEALTH_FACT_SELECT)
            .eq("org_id", orgId)
            .eq("id", cursor)
            .maybeSingle();
        if (error) throw new Error(`health fact lineage unavailable: ${error.message}`);
        const row = (data ?? null) as unknown as PersonHealthFactRow | null;
        if (!row) break;
        lineage.unshift(row);
        cursor = row.supersedes_id;
    }
    return lineage;
}
