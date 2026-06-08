/**
 * Canonical path for updating OCM child lifecycle (`outcome_status_key`) with audit/event parity (Card 10).
 * Does not mutate opportunities.status_key or delete placement candidates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { INQUIRY_CHILD_ENTITY_TYPE } from "@/lib/fields/inquiryChildFieldRegistry";
import { emitChildLifecycleStatusChangedEvent } from "@/lib/opportunities/emitChildLifecycleStatusChangedEvent";
import { ensurePlacementCandidateForWaitlistedChild } from "@/lib/orchestration/placement/placementCandidateLifecycleHook";

export type UpdateOpportunityCustomerMemberLifecycleStatusParams = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    opportunityCustomerMemberId: string;
    nextStatusKey: string | null;
    /** When omitted, loads current outcome_status_key from DB. */
    previousStatusKey?: string | null;
    actorUserId?: string | null;
    reason?: string | null;
    source?: string | null;
    rowGrain?: "child" | "candidate" | "case" | null;
    placementCandidateId?: string | null;
    metadata?: Record<string, unknown>;
    /** When false, skip waitlisted placement candidate hook. Default true. */
    runPlacementHook?: boolean;
};

export type OpportunityCustomerMemberLifecycleRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    customer_member_id: string;
    outcome_status_key: string | null;
    updated_at?: string | null;
};

export type UpdateOpportunityCustomerMemberLifecycleStatusResult =
    | {
          error: null;
          before: { outcome_status_key: string | null };
          after: OpportunityCustomerMemberLifecycleRow;
          eventEmitted: boolean;
          placementHook?: { attempted: boolean; created: boolean; skipped_reason?: string };
      }
    | { error: { message: string } };

function normalizeKey(raw: unknown): string | null {
    if (raw == null || raw === "") return null;
    const t = String(raw).trim();
    return t || null;
}

export async function updateOpportunityCustomerMemberLifecycleStatus(
    params: UpdateOpportunityCustomerMemberLifecycleStatusParams
): Promise<UpdateOpportunityCustomerMemberLifecycleStatusResult> {
    const {
        supabase,
        orgId,
        opportunityId,
        opportunityCustomerMemberId,
        nextStatusKey,
        actorUserId,
        reason,
        source,
        rowGrain,
        placementCandidateId,
        metadata,
    } = params;

    const ocmId = opportunityCustomerMemberId.trim();
    const oppId = opportunityId.trim();
    if (!orgId.trim() || !ocmId || !oppId) {
        return { error: { message: "orgId, opportunityId, and opportunityCustomerMemberId are required" } };
    }

    const { data: existing, error: loadErr } = await supabase
        .from("opportunity_customer_members")
        .select("id, org_id, opportunity_id, customer_member_id, outcome_status_key, updated_at")
        .eq("id", ocmId)
        .eq("org_id", orgId)
        .eq("opportunity_id", oppId)
        .maybeSingle();

    if (loadErr) return { error: { message: loadErr.message } };
    if (!existing) {
        return { error: { message: "Opportunity customer member not found for org/opportunity scope" } };
    }

    let previous: string | null;
    if (!Object.prototype.hasOwnProperty.call(params, "previousStatusKey")) {
        previous = normalizeKey((existing as { outcome_status_key?: unknown }).outcome_status_key);
    } else {
        previous = normalizeKey(params.previousStatusKey);
    }

    const next = normalizeKey(nextStatusKey);
    if (next) {
        const chk = await assertAllowedStatusKey(
            supabase,
            orgId,
            "opportunity_customer_members",
            next
        );
        if (!chk.ok) return { error: { message: chk.message } };
    }

    const { data: updated, error: upErr } = await supabase
        .from("opportunity_customer_members")
        .update({ outcome_status_key: next })
        .eq("id", ocmId)
        .eq("org_id", orgId)
        .eq("opportunity_id", oppId)
        .select("id, org_id, opportunity_id, customer_member_id, outcome_status_key, updated_at")
        .single();

    if (upErr || !updated) {
        return { error: { message: upErr?.message ?? "Update failed" } };
    }

    let eventEmitted = false;
    try {
        const ev = await emitChildLifecycleStatusChangedEvent({
            supabase,
            orgId,
            opportunityId: oppId,
            opportunityCustomerMemberId: ocmId,
            previousStatusKey: previous,
            nextStatusKey: next,
            actorUserId,
            source,
            reason,
            rowGrain,
            placementCandidateId,
            metadata,
        });
        eventEmitted = ev != null;
    } catch (e) {
        console.error("[updateOpportunityCustomerMemberLifecycleStatus] emitChildLifecycleStatusChangedEvent", e);
    }

    let placementHook: { attempted: boolean; created: boolean; skipped_reason?: string } | undefined;
    if (params.runPlacementHook !== false && next === "waitlisted" && previous !== "waitlisted") {
        try {
            placementHook = await ensurePlacementCandidateForWaitlistedChild(supabase, {
                orgId,
                opportunityId: oppId,
                opportunityCustomerMemberId: ocmId,
            });
        } catch (e) {
            console.warn(
                "[updateOpportunityCustomerMemberLifecycleStatus] placement hook",
                e instanceof Error ? e.message : e
            );
        }
    }

    return {
        error: null,
        before: { outcome_status_key: previous },
        after: updated as OpportunityCustomerMemberLifecycleRow,
        eventEmitted,
        placementHook,
    };
}

/** Entity type string for status_definitions / activity (matches inquiry child registry). */
export const CHILD_LIFECYCLE_STATUS_ENTITY_TYPE = INQUIRY_CHILD_ENTITY_TYPE;
