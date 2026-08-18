/**
 * Deliver a queued email using rendered_snapshot.html (friendly anchors + hrefs).
 *
 * The legacy/cloud dispatcher historically sent `communication_messages.body` as
 * text/plain only. Friendly Tour CTAs store the booking URL in `<a href>`, and
 * `toPlainText` used to drop those hrefs — so parents saw "Choose a tour time"
 * with nothing to click. Prefer snapshot HTML whenever Resend credentials exist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { mintOutboundMessageId } from "@/lib/communications/email/emailMessageId";
import {
    deriveOutboundThreadHeaders,
    outboundEmailHeaders,
    type ThreadHeaderHistoryRow,
} from "@/lib/communications/email/outboundEmailHeaders";
import { resolveVisibleReplyIdentity } from "@/lib/communications/identity/visibleEmailIdentity";

type DeliverResult =
    | { ok: true; providerMessageId: string | null }
    | { ok: false; reason: string };

/**
 * The conversation's email history, ORG-SCOPED and oldest first.
 *
 * Only rows that actually carry a Message-ID are evidence; the rest contribute
 * nothing and are filtered at the query rather than in the derivation, so the
 * pure function never has to reason about absence.
 */
async function loadThreadHeaderHistory(
    supabase: SupabaseClient,
    orgId: string,
    threadId: string
): Promise<ThreadHeaderHistoryRow[]> {
    const { data } = await supabase
        .from("communication_messages")
        .select("email_message_id, direction, created_at")
        .eq("org_id", orgId)
        .eq("thread_id", threadId)
        .eq("channel", "email")
        .not("email_message_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(100);
    return (data ?? []) as ThreadHeaderHistoryRow[];
}

function htmlFromSnapshot(snapshot: unknown): string | null {
    if (!snapshot || typeof snapshot !== "object") return null;
    const html = (snapshot as { html?: unknown }).html;
    if (typeof html !== "string") return null;
    const trimmed = html.trim();
    return trimmed || null;
}

function textFromSnapshot(snapshot: unknown, fallback: string): string {
    if (snapshot && typeof snapshot === "object") {
        const text = (snapshot as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) return text.trim();
    }
    return fallback;
}

export async function deliverQueuedEmailHtml(params: {
    supabase: SupabaseClient;
    messageId: string;
    resendApiKey?: string | null;
}): Promise<DeliverResult> {
    const apiKey = String(params.resendApiKey ?? process.env.RESEND_API_KEY ?? "").trim();
    if (!apiKey) return { ok: false, reason: "resend_api_key_missing" };

    const { data: row, error } = await params.supabase
        .from("communication_messages")
        .select("id, org_id, thread_id, status, channel, subject, body, to_address, from_address, rendered_snapshot, communication_provider_binding_id")
        .eq("id", params.messageId)
        .maybeSingle();
    if (error || !row) return { ok: false, reason: "message_not_found" };
    if (String(row.channel ?? "").toLowerCase() !== "email") return { ok: false, reason: "not_email" };
    if (String(row.status ?? "") === "sent") return { ok: true, providerMessageId: null };

    const html = htmlFromSnapshot(row.rendered_snapshot);
    if (!html || !/\shref\s*=/i.test(html)) return { ok: false, reason: "snapshot_html_missing_href" };

    let fromEmail = String(row.from_address ?? "").trim();
    let bindingInboundAddress: string | null = null;
    if (row.communication_provider_binding_id) {
        const { data: binding } = await params.supabase
            .from("communication_provider_bindings")
            .select("config, inbound_address")
            .eq("id", row.communication_provider_binding_id)
            .maybeSingle();
        const cfg = (binding?.config ?? {}) as Record<string, unknown>;
        if (!fromEmail) fromEmail = String(cfg.from_email ?? "").trim();
        bindingInboundAddress = String(binding?.inbound_address ?? "").trim() || null;
    }
    fromEmail = fromEmail || String(process.env.RESEND_FROM_EMAIL ?? "").trim();
    if (!fromEmail) return { ok: false, reason: "from_email_missing" };

    const toEmail = String(row.to_address ?? "").trim();
    if (!toEmail) return { ok: false, reason: "to_address_missing" };

    const text = textFromSnapshot(row.rendered_snapshot, String(row.body ?? ""));

    // ---- RFC THREADING ------------------------------------------------------
    // Minted here rather than left to the provider, because the id must be
    // derivable BACK to this canonical message when the parent's client echoes
    // it in `In-Reply-To`. Without this the strongest correlation evidence Alloy
    // ranks — `in_reply_to` — has nothing of ours to match, and every reply falls
    // through to endpoint provenance, which goes ambiguous as soon as a parent
    // has two conversations open.
    const orgId = String(row.org_id ?? "").trim();
    const threadId = String(row.thread_id ?? "").trim();
    const emailMessageId = mintOutboundMessageId({
        communicationMessageId: String(row.id),
        fromEmail,
    });
    const history =
        orgId && threadId ? await loadThreadHeaderHistory(params.supabase, orgId, threadId) : [];
    const { inReplyTo, references } = deriveOutboundThreadHeaders(history);
    const headers = outboundEmailHeaders({ messageId: emailMessageId, inReplyTo, references });

    const payload: Record<string, unknown> = {
        from: fromEmail,
        to: [toEmail],
        subject: String(row.subject ?? "").trim() || "(no subject)",
        html,
    };
    if (text) payload.text = text;
    if (Object.keys(headers).length > 0) payload.headers = headers;

    // Where a reply goes, stated rather than inherited from the provider's
    // default. Always the VISIBLE identity — never an ingress destination, which
    // a parent would otherwise keep in their sent mail and address book forever.
    const replyTo = resolveVisibleReplyIdentity({ fromEmail, inboundAddress: bindingInboundAddress });
    if (replyTo && replyTo !== fromEmail.toLowerCase()) payload.reply_to = replyTo;

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
        return { ok: false, reason: `resend_http_${res.status}:${String(json.message ?? "").slice(0, 120)}` };
    }

    const providerMessageId = typeof json.id === "string" ? json.id : null;
    const now = new Date().toISOString();
    await params.supabase
        .from("communication_messages")
        .update({
            status: "sent",
            sent_at: now,
            provider: "resend",
            provider_message_id: providerMessageId,
            error: null,
            from_address: fromEmail,
            // Persisted because it is what an inbound reply correlates against.
            // A header sent and not recorded is a header that cannot be matched:
            // `threadsForAlloyMessageIds` resolves the parsed id by primary key,
            // and the References chain on the NEXT outbound is built from this
            // column. Omitting it broke both directions at once.
            ...(emailMessageId ? { email_message_id: emailMessageId } : {}),
        })
        .eq("id", params.messageId)
        .eq("status", "queued");

    return { ok: true, providerMessageId };
}
