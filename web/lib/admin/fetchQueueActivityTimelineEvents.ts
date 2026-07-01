/**
 * Batch-load recent workflow_events for queue row Activity Timeline hydration.
 * Shape matches `resolveLayoutRuntimeActivityTimeline` raw event rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type QueueActivityTimelineEventRow = {
    id: string;
    occurred_at: string | null;
    event_type: string | null;
    payload: Record<string, unknown> | null;
};

const DEFAULT_MAX_EVENTS_PER_OPPORTUNITY = 8;

function rowPayload(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
}

/** @internal Exported for unit tests — groups pre-sorted desc rows by entity. */
export function collapseTopEventsPerEntity(
    rows: Array<{
        id?: unknown;
        occurred_at?: unknown;
        event_type?: unknown;
        entity_id?: unknown;
        payload?: unknown;
    }>,
    maxPerEntity: number,
): Map<string, QueueActivityTimelineEventRow[]> {
    const byEntity = new Map<string, QueueActivityTimelineEventRow[]>();
    for (const row of rows) {
        const entityId = row.entity_id != null ? String(row.entity_id).trim() : "";
        if (!entityId) continue;
        const list = byEntity.get(entityId) ?? [];
        if (list.length >= maxPerEntity) continue;
        const id = row.id != null ? String(row.id).trim() : "";
        list.push({
            id: id || `${entityId}-${list.length}`,
            occurred_at: row.occurred_at != null ? String(row.occurred_at) : null,
            event_type: row.event_type != null ? String(row.event_type) : null,
            payload: rowPayload(row.payload),
        });
        byEntity.set(entityId, list);
    }
    return byEntity;
}

/** Batch-load recent opportunity workflow_events grouped by entity_id (newest first per row). */
export async function fetchQueueActivityTimelineEventsByOpportunityId(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: string[],
    options?: { maxEventsPerOpportunity?: number },
): Promise<Map<string, QueueActivityTimelineEventRow[]>> {
    const unique = [...new Set(opportunityIds.map((x) => String(x).trim()).filter(Boolean))];
    const out = new Map<string, QueueActivityTimelineEventRow[]>();
    if (!unique.length) return out;

    const maxPerEntity = Math.min(Math.max(options?.maxEventsPerOpportunity ?? DEFAULT_MAX_EVENTS_PER_OPPORTUNITY, 1), 20);
    const chunkSize = 80;

    for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const limit = Math.min(6000, Math.max(200, chunk.length * maxPerEntity * 4));
        const { data, error } = await supabase
            .from("workflow_events")
            .select("id, occurred_at, event_type, entity_id, payload")
            .eq("org_id", orgId)
            .eq("entity_type", "opportunities")
            .in("entity_id", chunk)
            .order("occurred_at", { ascending: false })
            .limit(limit);

        if (error) {
            throw new Error(`fetchQueueActivityTimelineEventsByOpportunityId: ${error.message}`);
        }

        const grouped = collapseTopEventsPerEntity(data ?? [], maxPerEntity);
        for (const [entityId, events] of grouped) {
            out.set(entityId, events);
        }
    }

    return out;
}
