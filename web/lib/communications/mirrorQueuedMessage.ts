/**
 * Canonical communication_* enqueue + workflow_events.message_queued.
 * Runs alongside legacy create_message inserts (public.messages unchanged).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { logCommDualWrite, orgIdTail } from "@/lib/communications/mirrorObservation";
import type { WorkflowEventPayload } from "@/lib/workflowRun";
import { resolveContextLocationId, resolvePrimaryEntityFromWorkflowPayload } from "@/lib/communications/resolvePrimaryEntity";

/** Fire-and-forget safe — logs errors without failing legacy path. */
export async function enqueueCanonicalCommunicationMirror(params: {
    supabase: SupabaseClient;
    orgId: string;
    workflowRunId: string;
    workflowId: string;
    channelRaw: string;
    toRaw: string;
    bodyRaw: string;
    payload: WorkflowEventPayload | Record<string, unknown>;
    optionsOrgId?: string | null;
}): Promise<{ communicationMessageId: string | null; threadId: string | null; skippedReason?: string }> {
    const orgRaw =
        params.orgId || (params.payload as { org_id?: string | null }).org_id || params.optionsOrgId || "";

    const orgIdTrim = typeof orgRaw === "string" ? orgRaw.trim() : "";
    if (!orgIdTrim) {
        logCommDualWrite({
            phase: "mirror_skipped",
            reason: "no_org_id",
            workflow_run_id: params.workflowRunId,
            workflow_id: params.workflowId,
            channel: params.channelRaw,
            org_id_tail: null,
            source: "create_message_mirror",
        });
        return { communicationMessageId: null, threadId: null, skippedReason: "no_org_id" };
    }

    const ent = resolvePrimaryEntityFromWorkflowPayload(params.payload as Record<string, unknown>);
    if (!ent) {
        logCommDualWrite({
            phase: "mirror_skipped",
            reason: "no_primary_entity",
            workflow_run_id: params.workflowRunId,
            workflow_id: params.workflowId,
            channel: params.channelRaw,
            org_id_tail: orgIdTail(orgIdTrim),
            source: "create_message_mirror",
        });
        return { communicationMessageId: null, threadId: null, skippedReason: "no_primary_entity" };
    }

    const locId = resolveContextLocationId(params.payload);

    const meta = {
        context_location_id: locId ?? null,
        workflow_id: params.workflowId,
        legacy_dual_write_source: "create_message",
    };

    const result = await enqueueCanonicalOutboundMessage({
        supabase: params.supabase,
        orgId: orgIdTrim,
        primaryEntityType: ent.entityType,
        primaryEntityId: ent.entityId,
        channelRaw: params.channelRaw,
        toRaw: params.toRaw,
        bodyRaw: params.bodyRaw ?? "",
        workflowRunId: params.workflowRunId,
        metadata: meta,
        contextLocationId: locId ?? null,
    });

    if (result.skippedReason) {
        logCommDualWrite({
            phase: "mirror_skipped",
            reason: result.skippedReason,
            workflow_run_id: params.workflowRunId,
            workflow_id: params.workflowId,
            channel: params.channelRaw,
            org_id_tail: orgIdTail(orgIdTrim),
            entity_type: ent.entityType,
            thread_id: result.threadId ?? null,
            source: "create_message_mirror",
        });
    }

    return result;
}
