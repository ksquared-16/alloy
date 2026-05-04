import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { applyOutboundProviderDeliveryPatch } from "@/lib/communications/providerDeliveryPersistence";

/**
 * POST /api/webhooks/resend — Resend email lifecycle (Svix-signed).
 * Configure URL in Resend dashboard; set RESEND_WEBHOOK_SECRET in env.
 */
export async function POST(request: NextRequest) {
    const secret = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
    if (!secret) {
        return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET not configured" }, { status: 503 });
    }

    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: "Missing Svix signature headers" }, { status: 400 });
    }

    const payload = await request.text();
    let evt: Record<string, unknown>;
    try {
        evt = new Webhook(secret).verify(payload, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
        }) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const type = String(evt.type ?? "").toLowerCase();
    const data = evt.data != null && typeof evt.data === "object" ? (evt.data as Record<string, unknown>) : {};
    const emailId =
        typeof data.email_id === "string"
            ? data.email_id.trim()
            : typeof data.id === "string"
              ? data.id.trim()
              : "";

    if (!emailId) {
        return NextResponse.json({ ok: true, ignored: true, reason: "no_email_id" });
    }

    const supabase = createAdminClient();
    const metaEvent = { source: "resend", type };

    if (type === "email.delivered") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: {
                status: "delivered",
                delivered_at: new Date().toISOString(),
                metadata_event: metaEvent,
            },
        });
        return jsonWebhookResult(r);
    }

    if (type === "email.bounced" || type === "email.complained") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: {
                status: "bounced",
                metadata_event: metaEvent,
            },
        });
        return jsonWebhookResult(r);
    }

    if (type === "email.failed") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: {
                status: "failed",
                metadata_event: metaEvent,
            },
        });
        return jsonWebhookResult(r);
    }

    if (type === "email.delivery_delayed") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: {
                metadata_event: { ...metaEvent, delayed: true },
            },
        });
        return jsonWebhookResult(r);
    }

    if (type === "email.sent") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: {
                metadata_event: metaEvent,
            },
        });
        return jsonWebhookResult(r);
    }

    return NextResponse.json({ ok: true, ignored: true, type });
}

function jsonWebhookResult(r: import("@/lib/communications/providerDeliveryPersistence").ProviderDeliveryApplyResult) {
    if (!r.ok && r.reason === "message_not_found_or_not_outbound") {
        return NextResponse.json({ ok: true, ignored: true, reason: r.reason });
    }
    if (!r.ok) {
        return NextResponse.json({ ok: false, reason: r.reason }, { status: 422 });
    }
    return NextResponse.json({ ok: true, message_id: r.message_id, updated: r.updated });
}
