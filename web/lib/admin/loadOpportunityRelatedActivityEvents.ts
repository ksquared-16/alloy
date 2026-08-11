/**
 * Opportunity activity — include form/intake workflow_events linked via payload.opportunity_id.
 * Form events emit on entity_type form_submissions; opportunity drawer queries opportunities only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const OPPORTUNITY_RELATED_FORM_ACTIVITY_EVENT_TYPES = [
    "form_submitted",
    "form_signed",
    "form_document_generated",
    "intake_case_created",
    "intake_case_operationalized",
    "intake_case_review_required",
    "intake_case_linked",
] as const;

/** Child stage/disposition moves emit on OCM / process_instances — still scoped by opportunity_id. */
export const OPPORTUNITY_RELATED_CHILD_ACTIVITY_EVENT_TYPES = [
    "child_lifecycle_status_changed",
] as const;

export type WorkflowActivityEventRow = {
    id: string;
    occurred_at: string;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    action_type: string | null;
    payload: Record<string, unknown> | null;
};

function rowPayload(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
}

/** Merge direct opportunity events with form/intake events whose payload references this opportunity. */
export async function loadOpportunityActivityEvents(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    limit: number;
}): Promise<WorkflowActivityEventRow[]> {
    const { supabase, orgId, opportunityId, limit } = params;

    const relatedEventTypes = [
        ...OPPORTUNITY_RELATED_FORM_ACTIVITY_EVENT_TYPES,
        ...OPPORTUNITY_RELATED_CHILD_ACTIVITY_EVENT_TYPES,
    ];
    const [directRes, relatedRes] = await Promise.all([
        supabase
            .from("workflow_events")
            .select("id, occurred_at, event_type, entity_type, entity_id, action_type, payload")
            .eq("org_id", orgId)
            .eq("entity_type", "opportunities")
            .eq("entity_id", opportunityId)
            .order("occurred_at", { ascending: false })
            .limit(limit),
        supabase
            .from("workflow_events")
            .select("id, occurred_at, event_type, entity_type, entity_id, action_type, payload")
            .eq("org_id", orgId)
            .in("event_type", relatedEventTypes)
            .filter("payload->>opportunity_id", "eq", opportunityId)
            .order("occurred_at", { ascending: false })
            .limit(limit),
    ]);

    if (directRes.error) throw new Error(directRes.error.message);
    if (relatedRes.error) throw new Error(relatedRes.error.message);

    const byId = new Map<string, WorkflowActivityEventRow>();
    for (const row of [...(directRes.data ?? []), ...(relatedRes.data ?? [])]) {
        const id = typeof row.id === "string" ? row.id : "";
        if (!id || byId.has(id)) continue;
        byId.set(id, {
            id,
            occurred_at: String(row.occurred_at ?? ""),
            event_type: row.event_type ?? null,
            entity_type: row.entity_type ?? null,
            entity_id: row.entity_id ?? null,
            action_type: row.action_type ?? null,
            payload: rowPayload(row.payload),
        });
    }

    return [...byId.values()]
        .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
        .slice(0, limit);
}
