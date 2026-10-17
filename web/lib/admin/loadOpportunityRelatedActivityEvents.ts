/**
 * Opportunity activity — include form/intake/tour/child workflow_events linked via
 * payload.opportunity_id when they are not emitted on entity_type=opportunities.
 */

import { collapseBusinessEventMechanics } from "@/lib/admin/collapseBusinessEventMechanics";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    collapseTourActivityDuplicates,
    OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES,
} from "@/lib/admin/opportunityTourActivityEvents";

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

/** Merge direct opportunity events with related events whose payload references this opportunity. */
export async function loadOpportunityActivityEvents(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    limit: number;
}): Promise<WorkflowActivityEventRow[]> {
    const { supabase, orgId, opportunityId, limit } = params;

    // Over-fetch slightly so tour duplicate collapse still leaves a full page of operator facts.
    // Related categories are queried separately so high-volume tour invites cannot starve
    // older child stage moves / intake facts out of the related page.
    const fetchLimit = Math.min(Math.max(limit * 2, limit + 8), 200);
    const relatedCategoryLimit = Math.min(Math.max(limit, 12), 60);

    const selectCols = "id, occurred_at, event_type, entity_type, entity_id, action_type, payload";
    const relatedQuery = (eventTypes: readonly string[]) =>
        supabase
            .from("workflow_events")
            .select(selectCols)
            .eq("org_id", orgId)
            .in("event_type", [...eventTypes])
            .filter("payload->>opportunity_id", "eq", opportunityId)
            .order("occurred_at", { ascending: false })
            .limit(relatedCategoryLimit);

    const [directRes, relatedChildRes, relatedTourRes, relatedFormRes, messageRows] = await Promise.all([
        supabase
            .from("workflow_events")
            .select(selectCols)
            .eq("org_id", orgId)
            .eq("entity_type", "opportunities")
            .eq("entity_id", opportunityId)
            .order("occurred_at", { ascending: false })
            .limit(fetchLimit),
        relatedQuery(OPPORTUNITY_RELATED_CHILD_ACTIVITY_EVENT_TYPES),
        relatedQuery(OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES),
        relatedQuery(OPPORTUNITY_RELATED_FORM_ACTIVITY_EVENT_TYPES),
        loadOpportunityMessageActivityEvents({ supabase, orgId, opportunityId, limit: relatedCategoryLimit }),
    ]);

    if (directRes.error) throw new Error(directRes.error.message);
    if (relatedChildRes.error) throw new Error(relatedChildRes.error.message);
    if (relatedTourRes.error) throw new Error(relatedTourRes.error.message);
    if (relatedFormRes.error) throw new Error(relatedFormRes.error.message);

    const byId = new Map<string, WorkflowActivityEventRow>();
    for (const row of [
        ...(directRes.data ?? []),
        ...(relatedChildRes.data ?? []),
        ...(relatedTourRes.data ?? []),
        ...(relatedFormRes.data ?? []),
        ...messageRows,
    ]) {
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

    const merged = [...byId.values()].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    const enriched = await enrichChildLifecycleDisplayNames({
        supabase,
        orgId,
        rows: merged,
    });
    return collapseBusinessEventMechanics(collapseTourActivityDuplicates(enriched)).slice(0, limit);
}

/**
 * THE LEAD'S OWN MESSAGES, as activity.
 *
 * A family send threads on the RECIPIENT (a person), so its `message_queued` / `message_sent` /
 * `message_delivered` events are emitted on that person and never matched this opportunity — the SMS
 * an operator just sent from the lead was missing from its Recent Activity. The send stamps the lead on
 * the message itself (`communication_messages.metadata.opportunity_id`), and every lifecycle event names
 * its message (`payload.communication_message_id`): that pair is the canonical link. The recipient's
 * name is attached so the timeline reads "SMS to Jane", not a bare channel.
 */
async function loadOpportunityMessageActivityEvents(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    limit: number;
}): Promise<WorkflowActivityEventRow[]> {
    const { supabase, orgId, opportunityId, limit } = params;
    try {
        const { data: messages, error: msgErr } = await supabase
            .from("communication_messages")
            .select("id, thread_id")
            .eq("org_id", orgId)
            .eq("direction", "outbound")
            .filter("metadata->>opportunity_id", "eq", opportunityId)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (msgErr || !messages?.length) return [];
        const rows = messages as Array<{ id: string; thread_id: string | null }>;

        const threadIds = [...new Set(rows.map((m) => m.thread_id).filter((t): t is string => Boolean(t)))];
        const { data: threads } = threadIds.length
            ? await supabase
                  .from("communication_threads")
                  .select("id, primary_entity_type, primary_entity_id")
                  .eq("org_id", orgId)
                  .in("id", threadIds)
            : { data: [] };
        const personByThread = new Map<string, string>();
        for (const t of (threads ?? []) as Array<{ id: string; primary_entity_type: string | null; primary_entity_id: string | null }>) {
            if (t.primary_entity_type === "persons" && t.primary_entity_id) personByThread.set(t.id, t.primary_entity_id);
        }
        const personIds = [...new Set(personByThread.values())];
        const { data: persons } = personIds.length
            ? await supabase.from("persons").select("id, first_name, last_name").eq("org_id", orgId).in("id", personIds)
            : { data: [] };
        const nameByPerson = new Map<string, string>();
        for (const p of (persons ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
            const name = [p.first_name, p.last_name].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
            if (name) nameByPerson.set(p.id, name);
        }
        const recipientByMessage = new Map<string, string>();
        for (const m of rows) {
            const person = m.thread_id ? personByThread.get(m.thread_id) : undefined;
            const name = person ? nameByPerson.get(person) : undefined;
            if (name) recipientByMessage.set(m.id, name);
        }

        const { data: events, error: evErr } = await supabase
            .from("workflow_events")
            .select("id, occurred_at, event_type, entity_type, entity_id, action_type, payload")
            .eq("org_id", orgId)
            .in("event_type", ["message_queued", "message_sent", "message_delivered", "message_failed"])
            .filter("payload->>communication_message_id", "in", `(${rows.map((m) => m.id).join(",")})`)
            .order("occurred_at", { ascending: false })
            .limit(limit * 3);
        if (evErr) return [];
        return ((events ?? []) as WorkflowActivityEventRow[]).map((ev) => {
            const payload = rowPayload(ev.payload) ?? {};
            const mid = String(payload.communication_message_id ?? "");
            const recipient = recipientByMessage.get(mid);
            return {
                ...ev,
                payload: recipient && !payload.recipient_display_name ? { ...payload, recipient_display_name: recipient } : payload,
            };
        });
    } catch {
        // Message activity is additive — its absence must never empty the lead's timeline.
        return [];
    }
}

/**
 * Historical child stage events often lack `child_display_name` (emit seam added later).
 * Resolve identity from durable OCM → customer_members.display_name — never invent stage facts.
 */
async function enrichChildLifecycleDisplayNames(params: {
    supabase: SupabaseClient;
    orgId: string;
    rows: WorkflowActivityEventRow[];
}): Promise<WorkflowActivityEventRow[]> {
    const { supabase, orgId, rows } = params;
    const ocmIds = new Set<string>();
    for (const row of rows) {
        if (String(row.event_type ?? "").toLowerCase() !== "child_lifecycle_status_changed") continue;
        const payload = row.payload ?? {};
        if (firstNonEmpty(payload.child_display_name, payload.child_name)) continue;
        const ocmId =
            firstNonEmpty(
                payload.opportunity_customer_member_id,
                row.entity_type === "opportunity_customer_members" ? row.entity_id : null,
            ) ?? null;
        if (ocmId) ocmIds.add(ocmId);
    }
    if (ocmIds.size === 0) return rows;

    const { data: ocmRows, error: ocmError } = await supabase
        .from("opportunity_customer_members")
        .select("id, customer_member_id")
        .eq("org_id", orgId)
        .in("id", [...ocmIds]);
    if (ocmError || !ocmRows?.length) return rows;

    const cmByOcm = new Map<string, string>();
    const cmIds: string[] = [];
    for (const row of ocmRows) {
        const ocmId = typeof row.id === "string" ? row.id : "";
        const cmId = typeof row.customer_member_id === "string" ? row.customer_member_id : "";
        if (!ocmId || !cmId) continue;
        cmByOcm.set(ocmId, cmId);
        cmIds.push(cmId);
    }
    if (cmIds.length === 0) return rows;

    const { data: members, error: memberError } = await supabase
        .from("customer_members")
        .select("id, display_name, first_name, last_name")
        .eq("org_id", orgId)
        .in("id", [...new Set(cmIds)]);
    if (memberError || !members?.length) return rows;

    const nameByCm = new Map<string, string>();
    for (const m of members) {
        const id = typeof m.id === "string" ? m.id : "";
        if (!id) continue;
        const display =
            firstNonEmpty(m.display_name)
            || [m.first_name, m.last_name].map((p) => (p != null ? String(p).trim() : "")).filter(Boolean).join(" ")
            || null;
        if (display) nameByCm.set(id, display);
    }

    return rows.map((row) => {
        if (String(row.event_type ?? "").toLowerCase() !== "child_lifecycle_status_changed") return row;
        const payload = { ...(row.payload ?? {}) };
        if (firstNonEmpty(payload.child_display_name, payload.child_name)) return row;
        const ocmId =
            firstNonEmpty(
                payload.opportunity_customer_member_id,
                row.entity_type === "opportunity_customer_members" ? row.entity_id : null,
            ) ?? null;
        if (!ocmId) return row;
        const cmId = cmByOcm.get(ocmId);
        const name = cmId ? nameByCm.get(cmId) : null;
        if (!name) return row;
        return {
            ...row,
            payload: { ...payload, child_display_name: name },
        };
    });
}

function firstNonEmpty(...vals: unknown[]): string | null {
    for (const v of vals) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s) return s;
    }
    return null;
}
