/**
 * Deliver a queued email using rendered_snapshot.html (friendly anchors + hrefs).
 *
 * The legacy/cloud dispatcher historically sent `communication_messages.body` as
 * text/plain only. Friendly Tour CTAs store the booking URL in `<a href>`, and
 * `toPlainText` used to drop those hrefs — so parents saw "Choose a tour time"
 * with nothing to click. Prefer snapshot HTML whenever Resend credentials exist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type DeliverResult =
    | { ok: true; providerMessageId: string | null }
    | { ok: false; reason: string };

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
        .select("id, status, channel, subject, body, to_address, from_address, rendered_snapshot, communication_provider_binding_id")
        .eq("id", params.messageId)
        .maybeSingle();
    if (error || !row) return { ok: false, reason: "message_not_found" };
    if (String(row.channel ?? "").toLowerCase() !== "email") return { ok: false, reason: "not_email" };
    if (String(row.status ?? "") === "sent") return { ok: true, providerMessageId: null };

    const html = htmlFromSnapshot(row.rendered_snapshot);
    if (!html || !/\shref\s*=/i.test(html)) return { ok: false, reason: "snapshot_html_missing_href" };

    let fromEmail = String(row.from_address ?? "").trim();
    if (!fromEmail && row.communication_provider_binding_id) {
        const { data: binding } = await params.supabase
            .from("communication_provider_bindings")
            .select("config")
            .eq("id", row.communication_provider_binding_id)
            .maybeSingle();
        const cfg = (binding?.config ?? {}) as Record<string, unknown>;
        fromEmail = String(cfg.from_email ?? "").trim();
    }
    fromEmail = fromEmail || String(process.env.RESEND_FROM_EMAIL ?? "").trim();
    if (!fromEmail) return { ok: false, reason: "from_email_missing" };

    const toEmail = String(row.to_address ?? "").trim();
    if (!toEmail) return { ok: false, reason: "to_address_missing" };

    const text = textFromSnapshot(row.rendered_snapshot, String(row.body ?? ""));
    const payload: Record<string, unknown> = {
        from: fromEmail,
        to: [toEmail],
        subject: String(row.subject ?? "").trim() || "(no subject)",
        html,
    };
    if (text) payload.text = text;

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
        })
        .eq("id", params.messageId)
        .eq("status", "queued");

    return { ok: true, providerMessageId };
}
