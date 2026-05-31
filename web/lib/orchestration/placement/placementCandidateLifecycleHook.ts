/**
 * Minimal placement side-effect when child lifecycle becomes waitlisted (Card 10).
 * Idempotent — does not delete candidates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { __testing as backfillTesting } from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";
import { syncPlacementCandidateFromOcm } from "@/lib/orchestration/placement/syncPlacementCandidateFromOcm";

const { buildCandidateRowsForOpportunity, normalizeOcmRow } = backfillTesting;

/** `ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED=1` skips candidate ensure on waitlisted transition. */
export function isPlacementLifecycleCandidateHookEnabled(): boolean {
    return process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED !== "1";
}

export type EnsurePlacementCandidateHookResult = {
    attempted: boolean;
    created: boolean;
    skipped_reason?: string;
};

/** Create placement candidate for one OCM when newly waitlisted (idempotent by seed_key). */
export async function ensurePlacementCandidateForWaitlistedChild(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        opportunityId: string;
        opportunityCustomerMemberId: string;
    }
): Promise<EnsurePlacementCandidateHookResult> {
    if (!isPlacementLifecycleCandidateHookEnabled()) {
        return { attempted: false, created: false, skipped_reason: "hook_disabled" };
    }

    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, customer_id, location_id, status_key, created_at, metadata")
        .eq("id", params.opportunityId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (oppErr || !opp) {
        return { attempted: true, created: false, skipped_reason: "opportunity_not_found" };
    }

    const { data: ocmData, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, outcome_status_key, desired_start_date, desired_program_type, location_id, program_room_cohort_key, metadata, customer_members(person_id, display_name, metadata, persons(date_of_birth))"
        )
        .eq("id", params.opportunityCustomerMemberId)
        .eq("org_id", params.orgId)
        .eq("opportunity_id", params.opportunityId)
        .maybeSingle();
    if (ocmErr || !ocmData) {
        return { attempted: true, created: false, skipped_reason: "ocm_not_found" };
    }

    const counts = {
        opportunities_scanned: 0,
        real_candidates_proposed: 0,
        synthetic_candidates_proposed: 0,
        real_candidates_created: 0,
        synthetic_candidates_created: 0,
        skipped_existing: 0,
        skipped_not_waitlist: 0,
        skipped_ineligible_child: 0,
        skipped_synthetic_opp_only_strict: 0,
        compat_opportunity_fallback: 0,
        errors: 0,
    };

    const planned = buildCandidateRowsForOpportunity(
        opp as Parameters<typeof buildCandidateRowsForOpportunity>[0],
        [normalizeOcmRow(ocmData)],
        params.orgId,
        false,
        {
            strictEligibility: process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT === "1",
            counts,
        }
    );
    if (!planned.length) {
        return { attempted: true, created: false, skipped_reason: "not_eligible_for_candidate" };
    }

    const row = planned[0]!;
    const { data: existing } = await supabase
        .from("placement_candidates")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("seed_key", row.seed_key)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        await syncPlacementCandidateFromOcm(supabase, {
            orgId: params.orgId,
            opportunityId: params.opportunityId,
            opportunityCustomerMemberId: params.opportunityCustomerMemberId,
        });
        return { attempted: true, created: false, skipped_reason: "already_exists" };
    }

    const { error: insErr } = await supabase.from("placement_candidates").insert(row);
    if (insErr) {
        return { attempted: true, created: false, skipped_reason: insErr.message };
    }
    return { attempted: true, created: true };
}
