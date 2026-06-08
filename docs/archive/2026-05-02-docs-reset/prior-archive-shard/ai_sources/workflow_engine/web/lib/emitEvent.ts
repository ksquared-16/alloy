/**
 * Canonical event layer: insert into workflow_events and return event id.
 * Server-side only. Use in API routes before creating workflow_runs.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";

export type EmitEventInput = {
    org_id: string | null;
    event_type: string;
    entity_type?: string | null;
    entity_id?: string | null;
    action_type?: string | null;
    occurred_at?: string;
    payload: Record<string, unknown>;
};

/**
 * Insert a row into workflow_events. Returns the inserted id (event_id).
 * Throws on insert error.
 */
export async function emitEvent(input: EmitEventInput): Promise<string> {
    const occurredAt = input.occurred_at ?? new Date().toISOString();
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("workflow_events")
        .insert({
            org_id: input.org_id ?? null,
            event_type: input.event_type,
            entity_type: input.entity_type ?? null,
            entity_id: input.entity_id ?? null,
            action_type: input.action_type ?? null,
            payload: input.payload,
            occurred_at: occurredAt,
        })
        .select("id")
        .single();

    if (error) {
        throw new Error(`emitEvent: ${error.message}`);
    }
    if (!data?.id) {
        throw new Error("emitEvent: no id returned");
    }
    return data.id as string;
}
