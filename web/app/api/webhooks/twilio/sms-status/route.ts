import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    applyOutboundProviderDeliveryPatch,
    type ProviderDeliveryApplyResult,
} from "@/lib/communications/providerDeliveryPersistence";
import { verifyTwilioRequestSignature } from "@/lib/communications/twilioWebhookSignature";

/**
 * POST /api/webhooks/twilio/sms-status — Twilio status callback (form POST).
 * Point Twilio status callback URL here; set TWILIO_AUTH_TOKEN for signature validation.
 * If Alloy sits behind a proxy, set PUBLIC_TWILIO_WEBHOOK_BASE_URL to the public origin Twilio POSTs to
 * (same path `/api/webhooks/twilio/sms-status`) so the signature string matches Twilio’s.
 */
function twilioStatusCallbackPublicUrl(request: NextRequest): string {
    const configured =
        (process.env.PUBLIC_TWILIO_WEBHOOK_BASE_URL ?? "").trim() ||
        (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    if (configured) {
        const base = configured.replace(/\/$/, "");
        return `${base}/api/webhooks/twilio/sms-status`;
    }
    return request.nextUrl.origin + request.nextUrl.pathname;
}

export async function POST(request: NextRequest) {
    const authToken = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
    if (!authToken) {
        return NextResponse.json({ error: "TWILIO_AUTH_TOKEN not configured" }, { status: 503 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
        return NextResponse.json({ error: "Expected form body" }, { status: 400 });
    }

    const raw = await request.text();
    const params = new URLSearchParams(raw);
    const body: Record<string, string> = {};
    params.forEach((v, k) => {
        body[k] = v;
    });

    const signature = request.headers.get("x-twilio-signature");
    const url = twilioStatusCallbackPublicUrl(request);
    if (!verifyTwilioRequestSignature(authToken, signature, url, body)) {
        return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
    }

    const messageSid = (body.MessageSid ?? body.SmsSid ?? "").trim();
    if (!messageSid) {
        return NextResponse.json({ ok: true, ignored: true, reason: "no_message_sid" });
    }

    const status = (body.MessageStatus ?? body.SmsStatus ?? "").trim().toLowerCase();
    const errorCode = (body.ErrorCode ?? "").trim();

    const supabase = createAdminClient();
    const metaEvent = { source: "twilio", status, error_code: errorCode || undefined };

    if (status === "delivered") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: messageSid,
            patch: {
                status: "delivered",
                delivered_at: new Date().toISOString(),
                metadata_event: metaEvent,
            },
        });
        return jsonWebhookResult(r);
    }

    if (status === "failed" || status === "undelivered") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: messageSid,
            patch: {
                status: "failed",
                metadata_event: metaEvent,
            },
        });
        return jsonWebhookResult(r);
    }

    const r = await applyOutboundProviderDeliveryPatch({
        supabase,
        providerMessageId: messageSid,
        patch: {
            metadata_event: metaEvent,
        },
    });
    return jsonWebhookResult(r);
}

function jsonWebhookResult(r: ProviderDeliveryApplyResult) {
    if (!r.ok && r.reason === "message_not_found_or_not_outbound") {
        return NextResponse.json({ ok: true, ignored: true, reason: r.reason });
    }
    if (!r.ok) {
        return NextResponse.json({ ok: false, reason: r.reason }, { status: 422 });
    }
    return NextResponse.json({ ok: true, message_id: r.message_id, updated: r.updated });
}
