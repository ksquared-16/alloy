/**
 * Minimal placement side-effect when child lifecycle becomes waitlisted (Card 10).
 * Idempotent — does not delete candidates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { __testing as backfillTesting } from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";
import { syncPlacementCandidateFromOcm } from "@/lib/orchestration/placement/syncPlacementCandidateFromOcm";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { resolvePlacementCandidateSiteId } from "@/lib/orchestration/placement/resolvePlacementCandidateSiteId";
import { resolvePlacementCandidateCohortFromMember } from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";

const { buildCandidateRowsForOpportunity, normalizeOcmRow } = backfillTesting;

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | null {
    const v = meta?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Create the placement candidate for a newly-waitlisted child from PROCESS-INSTANCE / child-subject
 * scope — no OCM required. Facts come from the child's enrollment process instance metadata (program /
 * site / room / start), with the opportunity as fallback for site/customer. Idempotent by seed_key.
 * The runtime path (outcome executor) uses this; the OCM-reading hook below remains for legacy data.
 */
export async function ensurePlacementCandidateForWaitlistedChildBySubject(
    supabase: SupabaseClient,
    params: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<EnsurePlacementCandidateHookResult> {
    if (!isPlacementLifecycleCandidateHookEnabled()) {
        return { attempted: false, created: false, skipped_reason: "hook_disabled" };
    }
    const { orgId, opportunityId, customerMemberId } = params;

    const { data: opp } = await supabase
        .from("opportunities")
        .select("id, customer_id, location_id, status_key, created_at, metadata")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!opp) return { attempted: true, created: false, skipped_reason: "opportunity_not_found" };

    // Child enrollment process instance (subject = customer_member, context = opportunity) — the fact source.
    const { data: pi } = await supabase
        .from("process_instances")
        .select("id, metadata, stage_entered_at")
        .eq("org_id", orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", opportunityId)
        .eq("subject_id", customerMemberId)
        .maybeSingle();
    const piId = (pi as { id?: string } | null)?.id ?? null;
    const facts = ((pi as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    // Wait-since is the Waitlist stage clock — not opportunity created_at (lead age).
    const stageEnteredAt =
        typeof (pi as { stage_entered_at?: string | null } | null)?.stage_entered_at === "string"
            ? String((pi as { stage_entered_at: string }).stage_entered_at).trim() || null
            : null;
    const waitSinceIso = stageEnteredAt ?? new Date().toISOString();

    const { data: cm } = await supabase
        .from("customer_members")
        .select("id, person_id, dob")
        .eq("id", customerMemberId)
        .eq("org_id", orgId)
        .maybeSingle();
    const personId = (cm as { person_id?: string | null } | null)?.person_id ?? null;
    const dob = (cm as { dob?: string | null } | null)?.dob ?? null;

    // Resolve program key (for cohort resolution) from the program category, best-effort.
    const programCategoryId = metaStr(facts, "program_category_id");
    let programKey: string | null = null;
    if (programCategoryId) {
        const { data: cat } = await supabase.from("location_program_categories").select("key").eq("org_id", orgId).eq("id", programCategoryId).maybeSingle();
        programKey = (cat as { key?: string | null } | null)?.key ?? null;
    }

    const site = resolvePlacementCandidateSiteId({
        ocmLocationId: metaStr(facts, "location_id"),
        opportunityLocationId: (opp as { location_id?: string | null }).location_id ?? null,
    });
    const cohort = resolvePlacementCandidateCohortFromMember({
        programKey,
        programRoomCohortKey: metaStr(facts, "program_room_cohort_key"),
        dateOfBirth: dob,
    });
    const seedKey = `pc_v1_pi:${opportunityId}:${customerMemberId}:${cohort.program_room_cohort_key || "unknown_program_room"}`;

    const { data: existing } = await supabase.from("placement_candidates").select("id").eq("org_id", orgId).eq("seed_key", seedKey).maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        return { attempted: true, created: false, skipped_reason: "already_exists" };
    }

    const row = {
        org_id: orgId,
        opportunity_id: opportunityId,
        customer_id: (opp as { customer_id?: string | null }).customer_id ?? null,
        opportunity_customer_member_id: null, // no OCM dependency
        customer_member_id: customerMemberId,
        person_id: personId,
        site_id: site.site_id,
        is_synthetic_fallback: false,
        program_room_cohort_key: cohort.program_room_cohort_key,
        program_room_group_label: cohort.program_room_group_label,
        wait_since: waitSinceIso,
        start_date: metaStr(facts, "start_date"),
        status: "active",
        seed_key: seedKey,
        metadata: {
            source: "process_instance_waitlist",
            process_instance_id: piId,
            cohort_resolution: cohort,
            site_resolution: site,
        },
    };
    const { error: insErr } = await supabase.from("placement_candidates").insert(row);
    if (insErr) return { attempted: true, created: false, skipped_reason: insErr.message };
    return { attempted: true, created: true };
}

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
            "id, customer_member_id, outcome_status_key, start_date, program_category_id, location_program_categories(key), location_id, program_room_cohort_key, metadata, customer_members(person_id, display_name, metadata, persons(date_of_birth))"
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

    // The child's durable state now lives on process_instances, so OCM.outcome_status_key is no longer
    // written. This hook is invoked precisely when a child transitions to waitlisted, so assert that
    // status for candidate eligibility (otherwise the row reads as not-waitlist and no candidate is made).
    const waitlistedOcmRow = { ...(ocmData as Record<string, unknown>), outcome_status_key: "waitlisted" };
    const planned = buildCandidateRowsForOpportunity(
        opp as Parameters<typeof buildCandidateRowsForOpportunity>[0],
        [normalizeOcmRow(waitlistedOcmRow)],
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
