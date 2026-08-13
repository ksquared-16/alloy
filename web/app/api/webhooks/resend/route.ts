import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    applyOutboundProviderDeliveryPatch,
    type ProviderDeliveryApplyResult,
} from "@/lib/communications/providerDeliveryPersistence";
import { resendTypeToCanonical } from "@/lib/communications/v2/deliveryReceiptMapping";
import { normalizeResendReceivedEvent } from "@/lib/communications/email/inboundEmailNormalization";
import { ingestResendInboundEmail } from "@/lib/communications/email/inboundEmailIngestion";
import { fetchReceivedEmail } from "@/lib/communications/email/resendReceivingClient";

/** Provider timestamp when supplied, otherwise now. */
function occurredAtOf(data: Record<string, unknown>): string {
    const raw = data.created_at;
    return typeof raw === "string" && raw.trim() ? raw : new Date().toISOString();
}

/**
 * The credential used to RETRIEVE received email content.
 *
 * Deliberately the same environment key the send path falls back to, so receiving
 * cannot silently run on a different credential than sending.
 */
function resendApiKey(): string {
    return (process.env.RESEND_API_KEY ?? "").trim();
}

function providerMessageIdTail(id: string): string {
    const t = id.trim();
    if (!t) return "(empty)";
    return t.length > 8 ? t.slice(-8) : t;
}

/** Safe structured log for Resend lifecycle (no secrets, no full recipient). */
function logResendWebhookDeliveryOutcome(
    eventType: string,
    providerMessageId: string,
    result: ProviderDeliveryApplyResult
): void {
    const tail = providerMessageIdTail(providerMessageId);
    const base: Record<string, unknown> = { event_type: eventType, provider_id_tail: tail };
    if (result.ok) {
        console.info(
            "[resend-webhook]",
            JSON.stringify({
                ...base,
                message_id: result.message_id,
                updated: result.updated,
            })
        );
    } else {
        console.warn(
            "[resend-webhook]",
            JSON.stringify({
                ...base,
                outcome: "not_applied",
                reason: result.reason,
            })
        );
    }
}

/**
 * POST /api/webhooks/resend — Resend email lifecycle (Svix-signed).
 *
 * **Public endpoint:** Session/admin auth MUST NOT gate this route. `web/middleware.ts` skips Supabase session
 * work here; security is **Svix** headers + `RESEND_WEBHOOK_SECRET` (`Webhook.verify`).
 *
 * Configure URL in Resend dashboard; set `RESEND_WEBHOOK_SECRET` in env.
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

    // ------------------------------------------------------------- INBOUND
    //
    // A received email, not a delivery receipt for one Alloy sent. It shares this
    // route because it shares the thing that makes the route trustworthy: Svix
    // verification against RESEND_WEBHOOK_SECRET, already done above. A second
    // route would mean a second copy of that, and provider authenticity should
    // have exactly one implementation.
    //
    // Provider parsing stays here at the edge; everything downstream is the
    // channel-neutral canonical runtime.
    if (type === "email.received") {
        const event = normalizeResendReceivedEvent(data, { receivedAtFallback: occurredAtOf(data) });
        if (!event) {
            // Unusable shape. Acknowledged rather than refused: redelivering it
            // would produce the same unusable shape forever.
            return NextResponse.json({ ok: true, ignored: true, reason: "unusable_received_payload" });
        }

        const outcome = await ingestResendInboundEmail(event, {
            supabase,
            retrieve: (id) => fetchReceivedEmail({ emailId: id, apiKey: resendApiKey() }),
        });

        // The ONLY case that refuses the webhook. Resend retries, and the retry
        // finds the receipt already claimed and continues from there rather than
        // starting again — which is why a 5xx here is safe.
        if (outcome.status === "retrieval_pending") {
            return NextResponse.json(
                { ok: false, status: outcome.status, reason: outcome.reason },
                { status: 503 }
            );
        }

        return NextResponse.json({ ok: true, status: outcome.status });
    }

    const canonical = resendTypeToCanonical(type);
    const occurredAt = typeof data.created_at === "string" && data.created_at.trim() ? data.created_at : new Date().toISOString();
    const providerEventId = typeof evt.id === "string" && evt.id.trim() ? evt.id.trim() : undefined;
    const metaEvent = { source: "resend", type };

    // Build the provider-neutral receipt (drives append-only event + per-recipient state) when the
    // event maps to a canonical transition. delivery_delayed and unknown types: metadata only.
    const receipt = canonical
        ? {
              provider: "resend",
              channel: "email",
              event_type: canonical,
              event_status: type,
              provider_event_id: providerEventId,
              occurred_at: occurredAt,
              raw_payload: data,
          }
        : undefined;

    if (type === "email.delivered") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: { status: "delivered", delivered_at: occurredAt, metadata_event: metaEvent, receipt },
        });
        logResendWebhookDeliveryOutcome(type, emailId, r);
        return jsonWebhookResult(r);
    }

    if (type === "email.opened") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: { opened_at: occurredAt, metadata_event: metaEvent, receipt },
        });
        logResendWebhookDeliveryOutcome(type, emailId, r);
        return jsonWebhookResult(r);
    }

    if (type === "email.clicked") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: { clicked_at: occurredAt, metadata_event: metaEvent, receipt },
        });
        logResendWebhookDeliveryOutcome(type, emailId, r);
        return jsonWebhookResult(r);
    }

    if (type === "email.bounced" || type === "email.complained") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: { status: "bounced", metadata_event: metaEvent, receipt },
        });
        logResendWebhookDeliveryOutcome(type, emailId, r);
        return jsonWebhookResult(r);
    }

    if (type === "email.failed") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: { status: "failed", metadata_event: metaEvent, receipt },
        });
        logResendWebhookDeliveryOutcome(type, emailId, r);
        return jsonWebhookResult(r);
    }

    if (type === "email.delivery_delayed") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: { metadata_event: { ...metaEvent, delayed: true } },
        });
        return jsonWebhookResult(r);
    }

    if (type === "email.sent") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: emailId,
            patch: { metadata_event: metaEvent, receipt },
        });
        return jsonWebhookResult(r);
    }

    return NextResponse.json({ ok: true, ignored: true, type });
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
