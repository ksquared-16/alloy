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
 * participations for one child. `uq_ocm_context_free_participation` — a partial unique index over
 * `(org_id, customer_member_id) WHERE opportunity_id IS NULL` — restores the same guarantee for the
 * context-free case, and the lookup below matches it exactly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";

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

    /** Matches whichever uniqueness protects this case — the constraint, or the partial index. */
    const matchParticipation = () => {
        const query = params.supabase
            .from("opportunity_customer_members")
            .select("id")
            .eq("org_id", params.orgId)
            .eq("customer_member_id", customerMemberId);
        return opportunityId ? query.eq("opportunity_id", opportunityId) : query.is("opportunity_id", null);
    };

    const { data: existingOcm } = await matchParticipation().maybeSingle();
    if (existingOcm?.id) return { ocmId: String(existingOcm.id), created: false };

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
        const { data: retry } = await matchParticipation().maybeSingle();
        if (retry?.id) return { ocmId: String(retry.id), created: false };
    }
    if (error || !inserted?.id) {
        throw new Error(error?.message ?? "Could not link child to this enrollment.");
    }
    return { ocmId: String(inserted.id), created: true };
}
