/**
 * Card 5.4 — operational activity for manual waitlist position adjustments.
 * Emits workflow_events on opportunity (not on queue refresh / re-eval).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";

export const OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_CREATED = "opportunity_waitlist_manual_adjustment_created";
export const OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_UPDATED = "opportunity_waitlist_manual_adjustment_updated";
export const OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_RELEASED = "opportunity_waitlist_manual_adjustment_released";

export type ManualOrderActivityAction = "created" | "updated" | "released";
export type ManualOrderMoveDirection = "up" | "down";

export type EmitPlacementManualOrderActivityInput = {
    orgId: string;
    actorUserId: string;
    placementCandidateId: string;
    placementOverrideId: string;
    action: ManualOrderActivityAction;
    reason: string;
    direction?: ManualOrderMoveDirection | null;
    pinOrdinal?: number | null;
};

type CandidateActivityRow = {
    id: string;
    opportunity_id: string;
    program_room_cohort_key: string;
    program_room_group_label: string | null;
    customer_members: { display_name: string | null } | null;
    opportunity_customer_members: {
        customer_members: { display_name: string | null } | null;
    } | null;
};

async function loadCandidateActivityContext(
    supabase: SupabaseClient,
    orgId: string,
    placementCandidateId: string
): Promise<CandidateActivityRow | null> {
    const { data, error } = await supabase
        .from("placement_candidates")
        .select(
            `
            id,
            opportunity_id,
            program_room_cohort_key,
            program_room_group_label,
            customer_members (display_name),
            opportunity_customer_members (customer_members (display_name))
        `
        )
        .eq("org_id", orgId)
        .eq("id", placementCandidateId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CandidateActivityRow | null) ?? null;
}

export function buildManualOrderActivitySummary(input: {
    action: ManualOrderActivityAction;
    childDisplayName: string;
    cohortLabel: string;
    direction?: ManualOrderMoveDirection | null;
}): string {
    const child = input.childDisplayName.trim() || "Child";
    const cohort = input.cohortLabel.trim() || "waitlist";
    if (input.action === "released") {
        return `${child} returned to policy-based ordering.`;
    }
    const movePhrase =
        input.direction === "up"
            ? "moved higher"
            : input.direction === "down"
              ? "moved lower"
              : input.action === "updated"
                ? "waitlist position adjusted"
                : "waitlist position manually adjusted";
    return `${child} ${movePhrase} within ${cohort} waitlist.`;
}

function eventTypeForAction(action: ManualOrderActivityAction): string {
    switch (action) {
        case "created":
            return OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_CREATED;
        case "updated":
            return OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_UPDATED;
        case "released":
            return OPPORTUNITY_WAITLIST_MANUAL_ADJUSTMENT_RELEASED;
    }
}

/** Emit one workflow_events row for a manual waitlist adjustment mutation. */
export async function emitPlacementManualOrderActivity(
    supabase: SupabaseClient,
    input: EmitPlacementManualOrderActivityInput
): Promise<void> {
    const candidate = await loadCandidateActivityContext(supabase, input.orgId, input.placementCandidateId);
    if (!candidate?.opportunity_id) return;

    const { cohortLabel } = normalizePlacementWaitlistCohort(
        candidate.program_room_cohort_key,
        candidate.program_room_group_label
    );
    const childDisplayName =
        candidate.opportunity_customer_members?.customer_members?.display_name?.trim() ||
        candidate.customer_members?.display_name?.trim() ||
        "Child";

    const summary = buildManualOrderActivitySummary({
        action: input.action,
        childDisplayName,
        cohortLabel,
        direction: input.direction,
    });

    const occurredAt = new Date().toISOString();
    await emitEvent({
        org_id: input.orgId,
        event_type: eventTypeForAction(input.action),
        entity_type: "opportunities",
        entity_id: candidate.opportunity_id,
        occurred_at: occurredAt,
        payload: {
            org_id: input.orgId,
            opportunity_id: candidate.opportunity_id,
            placement_candidate_id: input.placementCandidateId,
            placement_override_id: input.placementOverrideId,
            program_room_cohort_key: candidate.program_room_cohort_key,
            cohort_label: cohortLabel,
            child_display_name: childDisplayName,
            action: input.action,
            direction: input.direction ?? null,
            pin_ordinal: input.pinOrdinal ?? null,
            reason: input.reason.trim(),
            actor_user_id: input.actorUserId,
            summary,
        },
    });
}

/** Best-effort emit — never fail the override mutation. */
export async function emitPlacementManualOrderActivitySafe(
    supabase: SupabaseClient,
    input: EmitPlacementManualOrderActivityInput
): Promise<void> {
    try {
        await emitPlacementManualOrderActivity(supabase, input);
    } catch (e) {
        console.error("[placement] emitPlacementManualOrderActivity", e);
    }
}
