/**
 * Child lifecycle status change event — distinct from opportunity_status_changed (Card 10).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";

export const CHILD_LIFECYCLE_STATUS_CHANGED_EVENT = "child_lifecycle_status_changed" as const;

export type EmitChildLifecycleStatusChangedEventParams = {
    supabase: SupabaseClient;
    orgId: string;
    /**
     * Acquisition context, when there is any. NULL for a context-free Enrollment Participation —
     * the event is keyed on the participation itself (`entity_id`), never on the Opportunity, so a
     * child enrolling without an acquisition episode still emits a first-class lifecycle event.
     */
    opportunityId: string | null;
    opportunityCustomerMemberId: string;
    previousStatusKey: string | null;
    nextStatusKey: string | null;
    actorUserId?: string | null;
    source?: string | null;
    reason?: string | null;
    rowGrain?: "child" | "candidate" | "case" | null;
    placementCandidateId?: string | null;
    /** Operator-facing child identity for Activity copy (e.g. "Wrigley Kurzman"). */
    childDisplayName?: string | null;
    metadata?: Record<string, unknown>;
};

export type ChildLifecycleWorkflowEventRow = {
    id: string;
    org_id: string;
    event_type: string;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
    occurred_at: string;
};

function normalizeKey(raw: unknown): string | null {
    if (raw == null || raw === "") return null;
    const t = String(raw).trim();
    return t || null;
}

/** Emits `child_lifecycle_status_changed` when trimmed previous !== next. */
export async function emitChildLifecycleStatusChangedEvent(
    params: EmitChildLifecycleStatusChangedEventParams
): Promise<ChildLifecycleWorkflowEventRow | null> {
    const previous = normalizeKey(params.previousStatusKey);
    const next = normalizeKey(params.nextStatusKey);
    if (previous === next) return null;

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
        opportunity_id: params.opportunityId ?? null,
        opportunity_customer_member_id: params.opportunityCustomerMemberId,
        previous_status_key: previous,
        next_status_key: next,
        changed_at: now,
        ...(params.source ? { source: params.source } : {}),
        ...(params.reason ? { reason: params.reason } : {}),
        ...(params.rowGrain ? { row_grain: params.rowGrain } : {}),
        ...(params.placementCandidateId ? { placement_candidate_id: params.placementCandidateId } : {}),
        ...(params.childDisplayName && String(params.childDisplayName).trim()
            ? { child_display_name: String(params.childDisplayName).trim() }
            : {}),
        ...(params.metadata ?? {}),
    };
    if (params.actorUserId != null && String(params.actorUserId).trim() !== "") {
        payload.actor_user_id = String(params.actorUserId).trim();
    }

    const id = await emitEvent({
        org_id: params.orgId,
        event_type: CHILD_LIFECYCLE_STATUS_CHANGED_EVENT,
        entity_type: "opportunity_customer_members",
        entity_id: params.opportunityCustomerMemberId,
        action_type: null,
        occurred_at: now,
        payload,
    });

    const eventPayload: Record<string, unknown> = {
        event_type: CHILD_LIFECYCLE_STATUS_CHANGED_EVENT,
        occurred_at: now,
        org_id: params.orgId,
        entity_type: "opportunity_customer_members",
        entity_id: params.opportunityCustomerMemberId,
        ...payload,
    };

    let wq = params.supabase
        .from("workflows")
        .select("id")
        .eq("enabled", true)
        .eq("event_type", CHILD_LIFECYCLE_STATUS_CHANGED_EVENT)
        .eq("entity_type", "opportunity_customer_members");
    wq = wq.or(`org_id.eq.${params.orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(params.supabase, (wf as { id: string }).id, eventPayload, {
                event_id: id,
                org_id: params.orgId,
            });
        } catch (e) {
            console.warn(
                "[emitChildLifecycleStatusChangedEvent] executeWorkflowRun",
                (wf as { id: string }).id,
                e instanceof Error ? e.message : e
            );
        }
    }

    return {
        id,
        org_id: params.orgId,
        event_type: CHILD_LIFECYCLE_STATUS_CHANGED_EVENT,
        entity_type: "opportunity_customer_members",
        entity_id: params.opportunityCustomerMemberId,
        payload,
        occurred_at: now,
    };
}
