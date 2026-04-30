/**
 * Canonical communication_* enqueue + workflow_events.message_queued.
 * Runs alongside legacy create_message inserts (public.messages unchanged).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import type { WorkflowEventPayload } from "@/lib/workflowRun";
import { resolveContextLocationId, resolvePrimaryEntityFromWorkflowPayload } from "@/lib/communications/resolvePrimaryEntity";

async function upsertCommunicationThread(params: {
    supabase: SupabaseClient;
    orgId: string;
    primaryEntityType: string;
    primaryEntityId: string;
    channel: string;
    recipientKey: string;
}): Promise<string | null> {
    const { supabase, orgId, primaryEntityType, primaryEntityId, channel, recipientKey } = params;

    const q = supabase
        .from("communication_threads")
        .select("id")
        .eq("org_id", orgId)
        .eq("primary_entity_type", primaryEntityType)
        .eq("primary_entity_id", primaryEntityId)
        .eq("channel", channel)
        .eq("recipient_key", recipientKey)
        .is("location_id", null);

    const { data: existing } = await q.maybeSingle();

    if (!existing?.id) {
        const insertRow: Record<string, unknown> = {
            org_id: orgId,
            primary_entity_type: primaryEntityType,
            primary_entity_id: primaryEntityId,
            channel,
            recipient_key: recipientKey,
            updated_at: new Date().toISOString(),
        };
        const ins = await supabase.from("communication_threads").insert(insertRow).select("id").maybeSingle();

        let id = ins.data?.id as string | undefined;
        const errCode = ins.error ? (ins.error as { code?: string }).code : undefined;
        if (ins.error && errCode !== "23505") {
            console.warn("[communications] upsertCommunicationThread insert", ins.error.message);
        }

        /* concurrent insert uniqueness */
        if (!id && errCode === "23505") {
            id = undefined;
        }
        if (!id) {
            const r2 = await supabase
                .from("communication_threads")
                .select("id")
                .eq("org_id", orgId)
                .eq("primary_entity_type", primaryEntityType)
                .eq("primary_entity_id", primaryEntityId)
                .eq("channel", channel)
                .eq("recipient_key", recipientKey)
                .is("location_id", null)
                .maybeSingle();
            id = r2.data?.id as string | undefined;
        }
        return id ?? null;
    }
    return existing.id as string;
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
    const ch = params.channelRaw.toLowerCase();
    const orgRaw =
        params.orgId || (params.payload as { org_id?: string | null }).org_id || params.optionsOrgId || "";

    const orgIdTrim = typeof orgRaw === "string" ? orgRaw.trim() : "";
    if (!orgIdTrim) return { communicationMessageId: null, threadId: null, skippedReason: "no_org_id" };

    const ent = resolvePrimaryEntityFromWorkflowPayload(params.payload as Record<string, unknown>);
    if (!ent) return { communicationMessageId: null, threadId: null, skippedReason: "no_primary_entity" };

    const recipient =
        ch === "sms"
            ? normalizeRecipientKeySms(params.toRaw)
            : ch === "email"
              ? normalizeRecipientKeyEmail(params.toRaw)
              : normalizeRecipientKeyEmail(params.toRaw);

    const locId = resolveContextLocationId(params.payload);

    const threadId = await upsertCommunicationThread({
        supabase: params.supabase,
        orgId: orgIdTrim,
        primaryEntityType: ent.entityType,
        primaryEntityId: ent.entityId,
        channel: metaChannel(ch),
        recipientKey: recipient || "_empty",
    });

    if (!threadId) return { communicationMessageId: null, threadId: null, skippedReason: "thread_failed" };

    const meta = {
        context_location_id: locId ?? null,
        workflow_id: params.workflowId,
        legacy_dual_write_source: "create_message",
    };

    const { messageId: mid, error } = await supabaseInsertCommunicationMessage(params.supabase, {
        org_id: orgIdTrim,
        thread_id: threadId,
        channel: metaChannel(ch),
        direction: "outbound",
        body: params.bodyRaw,
        workflow_run_id: params.workflowRunId,
        metadata: meta,
        to_address: params.toRaw,
    });

    if (error?.message) {
        console.warn("[communications] communication_messages insert failed", error.message);
        return { communicationMessageId: null, threadId, skippedReason: "insert_failed" };
    }

    if (mid) {
        try {
            await emitEvent({
                org_id: orgIdTrim,
                event_type: "message_queued",
                entity_type: ent.entityType,
                entity_id: ent.entityId,
                action_type: null,
                payload: {
                    communication_message_id: mid,
                    thread_id: threadId,
                    channel: metaChannel(ch),
                    direction: "outbound",
                    workflow_run_id: params.workflowRunId,
                },
            });
        } catch (e) {
            console.warn("[communications] message_queued emit failed", e instanceof Error ? e.message : e);
        }
    }

    return { communicationMessageId: mid ?? null, threadId };
}

function metaChannel(ch: string): "sms" | "email" | "in_app" {
    const x = ch.toLowerCase();
    if (x === "email") return "email";
    if (x === "in_app") return "in_app";
    return "sms";
}

async function supabaseInsertCommunicationMessage(
    supabase: SupabaseClient,
    row: {
        org_id: string;
        thread_id: string;
        channel: "sms" | "email" | "in_app";
        direction: "outbound";
        body: string;
        workflow_run_id: string;
        metadata: Record<string, unknown>;
        to_address: string;
    }
): Promise<{ messageId?: string | null; error?: { message?: string; code?: string } }> {
    const { data, error } = await supabase
        .from("communication_messages")
        .insert({
            org_id: row.org_id,
            thread_id: row.thread_id,
            channel: row.channel,
            direction: row.direction,
            status: "queued",
            body: row.body,
            workflow_run_id: row.workflow_run_id,
            metadata: row.metadata,
            to_address: row.to_address || null,
        })
        .select("id")
        .maybeSingle();
    return {
        messageId: data?.id as string | undefined,
        error: error ? { message: error.message, code: error.code } : undefined,
    };
}
