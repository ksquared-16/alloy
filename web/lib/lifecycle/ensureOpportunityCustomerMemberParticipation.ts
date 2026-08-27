/**
 * Ensure a child has an ENROLLMENT PARTICIPATION row (`opportunity_customer_members`).
 *
 * Shared by relationship actions, related-subject Waitlist resolution, and Start Enrollment.
 *
 * ## An acquisition Opportunity is optional context, not identity
 *
 * The participation is the durable subject of Enrollment — it owns the child's Enrollment state
 * (`outcome_status_key`: waitlisted / enrolling / enrolled / withdrawn / not_enrolling). A family
 * already known to the school enrolling a second child has no acquisition episode and needs none,
 * and Start Enrollment deliberately refuses to manufacture one. So `opportunityId` may be omitted,
 * and the row is written with `opportunity_id = null`.
 *
 * ## Idempotency differs by case, and the difference is the whole point
 *
 * With an opportunity, identity is the existing unique constraint
 * `(org_id, opportunity_id, customer_member_id)`. Without one that constraint cannot help: Postgres
 * treats NULLs as DISTINCT in a unique index, so it would silently permit unlimited duplicate
 * participations for one child.
 *
 * The context-free replacement is scoped to the EPISODE, because that is what a participation is —
 * 600 children in the certification tenant hold two of them and 600 hold three, each carrying its
 * own `start_date`, `stage_key` and `outcome_status_key`. So `uq_ocm_active_context_free_participation`
 * constrains one ACTIVE context-free participation per child, and a concluded episode
 * (`withdrawn` / `not_enrolling`, the child track's own `terminal` statuses) releases the slot.
 * The lookup below matches that index exactly: reusing a CONCLUDED participation would hand a new
 * journey the previous episode's outcome.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { TERMINAL_CHILD_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

export async function ensureOpportunityCustomerMemberParticipation(params: {
    supabase: SupabaseClient;
    orgId: string;
    /** Acquisition context. Omit for a legitimate context-free Enrollment Participation. */
    opportunityId?: string | null;
    customerMemberId: string;
    /** Audit/source stamp in OCM metadata when inserting. */
    source?: string;
    /** Initial child Enrollment state. Defaults to the historical lead status. */
    outcomeStatusKey?: string;
}): Promise<{ ocmId: string; created: boolean }> {
    const opportunityId = (params.opportunityId ?? "").trim() || null;
    const customerMemberId = params.customerMemberId.trim();
    if (!customerMemberId) {
        throw new Error("Child member is required.");
    }

    /**
     * Matches whichever uniqueness protects this case — the constraint, or the partial index.
     *
     * The context-free branch selects and filters in code rather than composing a `not.in` filter:
     * the terminal set has an owner (`TERMINAL_CHILD_STATUS_KEYS`) and reusing it keeps one
     * vocabulary, where a hand-written PostgREST predicate would be a second copy of it.
     */
    async function findParticipation(): Promise<string | null> {
        if (opportunityId) {
            const { data } = await params.supabase
                .from("opportunity_customer_members")
                .select("id")
                .eq("org_id", params.orgId)
                .eq("customer_member_id", customerMemberId)
                .eq("opportunity_id", opportunityId)
                .maybeSingle();
            return data?.id ? String(data.id) : null;
        }
        const { data } = await params.supabase
            .from("opportunity_customer_members")
            .select("id, opportunity_id, outcome_status_key")
            .eq("org_id", params.orgId)
            .eq("customer_member_id", customerMemberId);
        const rows = (data ?? []) as { id: string; opportunity_id: string | null; outcome_status_key: string | null }[];
        // Only an ACTIVE context-free episode may be reused. A concluded one is history, and
        // returning it would start a new journey already holding the previous episode's outcome.
        const active = rows.find(
            (r) => r.opportunity_id === null && !TERMINAL_CHILD_STATUS_KEYS.includes(String(r.outcome_status_key ?? "")),
        );
        return active?.id ? String(active.id) : null;
    }

    const existingId = await findParticipation();
    if (existingId) return { ocmId: existingId, created: false };

    const { data: inserted, error } = await params.supabase
        .from("opportunity_customer_members")
        .insert({
            org_id: params.orgId,
            opportunity_id: opportunityId,
            customer_member_id: customerMemberId,
            outcome_status_key: params.outcomeStatusKey ?? NEW_LEAD_STATUS_KEY,
            metadata: { source: params.source ?? "eligible_enrollment_children" },
        })
        .select("id")
        .single();

    if (error?.code === "23505") {
        const retryId = await findParticipation();
        if (retryId) return { ocmId: retryId, created: false };
    }
    if (error || !inserted?.id) {
        throw new Error(error?.message ?? "Could not link child to this enrollment.");
    }
    return { ocmId: String(inserted.id), created: true };
}
