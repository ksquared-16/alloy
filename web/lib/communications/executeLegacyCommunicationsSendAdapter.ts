/**
 * LEGACY COMPATIBILITY ADAPTER — not canonical. Do not add callers.
 *
 * Renamed from `executeCommunicationsSend` in Phase 1 Slice 1 because the name
 * made it look canonical while `canonicalSend` (lib/communications/send/
 * canonicalSend.ts) is the real authority. Two equally canonical-looking send
 * functions is the condition that let this one quietly own policy for months.
 *
 * ZERO provider-bound EXTERNAL routes use it. All four converged onto
 * canonicalSend in Slice 1. The two remaining callers are both outside the
 * provider-bound external denominator:
 *
 *   app/api/admin/communications/family-note/route.ts
 *       An internal activity fact (channel in_app, no recipient, kind "note").
 *       It is not an outbound communication and must not be forced through
 *       provider dispatch to flatten a metric.
 *       Removal condition: a canonical internal/activity fact path that can
 *       persist a note without the communications send pipeline.
 *       Target: a later Phase 1 slice.
 *
 *   lib/communications/communicationScheduledSendsService.ts
 *       The scheduled-send queue, which has its own lease and timing concerns
 *       (it currently has no lease — recorded as debt D-4).
 *       Removal condition: scheduler convergence.
 *       Target: Phase 2.
 *
 * `tests/communications/legacyAdapterBoundary.test.ts` fails if a third caller
 * appears, or if any converged route regresses onto it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    availableComposerChannels,
    type BindingSummary,
} from "@/lib/communications/composerChannels";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { resolveOutboundSender } from "@/lib/communications/identity/resolveOutboundSender";
import { serializeSenderResolution } from "@/lib/communications/identity/resolveSenderIdentity";
import { logCanonicalResolution, logResolutionFailure } from "@/lib/communications/identity/identityResolutionObservability";
import { SENDER_FAILURE } from "@/lib/communications/identity/failureCodes";
import {
    assertRecipientPersonEligibleForDrawerEmail,
    assertRecipientPersonEligibleForDrawerSms,
    getPersonEmailOrNull,
    getPersonSmsToOrNull,
} from "@/lib/communications/drawerEmailRecipients";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { enforceConsentForSend } from "@/lib/communications/v2/consentEnforcement";

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
    /** Optional canonical identity override (Phase 2 identity platform). */
    identityIdOpt?: string;
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
export async function executeLegacyCommunicationsSendAdapter(
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
        identityIdOpt,
        recipientPersonIdRaw,
        toRawInput,
        sendMetadataAugment,
    } = params;


    // PKG-18A: platform consent enforcement (DARK — only runs under comms_v2_compliance; no-op when off).
    if (
        isCommsV2FlagEnabled("comms_v2_compliance") &&
        (channel === "email" || channel === "sms") &&
        recipientPersonIdRaw &&
        UUID_RE.test(recipientPersonIdRaw)
    ) {
        const consent = await enforceConsentForSend({ supabase, orgId, personId: recipientPersonIdRaw, channel });
        if (!consent.allowed) {
            return { ok: false, status: 403, error: consent.reason, code: "consent_blocked" };
        }
    }

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
    let resolvedIdentityId: string | null = null;
    let resolvedAccountId: string | null = null;
    let senderResolutionMeta: Record<string, unknown> | null = null;

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

        const identityOverride = identityIdOpt?.trim() || "";
        const resolution = await resolveOutboundSender({
            supabase,
            orgId,
            channel,
            operatorUserId: null,
            locationId: locId,
            primaryEntityType,
            primaryEntityId,
            requestedIdentityId: UUID_RE.test(identityOverride) ? identityOverride : null,
            requestedLegacyBindingId: bindingIdOpt && UUID_RE.test(bindingIdOpt) ? bindingIdOpt : null,
            operatorHasCommunicationsSend: true,
        });

        if (!resolution.ok) {
            logResolutionFailure({
                orgId,
                channel,
                failureCode: resolution.failureCode,
                source: quickMessage ? "family_send" : "drawer_composer",
            });
            const code =
                resolution.failureCode === SENDER_FAILURE.NO_ELIGIBLE_IDENTITY
                    ? "binding_missing"
                    : resolution.failureCode === SENDER_FAILURE.UNSUPPORTED_CHANNEL
                      ? "channel_unavailable"
                      : resolution.failureCode;
            return {
                ok: false,
                status: resolution.failureCode === SENDER_FAILURE.OPERATOR_UNAUTHORIZED ? 403 : 422,
                error: resolution.message,
                code,
            };
        }

        resolvedIdentityId = resolution.communicationIdentity.id;
        resolvedAccountId = resolution.providerAccount.id;
        resolvedBindingId = resolution.legacyBindingId;
        senderResolutionMeta = serializeSenderResolution(resolution);
        logCanonicalResolution({
            orgId,
            channel,
            selectionReason: resolution.selectionReason,
            fallbackLevel: resolution.fallbackLevel,
            identityId: resolution.communicationIdentity.id,
            accountId: resolution.providerAccount.id,
            source: quickMessage ? "family_send" : "drawer_composer",
            warnings: resolution.warnings,
        });
    } else if (bindingIdOpt) {
        return { ok: false, status: 400, error: "binding_id applies only to sms/email" };
    }

    const meta: Record<string, unknown> = {
        source: quickMessage ? "header_quick_message" : "drawer_composer",
        ...(quickMessage ? { quick_message: true } : {}),
        ...(bindingIdOpt && UUID_RE.test(bindingIdOpt) ? { requested_binding_id: bindingIdOpt } : {}),
        ...(identityIdOpt && UUID_RE.test(identityIdOpt) ? { requested_identity_id: identityIdOpt } : {}),
        ...(senderResolutionMeta ? { sender_resolution: senderResolutionMeta } : {}),
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
        communicationIdentityId: resolvedIdentityId,
        communicationProviderAccountId: resolvedAccountId,
        fromAddress: channel !== "in_app" && senderResolutionMeta?.ok ? (senderResolutionMeta.safe_sender_metadata as { fromAddress?: string })?.fromAddress ?? null : null,
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
