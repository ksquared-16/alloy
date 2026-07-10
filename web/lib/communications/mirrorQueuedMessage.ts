/**
 * Canonical communication_* enqueue + workflow_events.message_queued.
 * Runs alongside legacy create_message inserts (public.messages unchanged).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { logCommDualWrite, orgIdTail } from "@/lib/communications/mirrorObservation";
import type { WorkflowEventPayload } from "@/lib/workflowRun";
import { resolveContextLocationId, resolvePrimaryEntityFromWorkflowPayload } from "@/lib/communications/resolvePrimaryEntity";
import { resolveOutboundSender } from "@/lib/communications/identity/resolveOutboundSender";
import { serializeSenderResolution } from "@/lib/communications/identity/resolveSenderIdentity";
import { logCanonicalResolution, logIdentityResolution, logResolutionFailure } from "@/lib/communications/identity/identityResolutionObservability";

function metaChannel(ch: string): "sms" | "email" | "in_app" | null {
    const x = ch.toLowerCase();
    if (x === "sms") return "sms";
    if (x === "email") return "email";
    if (x === "in_app" || x === "in-app") return "in_app";
    return null;
}

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

    const meta: Record<string, unknown> = {
        context_location_id: locId ?? null,
        workflow_id: params.workflowId,
        legacy_dual_write_source: "create_message",
        send_path: "workflow_mirror",
        initiation_type: "system_workflow",
    };

    const mc = metaChannel(params.channelRaw);
    let resolvedIdentityId: string | null = null;
    let resolvedAccountId: string | null = null;
    let resolvedBindingId: string | null = null;
    let fromAddress: string | null = null;

    if (mc === "sms" || mc === "email") {
        const resolution = await resolveOutboundSender({
            supabase: params.supabase,
            orgId: orgIdTrim,
            channel: mc,
            operatorUserId: null,
            locationId: locId ?? null,
            primaryEntityType: ent.entityType,
            primaryEntityId: ent.entityId,
            operatorHasCommunicationsSend: true,
        });
        if (resolution.ok) {
            resolvedIdentityId = resolution.communicationIdentity.id;
            resolvedAccountId = resolution.providerAccount.id;
            resolvedBindingId = resolution.legacyBindingId;
            fromAddress = resolution.safeSenderMetadata.fromAddress;
            meta.sender_resolution = serializeSenderResolution(resolution);
            logCanonicalResolution({
                orgId: orgIdTrim,
                channel: mc,
                selectionReason: resolution.selectionReason,
                fallbackLevel: resolution.fallbackLevel,
                identityId: resolution.communicationIdentity.id,
                accountId: resolution.providerAccount.id,
                source: "workflow_mirror",
                warnings: resolution.warnings,
            });
        } else {
            meta.sender_resolution_deferred = {
                reason: "workflow_mirror_resolution_at_enqueue_failed",
                failure_code: resolution.failureCode,
                message: resolution.message,
                python_fallback_permitted: true,
            };
            logResolutionFailure({
                orgId: orgIdTrim,
                channel: mc,
                failureCode: resolution.failureCode,
                source: "workflow_mirror",
                event: "workflow_mirror_resolution_deferred",
            });
            logIdentityResolution({
                event: "python_deferred_resolution",
                org_id_tail: orgIdTail(orgIdTrim),
                channel: mc,
                failure_code: resolution.failureCode,
                source: "workflow_mirror",
            });
        }
    }

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
        communicationProviderBindingId: resolvedBindingId,
        communicationIdentityId: resolvedIdentityId,
        communicationProviderAccountId: resolvedAccountId,
        fromAddress,
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
