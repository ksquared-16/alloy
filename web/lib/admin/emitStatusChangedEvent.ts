/**
 * Canonical workflow event bridge: emit entity_status_changed into workflow_events
 * when an entity's status_key changes. Used by admin PATCH routes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

    const { data, error } = await supabase
        .from("workflow_events")
        .insert({
            org_id: orgId,
            event_type: eventType,
            entity_type: entityType,
            entity_id: entityId,
            action_type: null,
            payload,
            occurred_at: now,
        })
        .select("id, org_id, event_type, entity_type, entity_id, action_type, payload, occurred_at, created_at")
        .single();

    if (error) {
        throw new Error(`emitStatusChangedEvent: ${error.message}`);
    }
    if (!data) {
        throw new Error("emitStatusChangedEvent: no row returned");
    }
    return data as WorkflowEventRow;
}
