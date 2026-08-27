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
import { TERMINAL_CHILD_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

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
        .from("opportunity_customer_members")
        .select("id, opportunity_id, outcome_status_key")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId);
    const rows = (data ?? []) as { id: string; opportunity_id: string | null; outcome_status_key: string | null }[];
    const active = rows.filter((r) => !TERMINAL_CHILD_STATUS_KEYS.includes(String(r.outcome_status_key ?? "")));
    if (opportunityId) {
        const matched = active.find((r) => r.opportunity_id === opportunityId);
        if (matched) return matched;
    }
    // No acquisition context to match: the context-free episode is the journey's subject.
    return active.find((r) => r.opportunity_id === null) ?? active[0] ?? null;
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
            .from("opportunity_customer_members")
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
