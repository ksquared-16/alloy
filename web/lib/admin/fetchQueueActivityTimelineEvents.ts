/**
 * Batch-load recent workflow_events for queue row Activity Timeline hydration.
 * Shape matches `resolveLayoutRuntimeActivityTimeline` raw event rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    collapseTourActivityDuplicates,
    OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES,
} from "@/lib/admin/opportunityTourActivityEvents";

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

/** @internal Exported for unit tests — newest-first per entity (sorts + dedupes by id). */
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
    const seenIds = new Set<string>();
    const sorted = [...rows].sort((a, b) => {
        const at = Date.parse(String(a.occurred_at ?? "")) || 0;
        const bt = Date.parse(String(b.occurred_at ?? "")) || 0;
        return bt - at;
    });
    for (const row of sorted) {
        const entityId = row.entity_id != null ? String(row.entity_id).trim() : "";
        if (!entityId) continue;
        const id = row.id != null ? String(row.id).trim() : "";
        if (id) {
            if (seenIds.has(id)) continue;
            seenIds.add(id);
        }
        const list = byEntity.get(entityId) ?? [];
        if (list.length >= maxPerEntity) continue;
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

function remapRelatedRowsToOpportunityEntity(
    rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
    return rows.map((row) => {
        const payload = row.payload;
        const oppId =
            payload && typeof payload === "object" && !Array.isArray(payload)
                ? String((payload as Record<string, unknown>).opportunity_id ?? "").trim()
                : "";
        return { ...row, entity_id: oppId || row.entity_id };
    });
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
        const [directRes, relatedChildRes, relatedTourRes] = await Promise.all([
            supabase
                .from("workflow_events")
                .select("id, occurred_at, event_type, entity_id, payload")
                .eq("org_id", orgId)
                .eq("entity_type", "opportunities")
                .in("entity_id", chunk)
                .order("occurred_at", { ascending: false })
                .limit(limit),
            // Child stage moves emit on opportunity_customer_members with payload.opportunity_id.
            supabase
                .from("workflow_events")
                .select("id, occurred_at, event_type, entity_id, payload")
                .eq("org_id", orgId)
                .eq("event_type", "child_lifecycle_status_changed")
                .in("payload->>opportunity_id", chunk)
                .order("occurred_at", { ascending: false })
                .limit(limit),
            supabase
                .from("workflow_events")
                .select("id, occurred_at, event_type, entity_id, payload")
                .eq("org_id", orgId)
                .in("event_type", [...OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES])
                .in("payload->>opportunity_id", chunk)
                .order("occurred_at", { ascending: false })
                .limit(limit),
        ]);

        if (directRes.error) {
            throw new Error(`fetchQueueActivityTimelineEventsByOpportunityId: ${directRes.error.message}`);
        }
        if (relatedChildRes.error) {
            throw new Error(`fetchQueueActivityTimelineEventsByOpportunityId: ${relatedChildRes.error.message}`);
        }
        if (relatedTourRes.error) {
            throw new Error(`fetchQueueActivityTimelineEventsByOpportunityId: ${relatedTourRes.error.message}`);
        }

        const relatedAsOpportunity = [
            ...remapRelatedRowsToOpportunityEntity((relatedChildRes.data ?? []) as Array<Record<string, unknown>>),
            ...remapRelatedRowsToOpportunityEntity((relatedTourRes.data ?? []) as Array<Record<string, unknown>>),
        ];

        const grouped = collapseTopEventsPerEntity(
            [...(directRes.data ?? []), ...relatedAsOpportunity],
            maxPerEntity * 2,
        );
        for (const [entityId, events] of grouped) {
            out.set(entityId, collapseTourActivityDuplicates(events).slice(0, maxPerEntity));
        }
    }

    return out;
}
