/**
 * Ensure a household child has an opportunity_customer_members participation row.
 * Shared by relationship actions and related-subject Waitlist resolution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";

export async function ensureOpportunityCustomerMemberParticipation(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    customerMemberId: string;
    /** Audit/source stamp in OCM metadata when inserting. */
    source?: string;
}): Promise<{ ocmId: string; created: boolean }> {
    const opportunityId = params.opportunityId.trim();
    const customerMemberId = params.customerMemberId.trim();
    if (!opportunityId || !customerMemberId) {
        throw new Error("Opportunity and child member are required.");
    }

    const { data: existingOcm } = await params.supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_member_id", customerMemberId)
        .maybeSingle();
    if (existingOcm?.id) return { ocmId: String(existingOcm.id), created: false };

    const { data: inserted, error } = await params.supabase
        .from("opportunity_customer_members")
        .insert({
            org_id: params.orgId,
            opportunity_id: opportunityId,
            customer_member_id: customerMemberId,
            outcome_status_key: NEW_LEAD_STATUS_KEY,
            metadata: { source: params.source ?? "eligible_enrollment_children" },
        })
        .select("id")
        .single();

    if (error?.code === "23505") {
        const { data: retry } = await params.supabase
            .from("opportunity_customer_members")
            .select("id")
            .eq("org_id", params.orgId)
            .eq("opportunity_id", opportunityId)
            .eq("customer_member_id", customerMemberId)
            .maybeSingle();
        if (retry?.id) return { ocmId: String(retry.id), created: false };
    }
    if (error || !inserted?.id) {
        throw new Error(error?.message ?? "Could not link child to this enrollment.");
    }
    return { ocmId: String(inserted.id), created: true };
}
