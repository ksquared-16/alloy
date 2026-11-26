import type { SupabaseClient } from "@supabase/supabase-js";

import { emitEvent } from "@/lib/emitEvent";
import { summarizeLeadCommitRecords, type LeadCommitOperation } from "@/lib/pos/leadCommitRecords";

/**
 * `lead_created` — the business event "a new Enrollment lead exists", and what automations trigger on.
 *
 * Emitted ONLY when the commit genuinely created a lead (a committed `create`, per
 * `summarizeLeadCommitRecords`). A matched family whose next child joined its existing open lead created
 * no lead and emits nothing — that is a child joining a case, not a new lead. `new_family` says whether
 * the household itself is new, so an automation can tell a first inquiry from a returning family's.
 *
 * EXACTLY ONCE per lead: an already-recorded `lead_created` for the same lead is not emitted or dispatched
 * again (a retried approval, a replayed BOS request). Sends downstream are keyed on the lead too.
 *
 * Dispatch is the platform's existing synchronous pattern (see emitStatusChangedEvent): every enabled
 * workflow of the org for this event runs in-process, after the commit.
 */
export const LEAD_CREATED_EVENT_TYPE = "lead_created" as const;

export async function emitLeadCreatedEvent(input: {
    supabase: SupabaseClient;
    orgId: string;
    operations: readonly LeadCommitOperation[];
    lead: { id: string; customer_id?: string | null; primary_person_id?: string | null; location_id?: string | null } | null;
    source: "public_form" | "bos_create_lead";
    actorUserId: string | null;
    provenance?: Record<string, unknown>;
}): Promise<{ emitted: boolean; eventId?: string | null; workflowRuns?: number }> {
    const { supabase, orgId } = input;
    const leadId = input.lead?.id ?? null;
    if (!leadId) return { emitted: false };
    const { createdRecords, matchedExisting } = summarizeLeadCommitRecords(input.operations, input.lead);
    if (!createdRecords.lead) return { emitted: false };

    const { data: prior } = await supabase
        .from("workflow_events")
        .select("id")
        .eq("org_id", orgId)
        .eq("event_type", LEAD_CREATED_EVENT_TYPE)
        .eq("entity_type", "opportunities")
        .eq("entity_id", leadId)
        .limit(1);
    if ((prior ?? []).length > 0) return { emitted: false };

    const occurredAt = new Date().toISOString();
    const payload: Record<string, unknown> = {
        source: input.source,
        lead_id: leadId,
        opportunity_id: leadId,
        customer_id: input.lead?.customer_id ?? null,
        primary_person_id: input.lead?.primary_person_id ?? null,
        location_id: input.lead?.location_id ?? null,
        new_family: !matchedExisting,
        matched_existing: matchedExisting,
        actor_user_id: input.actorUserId,
        ...(input.provenance ?? {}),
    };
    const eventId = await emitEvent({
        org_id: orgId,
        event_type: LEAD_CREATED_EVENT_TYPE,
        entity_type: "opportunities",
        entity_id: leadId,
        action_type: null,
        occurred_at: occurredAt,
        payload,
    });

    // Workflows authored against either spelling of the entity (the runner normalizes both).
    const { data: workflows } = await supabase
        .from("workflows")
        .select("id")
        .eq("enabled", true)
        .eq("event_type", LEAD_CREATED_EVENT_TYPE)
        .in("entity_type", ["opportunities", "opportunity"])
        .or(`org_id.eq.${orgId},org_id.is.null`);
    let runs = 0;
    const toRun = (workflows ?? []) as Array<{ id: string }>;
    // The workflow runner is loaded only when an automation exists — Create Lead does not carry its
    // module graph otherwise.
    const { executeWorkflowRun } = toRun.length > 0 ? await import("@/lib/workflowRun") : { executeWorkflowRun: null };
    for (const wf of toRun) {
        if (!executeWorkflowRun) break;
        try {
            await executeWorkflowRun(
                supabase,
                wf.id,
                { event_type: LEAD_CREATED_EVENT_TYPE, occurred_at: occurredAt, org_id: orgId, entity_type: "opportunities", entity_id: leadId, ...payload },
                { event_id: eventId, org_id: orgId },
            );
            runs += 1;
        } catch (e) {
            console.warn("[emitLeadCreatedEvent] workflow run failed", wf.id, e instanceof Error ? e.message : e);
        }
    }
    return { emitted: true, eventId, workflowRuns: runs };
}
