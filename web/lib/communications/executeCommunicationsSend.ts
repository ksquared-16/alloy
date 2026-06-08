/**
 * Shared implementation for guarded outbound composer enqueue (canonical `communication_*` path).
 * Used by `POST /api/admin/communications/send` and Task Assist apply — keep behavior aligned.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    activeOutboundBindings,
    availableComposerChannels,
    type BindingSummary,
} from "@/lib/communications/composerChannels";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import {
    assertRecipientPersonEligibleForDrawerEmail,
    assertRecipientPersonEligibleForDrawerSms,
    getPersonEmailOrNull,
    getPersonSmsToOrNull,
} from "@/lib/communications/drawerEmailRecipients";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function resolveContextLocationId(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    entityId: string
): Promise<string | null> {
    if (entityType === "jobs") {
        const { data } = await supabase
            .from("jobs")
            .select("location_id")
            .eq("id", entityId)
            .eq("org_id", orgId)
            .maybeSingle();
        const lid = data && typeof data === "object" ? (data as { location_id?: string }).location_id : null;
        return lid ? String(lid) : null;
    }
    return null;
}

export type ExecuteCommunicationsSendParams = {
    supabase: SupabaseClient;
    orgId: string;
    quickMessage: boolean;
    primaryEntityType: string;
    primaryEntityId: string;
    channel: "sms" | "email" | "in_app";
    /** Trimmed message body (same as send route `body`). */
    textRaw: string;
    subjectRawEmail?: string | undefined;
    bindingIdOpt: string;
    recipientPersonIdRaw: string;
    /** Initial `to` / `to_address` from request; may be replaced when resolving from `recipient_person_id`. */
    toRawInput: string;
    /**
     * Merged into outbound `metadata` after built-in keys (source, quick_message, binding, recipient_person_id).
     * Use for Task Assist telemetry; keep small and non-sensitive.
     */
    sendMetadataAugment?: Record<string, unknown> | null;
};

export type ExecuteCommunicationsSendSuccess = {
    ok: true;
    communication_message_id: string;
    thread_id: string | null;
    channel: string;
    process_trigger_attempted_note: string;
};

export type ExecuteCommunicationsSendFailure = {
    ok: false;
    status: number;
    error: string;
    code?: string;
    thread_id?: string | null;
};

/**
 * Resolve `to` for sms/email, pick binding, enqueue via {@link enqueueCanonicalOutboundMessage}.
 * Caller must have already validated auth, permissions, entity existence, and parsed/normalized inputs
 * the same way as `communications/send` (including `quick_message` entity rewrite when applicable).
 */
export async function executeCommunicationsSend(
    params: ExecuteCommunicationsSendParams
): Promise<ExecuteCommunicationsSendSuccess | ExecuteCommunicationsSendFailure> {
    const {
        supabase,
        orgId,
        quickMessage,
        primaryEntityType,
        primaryEntityId,
        channel,
        textRaw,
        subjectRawEmail,
        bindingIdOpt,
        recipientPersonIdRaw,
        toRawInput,
        sendMetadataAugment,
    } = params;

    let toRaw = toRawInput.trim();

    if (channel === "email" && recipientPersonIdRaw && UUID_RE.test(recipientPersonIdRaw)) {
        if (quickMessage) {
            const em = await getPersonEmailOrNull(supabase, orgId, recipientPersonIdRaw);
            if (!em) {
                return { ok: false, status: 400, error: "Recipient person has no usable email" };
            }
            toRaw = em;
        } else {
            const elig = await assertRecipientPersonEligibleForDrawerEmail(
                supabase,
                orgId,
                primaryEntityType as "opportunities" | "jobs" | "persons",
                primaryEntityId,
                recipientPersonIdRaw
            );
            if (!elig) {
                return {
                    ok: false,
                    status: 400,
                    error: "recipient_person_id is not an eligible person-with-email for this record",
                };
            }
            const em = await getPersonEmailOrNull(supabase, orgId, recipientPersonIdRaw);
            if (!em) {
                return { ok: false, status: 400, error: "Recipient person has no usable email" };
            }
            toRaw = em;
        }
    }

    if (channel === "sms" && recipientPersonIdRaw && UUID_RE.test(recipientPersonIdRaw)) {
        if (quickMessage) {
            const sms = await getPersonSmsToOrNull(supabase, orgId, recipientPersonIdRaw);
            if (!sms) {
                return { ok: false, status: 400, error: "Recipient person has no usable SMS number" };
            }
            toRaw = sms;
        } else {
            const elig = await assertRecipientPersonEligibleForDrawerSms(
                supabase,
                orgId,
                primaryEntityType as "opportunities" | "jobs" | "persons",
                primaryEntityId,
                recipientPersonIdRaw
            );
            if (!elig) {
                return {
                    ok: false,
                    status: 400,
                    error: "recipient_person_id is not an eligible person-with-phone for this record",
                };
            }
            const sms = await getPersonSmsToOrNull(supabase, orgId, recipientPersonIdRaw);
            if (!sms) {
                return { ok: false, status: 400, error: "Recipient person has no usable SMS number" };
            }
            toRaw = sms;
        }
    }

    const { data: rows, error: bindErr } = await supabase
        .from("communication_provider_bindings")
        .select("id, channel, scope, location_id, display_label, provider, status, is_primary, secret_ref, inbound_to_e164, config")
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false });

    if (bindErr) {
        return { ok: false, status: 500, error: bindErr.message };
    }
    const bindList = (rows ?? []) as BindingSummary[];

    const allowed = availableComposerChannels(bindList);
    if (!allowed.includes(channel)) {
        return {
            ok: false,
            status: 422,
            error: `${channel} is not configured for outbound in this org (check bindings)`,
            code: "channel_unavailable",
        };
    }

    const locId = await resolveContextLocationId(supabase, orgId, primaryEntityType, primaryEntityId);

    let resolvedBindingId: string | null = null;
    if (channel !== "in_app") {
        if (!toRaw) {
            return { ok: false, status: 400, error: "to address required for sms/email" };
        }
        const norm = channel === "sms" ? normalizeRecipientKeySms(toRaw) : normalizeRecipientKeyEmail(toRaw);
        if (channel === "sms" && !norm.replace(/\D/g, "").length) {
            return { ok: false, status: 400, error: "Invalid SMS destination" };
        }
        if (channel === "email" && !norm.includes("@")) {
            return { ok: false, status: 400, error: "Invalid email destination" };
        }

        const pool = activeOutboundBindings(bindList, channel);
        let candidates = pool;
        if (bindingIdOpt && UUID_RE.test(bindingIdOpt)) {
            candidates = pool.filter((b) => b.id === bindingIdOpt);
            if (!candidates.length) {
                return { ok: false, status: 400, error: "binding_id not valid for channel/org" };
            }
        }
        if (!candidates.length) {
            return {
                ok: false,
                status: 422,
                error: "No actionable binding rows for chosen channel",
                code: "binding_missing",
            };
        }
        resolvedBindingId = bindingIdOpt && UUID_RE.test(bindingIdOpt) ? bindingIdOpt : (candidates[0]?.id ?? null);
    } else if (bindingIdOpt) {
        return { ok: false, status: 400, error: "binding_id applies only to sms/email" };
    }

    const meta: Record<string, unknown> = {
        source: quickMessage ? "header_quick_message" : "drawer_composer",
        ...(quickMessage ? { quick_message: true } : {}),
        ...(bindingIdOpt && UUID_RE.test(bindingIdOpt) ? { requested_binding_id: bindingIdOpt } : {}),
        ...(recipientPersonIdRaw && UUID_RE.test(recipientPersonIdRaw) ? { recipient_person_id: recipientPersonIdRaw } : {}),
        ...(sendMetadataAugment && typeof sendMetadataAugment === "object" ? sendMetadataAugment : {}),
    };

    const res = await enqueueCanonicalOutboundMessage({
        supabase,
        orgId,
        primaryEntityType,
        primaryEntityId,
        channelRaw: channel,
        toRaw,
        bodyRaw: textRaw,
        ...(channel === "email" ? { emailSubjectRaw: subjectRawEmail ?? "" } : {}),
        workflowRunId: null,
        metadata: meta,
        contextLocationId: locId,
        communicationProviderBindingId: resolvedBindingId,
    });

    if (res.skippedReason === "insert_failed" || !res.communicationMessageId) {
        return {
            ok: false,
            status: 500,
            error: `Failed to enqueue message (${res.skippedReason ?? "unknown"})`,
            thread_id: res.threadId,
        };
    }

    void triggerBackendMessagesQueue({ workflow_run_id: null, limit: 25 }).catch(() => {});

    const envUnset =
        !(process.env.INTERNAL_MESSAGES_PROCESS_URL ?? "").trim() || !(process.env.INTERNAL_CRON_TOKEN ?? "").trim();

    return {
        ok: true,
        communication_message_id: res.communicationMessageId,
        thread_id: res.threadId,
        channel,
        process_trigger_attempted_note: envUnset
            ? "INTERNAL_MESSAGES_PROCESS_URL/INTERNAL_CRON_TOKEN unset — row stays queued until cron runs."
            : "Backend process trigger dispatched (best-effort).",
    };
}
