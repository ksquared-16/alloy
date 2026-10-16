import type { SupabaseClient } from "@supabase/supabase-js";

import { associateOutboundCommunicationToContactAttempt } from "@/lib/lifecycle/associateOutboundCommunicationToContactAttempt";

/**
 * A SEND COUNTS AS CONTACT WHEN THE PROVIDER ACCEPTS IT — not when Alloy queues it, and not when a
 * carrier later confirms delivery.
 *
 * The canonical "provider accepted" fact is `communication_messages.status = 'sent'` with a
 * `provider_message_id`: both senders (backend SMS/email, web email) write it only after the provider
 * returned 2xx, and write `failed` on a synchronous rejection (e.g. Twilio 400 "not a valid phone number").
 * `delivered` is later carrier telemetry and also implies acceptance.
 *
 * The send records its INTENT on the message (`metadata.work_consequence`, `opportunity_id`,
 * `author_user_id`); this reconciler turns an accepted message into the lead's contact attempt through the
 * existing association (`associateOutboundCommunicationToContactAttempt` — the configured
 * `sufficient_command_results` decide what the attempt does to the work). A rejected, blocked or still
 * queued message records nothing, so the work stays open.
 *
 * Idempotent per message: the association is stamped on the message (`metadata.contact_attempt_association`)
 * and a stamped message is never associated again — it may be called inline after the send, from the
 * provider webhooks and from the scheduled sweep without double-counting.
 */
export const CONTACT_FAMILY_WORK_CONSEQUENCE = "contact_family_work" as const;

export type ContactAttemptReconcileResult =
    | { state: "associated"; task_id?: string; outcome_key?: string }
    | { state: "pending_provider_acceptance" }
    | { state: "not_accepted"; status: string }
    | { state: "already_associated" }
    | { state: "not_applicable"; reason: string }
    | { state: "error"; error: string };

type MessageRow = {
    id: string;
    org_id: string;
    direction: string | null;
    channel: string | null;
    status: string | null;
    provider_message_id: string | null;
    metadata: Record<string, unknown> | null;
};

const ACCEPTED = new Set(["sent", "delivered"]);
const PENDING = new Set(["queued", "deferred", "sending"]);

export async function reconcileContactAttemptOnProviderAcceptance(input: {
    supabase: SupabaseClient;
    messageId: string;
}): Promise<ContactAttemptReconcileResult> {
    const { supabase } = input;
    const { data, error } = await supabase
        .from("communication_messages")
        .select("id, org_id, direction, channel, status, provider_message_id, metadata")
        .eq("id", input.messageId)
        .maybeSingle();
    if (error) return { state: "error", error: error.message };
    const m = data as MessageRow | null;
    if (!m) return { state: "not_applicable", reason: "message_not_found" };
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (meta.work_consequence !== CONTACT_FAMILY_WORK_CONSEQUENCE) return { state: "not_applicable", reason: "no_declared_work" };
    if (meta.contact_attempt_association) return { state: "already_associated" };
    if (String(m.direction ?? "") !== "outbound") return { state: "not_applicable", reason: "not_outbound" };

    const status = String(m.status ?? "").toLowerCase();
    if (PENDING.has(status)) return { state: "pending_provider_acceptance" };
    if (!ACCEPTED.has(status) || !m.provider_message_id) return { state: "not_accepted", status };

    const opportunityId = typeof meta.opportunity_id === "string" ? meta.opportunity_id : "";
    const userId = typeof meta.author_user_id === "string" ? meta.author_user_id : "";
    const channel = m.channel === "email" ? "email" : m.channel === "sms" ? "sms" : null;
    if (!opportunityId || !userId || !channel) return { state: "not_applicable", reason: "missing_context" };

    // Claim the message first: only the caller whose conditional write lands may associate.
    const claim = { ...meta, contact_attempt_association: { state: "claimed", at: new Date().toISOString() } };
    const { data: claimed, error: claimErr } = await supabase
        .from("communication_messages")
        .update({ metadata: claim })
        .eq("id", m.id)
        .is("metadata->contact_attempt_association", null)
        .select("id");
    if (claimErr) return { state: "error", error: claimErr.message };
    if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) return { state: "already_associated" };

    try {
        const assoc = await associateOutboundCommunicationToContactAttempt({
            supabase,
            orgId: m.org_id,
            userId,
            opportunityId,
            channel,
            communicationMessageId: m.id,
        });
        await supabase
            .from("communication_messages")
            .update({ metadata: { ...meta, contact_attempt_association: { ...assoc, at: new Date().toISOString() } } })
            .eq("id", m.id);
        return assoc.associated
            ? { state: "associated", task_id: assoc.task_id, outcome_key: assoc.outcome_key }
            : { state: "not_applicable", reason: assoc.reason ?? assoc.error ?? "no_open_work" };
    } catch (e) {
        // Release the claim so a later pass can retry.
        await supabase.from("communication_messages").update({ metadata: meta }).eq("id", m.id);
        return { state: "error", error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Backstop: accepted messages that declared contact work and were never associated (the inline pass ran
 * before the provider answered, or no webhook arrived). Bounded and recent.
 */
export async function sweepPendingContactAttempts(supabase: SupabaseClient, opts: { sinceHours?: number; limit?: number } = {}): Promise<number> {
    const since = new Date(Date.now() - (opts.sinceHours ?? 48) * 3_600_000).toISOString();
    const { data } = await supabase
        .from("communication_messages")
        .select("id")
        .eq("direction", "outbound")
        .in("status", ["sent", "delivered"])
        .filter("metadata->>work_consequence", "eq", CONTACT_FAMILY_WORK_CONSEQUENCE)
        .is("metadata->contact_attempt_association", null)
        .gte("created_at", since)
        .limit(opts.limit ?? 50);
    let n = 0;
    for (const row of (data ?? []) as Array<{ id: string }>) {
        const r = await reconcileContactAttemptOnProviderAcceptance({ supabase, messageId: row.id });
        if (r.state === "associated") n += 1;
    }
    return n;
}
