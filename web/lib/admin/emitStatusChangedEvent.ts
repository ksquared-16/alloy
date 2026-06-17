/**
 * When an entity's status_key changes: inserts `workflow_events` via `emitEvent`, then runs
 * enabled workflows matching `event_type` + `entity_type` (org or global) with `executeWorkflowRun`
 * and `event_id` set (same pattern as schedule assign / action-link consume).
 *
 * Opportunity rows use `opportunity_status_changed`; all other entity types use `entity_status_changed`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { applyConfiguredStageRulesForStatusEntry } from "@/lib/lifecycle/applyConfiguredStageAutomationRules";
import { onStageEntrySpawnWorkIntentFromOpportunityStatusChange } from "@/lib/lifecycle/onStageEntrySpawnWorkIntent";
import { executeWorkflowRun } from "@/lib/workflowRun";

export type EmitStatusChangedEventParams = {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    entityId: string;
    oldStatusKey: string | null;
    newStatusKey: string | null;
    metadata?: Record<string, unknown>;
    /** Staff user who performed the change (Activity Log actor). */
    actorUserId?: string | null;
};

export type WorkflowEventRow = {
    id: string;
    org_id: string;
    event_type: string;
    entity_type: string | null;
    entity_id: string | null;
    action_type: string | null;
    payload: Record<string, unknown>;
    occurred_at: string;
    created_at?: string | null;
};

/**
 * If oldStatusKey === newStatusKey, no-op and return null.
 * Otherwise insert workflow_events row and return it. Throws on insert failure.
 */
export async function emitStatusChangedEvent(params: EmitStatusChangedEventParams): Promise<WorkflowEventRow | null> {
    const { supabase, orgId, entityType, entityId, oldStatusKey, newStatusKey, metadata = {}, actorUserId } = params;

    const oldNorm = oldStatusKey == null ? null : String(oldStatusKey).trim();
    const newNorm = newStatusKey == null ? null : String(newStatusKey).trim();
    if (oldNorm === newNorm) {
        return null;
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
        old_status_key: oldStatusKey,
        new_status_key: newStatusKey,
        changed_at: now,
        ...metadata,
    };
    if (actorUserId != null && String(actorUserId).trim() !== "") {
        payload.actor_user_id = String(actorUserId).trim();
    }

    const eventType =
        String(entityType).trim().toLowerCase() === "opportunities" ? "opportunity_status_changed" : "entity_status_changed";

    if (eventType === "opportunity_status_changed") {
        try {
            await onStageEntrySpawnWorkIntentFromOpportunityStatusChange({
                supabase,
                orgId,
                userId: actorUserId,
                opportunityId: entityId,
                previousStatusKey: oldNorm,
                nextStatusKey: newNorm,
            });
        } catch (e) {
            console.warn(
                "[emitStatusChangedEvent] onStageEntrySpawnWorkIntent",
                e instanceof Error ? e.message : e,
            );
        }
        try {
            await applyConfiguredStageRulesForStatusEntry({
                supabase,
                orgId,
                opportunityId: entityId,
                nextStatusKey: newNorm,
                actorUserId,
            });
        } catch (e) {
            console.warn(
                "[emitStatusChangedEvent] applyConfiguredStageRulesForStatusEntry",
                e instanceof Error ? e.message : e,
            );
        }
    }

    const id = await emitEvent({
        org_id: orgId,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        action_type: null,
        occurred_at: now,
        payload,
    });

    const eventPayload: Record<string, unknown> = {
        event_type: eventType,
        occurred_at: now,
        org_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        ...payload,
    };
    let wq = supabase
        .from("workflows")
        .select("id")
        .eq("enabled", true)
        .eq("event_type", eventType)
        .eq("entity_type", entityType);
    wq = wq.or(`org_id.eq.${orgId},org_id.is.null`);
    const { data: wfs } = await wq;
    for (const wf of wfs ?? []) {
        try {
            await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                event_id: id,
                org_id: orgId,
            });
        } catch (e) {
            console.warn(
                "[emitStatusChangedEvent] executeWorkflowRun",
                (wf as { id: string }).id,
                e instanceof Error ? e.message : e
            );
        }
    }

    return {
        id,
        org_id: orgId,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        action_type: null,
        payload,
        occurred_at: now,
    };
}
