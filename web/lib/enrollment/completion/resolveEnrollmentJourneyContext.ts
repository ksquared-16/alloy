/**
 * The canonical graph behind one Enrollment journey, resolved once.
 *
 * ```
 *   Process Instance
 *     -> Enrollment Participation   (opportunity_customer_members — the durable Enrollment subject)
 *     -> Child                      (customer_members)
 *     -> Opportunity?               (optional acquisition context)
 * ```
 *
 * Every consumer that needs any part of this reads it from here. Before this, each one reconstructed
 * its own version from `process_instances.context_id` and assumed that id was an Opportunity — which
 * is how a consumer came to write an OCM id into an `opportunity_id` field the moment a second
 * context type existed.
 *
 * ## Absence of acquisition is an ORDINARY result
 *
 * `opportunity_id: null` with `acquisition: "absent"` is a first-class answer, not an error and not
 * something to paper over. A family already known to the school has no acquisition episode and
 * needs none; nothing here fabricates one, and a caller that genuinely requires acquisition context
 * should refuse explicitly rather than invent it.
 *
 * ## Both context shapes are read
 *
 * New journeys anchor to the Participation. Journeys written under the older shape carry an
 * Opportunity in the same pair, and a journey may carry no context at all. All three resolve to the
 * same graph, which is what lets the model converge without a flag day — the difference lives here
 * and nowhere else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    ENROLLMENT_CONTEXT_TYPE,
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
} from "@/lib/process/processInstances";
import {
    TERMINAL_CHILD_STATUS_KEYS,
    isReusableActiveParticipationStatus,
} from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

/** The durable Enrollment subject. Named once so every query here reads the same table. */
const PARTICIPATION_TABLE = "opportunity_customer_members" as const;

export type EnrollmentJourneyContext = {
    readonly processInstanceId: string;
    /** The durable Enrollment subject. Null only when none could be resolved. */
    readonly participationId: string | null;
    readonly customerMemberId: string | null;
    /** Optional acquisition context. */
    readonly opportunityId: string | null;
    readonly acquisition: "present" | "absent";
    /** How the participation was reached — for diagnostics, never for behaviour. */
    readonly resolvedVia: "participation_context" | "opportunity_context" | "subject_lookup" | "unresolved";
};

type InstanceRow = {
    id: string;
    subject_id: string | null;
    context_type: string | null;
    context_id: string | null;
};

/** The active (non-concluded) participation for a child, preferring an acquisition-backed one. */
async function participationForSubject(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    opportunityId: string | null,
): Promise<{ id: string; opportunity_id: string | null } | null> {
    const { data } = await supabase
        .from(PARTICIPATION_TABLE)
        .select("id, opportunity_id, outcome_status_key")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId);
    const rows = (data ?? []) as { id: string; opportunity_id: string | null; outcome_status_key: string | null }[];
    const active = rows.filter((r) => !TERMINAL_CHILD_STATUS_KEYS.includes(String(r.outcome_status_key ?? "")));
    if (opportunityId) {
        const matched = active.find((r) => r.opportunity_id === opportunityId);
        if (matched) return matched;
    }

    /*
     * ── WHY THIS ASKS A DIFFERENT QUESTION FROM START ENROLLMENT ──
     *
     * Start Enrollment asks "may a NEW journey reuse this participation?" and must answer no once
     * the episode concluded, `enrolled` included. This asks "which participation is an EXISTING
     * journey about?", and the honest answer for a journey that just enrolled is its own
     * participation — which is now concluded.
     *
     * So concluded rows stay eligible here and are merely DEPRIORITIZED. Filtering them out would
     * return null for every completed journey, and the caller reads that as "no subject": the
     * operational handoff that runs immediately after the enrolled write resolves its facts through
     * this function, and would have found nothing at the exact moment it had the most to do.
     *
     * The ordering matters now that a child can legitimately hold two context-free participations —
     * last year's `enrolled` one and this year's active one. Preferring the reusable-active row
     * makes that deterministic; before, it was whichever the database happened to return first.
     */
    const preferred =
        active.find((r) => r.opportunity_id === null && isReusableActiveParticipationStatus(r.outcome_status_key))
        ?? active.find((r) => r.opportunity_id === null)
        ?? active.find((r) => isReusableActiveParticipationStatus(r.outcome_status_key))
        ?? active[0]
        ?? null;
    return preferred;
}

export async function resolveEnrollmentJourneyContext(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly processInstance: InstanceRow },
): Promise<EnrollmentJourneyContext> {
    const pi = input.processInstance;
    const contextType = (pi.context_type ?? "").trim();
    const contextId = (pi.context_id ?? "").trim() || null;
    const subjectId = (pi.subject_id ?? "").trim() || null;

    const absent = (over: Partial<EnrollmentJourneyContext> = {}): EnrollmentJourneyContext => ({
        processInstanceId: pi.id,
        participationId: null,
        customerMemberId: subjectId,
        opportunityId: null,
        acquisition: "absent",
        resolvedVia: "unresolved",
        ...over,
    });

    // The current shape: the context IS the participation.
    if (contextType === ENROLLMENT_PARTICIPATION_CONTEXT_TYPE && contextId) {
        const { data } = await supabase
            .from(PARTICIPATION_TABLE)
            .select("id, customer_member_id, opportunity_id")
            .eq("org_id", input.orgId)
            .eq("id", contextId)
            .maybeSingle();
        const row = data as { id: string; customer_member_id: string; opportunity_id: string | null } | null;
        if (!row) return absent();
        return {
            processInstanceId: pi.id,
            participationId: row.id,
            customerMemberId: row.customer_member_id,
            opportunityId: row.opportunity_id,
            acquisition: row.opportunity_id ? "present" : "absent",
            resolvedVia: "participation_context",
        };
    }

    if (!subjectId) return absent();

    /*
     * The older shape, still read: the context is an Opportunity. The participation is the one
     * joining THIS child to THAT episode, which is exactly the identity the unique constraint
     * already guarantees.
     */
    if (contextType === ENROLLMENT_CONTEXT_TYPE && contextId) {
        const participation = await participationForSubject(supabase, input.orgId, subjectId, contextId);
        return {
            processInstanceId: pi.id,
            participationId: participation?.id ?? null,
            customerMemberId: subjectId,
            opportunityId: contextId,
            acquisition: "present",
            resolvedVia: "opportunity_context",
        };
    }

    // No context at all — resolve the child's active episode. Absence of acquisition is ordinary.
    const participation = await participationForSubject(supabase, input.orgId, subjectId, null);
    if (!participation) return absent({ resolvedVia: "subject_lookup" });
    return {
        processInstanceId: pi.id,
        participationId: participation.id,
        customerMemberId: subjectId,
        opportunityId: participation.opportunity_id,
        acquisition: participation.opportunity_id ? "present" : "absent",
        resolvedVia: "subject_lookup",
    };
}

/**
 * The context ids that reach an Enrollment journey belonging to any of these Opportunities.
 *
 * Every consumer that asks "which journeys belong to this Opportunity?" needs the same widening,
 * because a journey now anchors to the child's Enrollment Participation and the Opportunity id no
 * longer appears in `process_instances.context_id` at all. Written once here rather than at each
 * call site: the failure it prevents is a query that returns FEWER rows and no error, which is the
 * kind of defect that survives review precisely because nothing looks wrong.
 *
 * The Opportunity ids are included in the result, so journeys under the older anchor keep matching
 * and no backfill has to land first.
 */
export async function enrollmentContextIdsForOpportunities(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: readonly string[],
): Promise<{
    /** Every context id to match on — Opportunity ids and participation ids together. */
    readonly contextIds: string[];
    /** Participation id -> its Opportunity, for mapping a matched journey back. */
    readonly opportunityIdByContextId: Map<string, string>;
}> {
    const ids = [...new Set(opportunityIds.map((id) => (id ?? "").trim()).filter(Boolean))];
    const opportunityIdByContextId = new Map<string, string>();
    if (!ids.length) return { contextIds: [], opportunityIdByContextId };

    const { data, error } = await supabase
        .from(PARTICIPATION_TABLE)
        .select("id, opportunity_id")
        .eq("org_id", orgId)
        .in("opportunity_id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { id: string; opportunity_id: string | null }[]) {
        if (row.opportunity_id) opportunityIdByContextId.set(String(row.id), String(row.opportunity_id));
    }
    return { contextIds: [...ids, ...opportunityIdByContextId.keys()], opportunityIdByContextId };
}

/**
 * The Opportunity behind each of these journeys, in one query.
 *
 * The mirror of {@link enrollmentContextIdsForOpportunities}: that one starts from Opportunities and
 * widens to the journeys, this one starts from journeys and resolves back. Consumers that already
 * hold process rows want this direction, and resolving each row through
 * {@link resolveEnrollmentJourneyContext} would turn one question into a query per child.
 *
 * A context id that is already an Opportunity id simply finds no participation and is returned
 * mapped to itself, so callers need no special case for the older anchor.
 */
export async function opportunityIdsForEnrollmentContexts(
    supabase: SupabaseClient,
    orgId: string,
    rows: readonly { context_type?: string | null; context_id?: string | null }[],
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const participationIds = new Set<string>();
    for (const row of rows) {
        const contextId = (row.context_id ?? "").trim();
        if (!contextId) continue;
        const contextType = (row.context_type ?? "").trim();
        if (contextType === ENROLLMENT_CONTEXT_TYPE) out.set(contextId, contextId);
        else if (contextType === ENROLLMENT_PARTICIPATION_CONTEXT_TYPE) participationIds.add(contextId);
    }
    if (!participationIds.size) return out;

    const { data, error } = await supabase
        .from(PARTICIPATION_TABLE)
        .select("id, opportunity_id")
        .eq("org_id", orgId)
        .in("id", [...participationIds]);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { id: string; opportunity_id: string | null }[]) {
        // A context-free participation has no Opportunity, and is deliberately absent from the map
        // rather than present with a null — a caller must not be handed an empty string to query on.
        if (row.opportunity_id) out.set(String(row.id), String(row.opportunity_id));
    }
    return out;
}
