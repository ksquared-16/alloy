/**
 * Canonical communication_threads + communication_messages inserts + workflow_events.message_queued.
 * Used by workflow dual-write mirror and drawer composer (Card 12).
 *
 * PHASE 0: this module is the eligibility CHOKE POINT.
 *
 * `insertCommunicationMessageRow` is the only TypeScript function that inserts
 * an outbound communication_messages row, and this is its only caller. The
 * consent gate previously lived one level up in executeCommunicationsSend,
 * where four independent bypasses defeated it and three send paths never
 * reached it at all (tour comms, packet launch, the workflow mirror).
 * Evaluating here covers all of them with no re-pointing.
 *
 * This is not the whole story: rows can still enter the table by paths
 * TypeScript never sees (raw SQL, seed scripts). Python dispatch revalidation
 * is the second layer that catches those.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import { resolveOutboundEmailSubject } from "@/lib/communications/emailSubject";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import {
    ELIGIBILITY_POLICY_VERSION,
    evaluateEligibility,
} from "@/lib/communications/eligibility/evaluateEligibility";
import { loadEligibilityContext } from "@/lib/communications/eligibility/loadEligibilityContext";
import {
    ELIGIBILITY_SNAPSHOT_VERSION,
    recordCategoryFallback,
    type EligibilitySnapshot,
    type MessageAudience,
    type MessageCategory,
    type QuietHoursWindow,
} from "@/lib/communications/eligibility/types";

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

function metaChannel(ch: string): "sms" | "email" | "in_app" {
    const x = ch.toLowerCase();
    if (x === "email") return "email";
    if (x === "in_app") return "in_app";
    return "sms";
}

async function insertCommunicationMessageRow(params: {
    supabase: SupabaseClient;
    org_id: string;
    thread_id: string;
    channel: "sms" | "email" | "in_app";
    direction: "outbound";
    body: string;
    subject?: string | null;
    workflow_run_id: string | null;
    metadata: Record<string, unknown>;
    to_address: string | null;
    communication_provider_binding_id?: string | null;
    communication_identity_id?: string | null;
    communication_provider_account_id?: string | null;
    from_address?: string | null;
    audience?: string;
    category?: string;
    purpose?: string | null;
    eligibility_snapshot?: unknown;
}): Promise<{ messageId?: string | null; error?: { message?: string; code?: string } }> {
    const insertPayload: Record<string, unknown> = {
        org_id: params.org_id,
        thread_id: params.thread_id,
        channel: params.channel,
        direction: params.direction,
        status: "queued",
        body: params.body,
        workflow_run_id: params.workflow_run_id,
        metadata: params.metadata,
        to_address: params.to_address,
    };
    if (params.audience) insertPayload.audience = params.audience;
    if (params.category) insertPayload.category = params.category;
    if (params.purpose != null) insertPayload.purpose = params.purpose;
    if (params.eligibility_snapshot != null) insertPayload.eligibility_snapshot = params.eligibility_snapshot;
    if (params.channel === "email") {
        insertPayload.subject = params.subject ?? null;
    }
    if (params.communication_provider_binding_id) {
        insertPayload.communication_provider_binding_id = params.communication_provider_binding_id;
    }
    if (params.communication_identity_id) {
        insertPayload.communication_identity_id = params.communication_identity_id;
    }
    if (params.communication_provider_account_id) {
        insertPayload.communication_provider_account_id = params.communication_provider_account_id;
    }
    if (params.from_address) {
        insertPayload.from_address = params.from_address;
    }
    const { data, error } = await params.supabase.from("communication_messages").insert(insertPayload).select("id").maybeSingle();
    return {
        messageId: data?.id as string | undefined,
        error: error ? { message: error.message, code: error.code } : undefined,
    };
}

export type CanonicalEnqueueResult = {
    communicationMessageId: string | null;
    threadId: string | null;
    skippedReason?: string;
};

/**
 * Upsert thread, insert outbound queued communication_message, emit message_queued.
 */
export async function enqueueCanonicalOutboundMessage(params: {
    supabase: SupabaseClient;
    orgId: string;
    primaryEntityType: string;
    primaryEntityId: string;
    channelRaw: string;
    toRaw: string;
    bodyRaw: string;
    /** Only used when channel resolves to email; empty/omitted yields entity-based defaults. */
    emailSubjectRaw?: string | null;
    workflowRunId?: string | null;
    metadata: Record<string, unknown>;
    contextLocationId?: string | null;
    /** Composer / explicit binding routing for outbound dequeue (SMS/email). Must belong to org_id + channel. */
    communicationProviderBindingId?: string | null;
    /** Canonical identity platform references (Phase 2). */
    communicationIdentityId?: string | null;
    communicationProviderAccountId?: string | null;
    fromAddress?: string | null;
    /** When false, skips workflow_events emit (testing only — default true) */
    emitMessageQueued?: boolean;

    // ---- Phase 0 classification + eligibility -------------------------------
    /** external | internal. Defaults to external — the stricter reading. */
    audience?: MessageAudience;
    /**
     * Platform-owned compliance class. SHOULD be supplied explicitly by every
     * caller; omission takes the bounded, counted fallback (see
     * recordCategoryFallback) which is retired by migration.
     */
    category?: MessageCategory;
    /** Domain/tenant key. Compliance-inert — may never widen consent. */
    purpose?: string | null;
    /** Resolved recipient. Absent blocks an external send (fail closed). */
    recipientPersonId?: string | null;
    /** Whether the acting operator holds the emergency-send permission. */
    emergencyPermitted?: boolean;
    /** Recorded in the snapshot for audit. */
    authorizedByUserId?: string | null;
    /** Channel usability as already resolved upstream (address + identity). */
    channelUsable?: boolean;
    /** Quiet-hours window, when one applies. */
    quietHours?: QuietHoursWindow | null;
    /** Names the caller in fallback telemetry. */
    callSite?: string;
}): Promise<CanonicalEnqueueResult> {
    const ch = params.channelRaw.toLowerCase();
    const mc = metaChannel(ch);
    const orgIdTrim = params.orgId.trim();
    if (!orgIdTrim) return { communicationMessageId: null, threadId: null, skippedReason: "no_org_id" };

    const recipient =
        mc === "sms"
            ? normalizeRecipientKeySms(params.toRaw)
            : normalizeRecipientKeyEmail(params.toRaw);
    const recipientKey = mc === "in_app" && !recipient.trim() ? "_in_app" : recipient || "_empty";

    const threadId = await upsertCommunicationThread({
        supabase: params.supabase,
        orgId: orgIdTrim,
        primaryEntityType: params.primaryEntityType,
        primaryEntityId: params.primaryEntityId,
        channel: mc,
        recipientKey,
    });

    if (!threadId) return { communicationMessageId: null, threadId: null, skippedReason: "thread_failed" };

    const meta: Record<string, unknown> = { ...params.metadata };
    if (params.contextLocationId != null) {
        meta.context_location_id = params.contextLocationId;
    }

    const wrRaw = params.workflowRunId != null ? String(params.workflowRunId).trim() : "";
    const workflowRunUuid = /^[0-9a-f-]{36}$/i.test(wrRaw) ? wrRaw : null;

    const bindRaw = params.communicationProviderBindingId != null ? String(params.communicationProviderBindingId).trim() : "";
    const bindingUuid = /^[0-9a-f-]{36}$/i.test(bindRaw) ? bindRaw : null;
    const identRaw = params.communicationIdentityId != null ? String(params.communicationIdentityId).trim() : "";
    const identityUuid = /^[0-9a-f-]{36}$/i.test(identRaw) ? identRaw : null;
    const acctRaw = params.communicationProviderAccountId != null ? String(params.communicationProviderAccountId).trim() : "";
    const accountUuid = /^[0-9a-f-]{36}$/i.test(acctRaw) ? acctRaw : null;

    const emailSubjectResolved =
        mc === "email" ? resolveOutboundEmailSubject(params.primaryEntityType, params.emailSubjectRaw ?? null) : null;

    // ---- ELIGIBILITY GATE ---------------------------------------------------
    // Evaluated immediately before the insert, so no TypeScript path can create
    // an outbound row without a decision. Blocking here means no queued row is
    // created at all — there is nothing for the worker to pick up.
    const audience: MessageAudience = params.audience ?? "external";
    const category: MessageCategory =
        params.category ?? recordCategoryFallback(params.callSite ?? "canonicalOutboundEnqueue:unspecified");
    const toAddress = params.toRaw?.trim() || null;

    const context = await loadEligibilityContext({
        supabase: params.supabase,
        orgId: orgIdTrim,
        personId: params.recipientPersonId ?? null,
        category,
        channel: mc,
        toAddress,
    });

    const decision = context.lookupFailed
        ? {
              allowed: false,
              code: "SUPPRESSED" as const,
              reason: "Eligibility inputs could not be loaded; refusing to send.",
          }
        : evaluateEligibility({
              audience,
              category,
              channel: mc,
              purpose: params.purpose ?? null,
              recipientPersonId: params.recipientPersonId ?? null,
              preferenceState: context.preferenceState,
              suppressed: context.suppressed,
              channelUsable: params.channelUsable ?? true,
              quietHours: params.quietHours ?? null,
              emergencyPermitted: params.emergencyPermitted,
          });

    const snapshot: EligibilitySnapshot = {
        snapshotVersion: ELIGIBILITY_SNAPSHOT_VERSION,
        policyVersion: ELIGIBILITY_POLICY_VERSION,
        decision,
        audience,
        category,
        purpose: params.purpose ?? null,
        recipient: { personId: params.recipientPersonId ?? null, channel: mc },
        authorizedBy: {
            userId: params.authorizedByUserId ?? null,
            permission: params.emergencyPermitted ? "communications.send.emergency" : "communications.send",
        },
        identity: {
            identityId: identityUuid,
            providerAccountId: accountUuid,
            bindingId: bindingUuid,
        },
        consentInputs: context.consultedPreferenceCategory
            ? [{ category: context.consultedPreferenceCategory, state: context.preferenceState }]
            : [],
        quietHours: params.quietHours ?? null,
        evaluatedAt: new Date().toISOString(),
    };

    if (!decision.allowed) {
        console.warn("[communications] send blocked by eligibility gate", {
            org_id: orgIdTrim,
            channel: mc,
            audience,
            category,
            code: decision.code,
        });
        return {
            communicationMessageId: null,
            threadId,
            skippedReason: `eligibility_blocked:${decision.code}`,
        };
    }

    const { messageId: mid, error } = await insertCommunicationMessageRow({
        supabase: params.supabase,
        org_id: orgIdTrim,
        thread_id: threadId,
        channel: mc,
        direction: "outbound",
        body: params.bodyRaw,
        subject: emailSubjectResolved,
        workflow_run_id: workflowRunUuid,
        metadata: meta,
        to_address: toAddress,
        communication_provider_binding_id: bindingUuid,
        communication_identity_id: identityUuid,
        communication_provider_account_id: accountUuid,
        from_address: params.fromAddress?.trim() || null,
        audience,
        category,
        purpose: params.purpose ?? null,
        eligibility_snapshot: snapshot,
    });

    if (error?.message) {
        console.warn("[communications] communication_messages insert failed", error.message);
        return { communicationMessageId: null, threadId, skippedReason: "insert_failed" };
    }

    if (mid && (params.emitMessageQueued !== false)) {
        const occurredAt = new Date().toISOString();
        const nestedPayload = {
            communication_message_id: mid,
            thread_id: threadId,
            channel: mc,
            direction: "outbound" as const,
            workflow_run_id: workflowRunUuid,
        };
        let eventId: string | null = null;
        try {
            eventId = await emitEvent({
                org_id: orgIdTrim,
                event_type: "message_queued",
                entity_type: params.primaryEntityType,
                entity_id: params.primaryEntityId,
                action_type: null,
                occurred_at: occurredAt,
                payload: nestedPayload,
            });
        } catch (e) {
            console.warn("[communications] message_queued emit failed", e instanceof Error ? e.message : e);
        }
        if (eventId) {
            const eventPayload: Record<string, unknown> = {
                event_type: "message_queued",
                occurred_at: occurredAt,
                org_id: orgIdTrim,
                entity_type: params.primaryEntityType,
                entity_id: params.primaryEntityId,
                ...nestedPayload,
            };
            try {
                const { executeWorkflowRun } = await import("@/lib/workflowRun");
                let wq = params.supabase
                    .from("workflows")
                    .select("id")
                    .eq("enabled", true)
                    .eq("event_type", "message_queued")
                    .eq("entity_type", params.primaryEntityType);
                wq = wq.or(`org_id.eq.${orgIdTrim},org_id.is.null`);
                const { data: wfs } = await wq;
                for (const wf of wfs ?? []) {
                    try {
                        await executeWorkflowRun(params.supabase, (wf as { id: string }).id, eventPayload, {
                            event_id: eventId,
                            org_id: orgIdTrim,
                        });
                    } catch (err) {
                        console.warn(
                            "[communications] message_queued executeWorkflowRun",
                            (wf as { id: string }).id,
                            err instanceof Error ? err.message : err
                        );
                    }
                }
            } catch (e) {
                console.warn("[communications] message_queued workflow dispatch", e instanceof Error ? e.message : e);
            }
        }
    }

    return { communicationMessageId: mid ?? null, threadId };
}
