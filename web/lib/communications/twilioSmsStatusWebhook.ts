import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    applyOutboundProviderDeliveryPatch,
    type ProviderDeliveryApplyResult,
} from "@/lib/communications/providerDeliveryPersistence";
import { verifyTwilioRequestSignature } from "@/lib/communications/twilioWebhookSignature";
import { twilioStatusToCanonical } from "@/lib/communications/v2/deliveryReceiptMapping";
import { resolveTwilioAuthTokenFromSecretRef } from "@/lib/communications/twilioAuthToken";

/**
 * Shared handler for the Twilio status callback, used by both
 *   POST /api/webhooks/twilio/sms-status              (bindingId = null -> global token)
 *   POST /api/webhooks/twilio/sms-status/[binding_id] (per-tenant token resolved from the binding)
 *
 * Public endpoint (middleware skips session work). Security is X-Twilio-Signature verified against
 * the per-binding token (env:* via secret_ref), falling back to the global TWILIO_AUTH_TOKEN.
 */
type TwilioWebhookDiagnostic = {
    ok: boolean;
    provider: "twilio";
    received: true;
    signature: "valid" | "invalid";
    action: "applied" | "ignored" | "rejected";
    reason?: string;
    sid_tail?: string;
    status?: string;
    url_source?: "env_base" | "request_url";
    token_source?: "global" | "binding";
};

function sidTail(sid: string | null | undefined): string | undefined {
    const s = String(sid ?? "").trim();
    if (!s) return undefined;
    return s.length <= 10 ? s : s.slice(-10);
}

function twilioStatusCallbackSignatureUrl(
    request: NextRequest,
): { url: string; source: TwilioWebhookDiagnostic["url_source"] } {
    const configured =
        (process.env.PUBLIC_TWILIO_WEBHOOK_BASE_URL ?? "").trim() ||
        (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    if (configured) {
        const base = configured.replace(/\/$/, "");
        const path = request.nextUrl.pathname;
        const q = request.nextUrl.searchParams?.toString() ?? "";
        return { url: `${base}${path}${q ? `?${q}` : ""}`, source: "env_base" };
    }
    return { url: request.url, source: "request_url" };
}

function logTwilioStatus(event: string, payload: Record<string, unknown>) {
    console.log("[twilio.sms_status]", { event, ...payload });
}

function respond(status: number, d: TwilioWebhookDiagnostic) {
    return NextResponse.json(d, { status });
}

export async function handleTwilioSmsStatus(
    request: NextRequest,
    opts: { bindingId?: string | null },
) {
    const bindingId = (opts.bindingId ?? "").trim() || null;
    logTwilioStatus("webhook_received", {
        method: request.method,
        content_type: request.headers.get("content-type") ?? null,
        binding_scoped: Boolean(bindingId),
    });

    const globalToken = (process.env.TWILIO_AUTH_TOKEN ?? "").trim() || null;
    const supabase = createAdminClient();

    // Resolve the verification token: per-binding (env:* secret_ref) when a binding id is in the
    // path, else the global token. resolveTwilioAuthTokenFromSecretRef falls back to global.
    let authToken: string | null = globalToken;
    let tokenSource: "global" | "binding" = "global";
    if (bindingId) {
        const { data: binding } = await supabase
            .from("communication_provider_bindings")
            .select("secret_ref")
            .eq("id", bindingId)
            .maybeSingle();
        const resolved = resolveTwilioAuthTokenFromSecretRef(
            (binding as { secret_ref?: string | null } | null)?.secret_ref ?? null,
            process.env as Record<string, string | undefined>,
            globalToken,
        );
        authToken = resolved;
        tokenSource = resolved && resolved !== globalToken ? "binding" : "global";
    }

    if (!authToken) {
        logTwilioStatus("rejected", { reason: "no_auth_token", binding_scoped: Boolean(bindingId) });
        return respond(503, {
            ok: false,
            provider: "twilio",
            received: true,
            signature: "invalid",
            action: "rejected",
            reason: "Twilio auth token not configured",
            token_source: tokenSource,
        });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
        logTwilioStatus("rejected", { reason: "expected_form_body" });
        return respond(400, {
            ok: false,
            provider: "twilio",
            received: true,
            signature: "invalid",
            action: "rejected",
            reason: "Expected application/x-www-form-urlencoded body",
        });
    }

    const raw = await request.text();
    const params = new URLSearchParams(raw);
    const body: Record<string, string> = {};
    params.forEach((v, k) => {
        body[k] = v;
    });

    const signature = request.headers.get("x-twilio-signature");
    const sigUrl = twilioStatusCallbackSignatureUrl(request);
    const sigOk = verifyTwilioRequestSignature(authToken, signature, sigUrl.url, body);
    logTwilioStatus(sigOk ? "signature_valid" : "signature_invalid", {
        signature_present: Boolean(signature),
        url_source: sigUrl.source,
        url_path: request.nextUrl.pathname,
        token_source: tokenSource,
    });
    if (!sigOk) {
        return respond(403, {
            ok: false,
            provider: "twilio",
            received: true,
            signature: "invalid",
            action: "rejected",
            reason: "Invalid Twilio signature",
            url_source: sigUrl.source,
            token_source: tokenSource,
        });
    }

    const messageSid = (body.MessageSid ?? body.SmsSid ?? "").trim();
    if (!messageSid) {
        logTwilioStatus("ignored", { reason: "no_message_sid" });
        return respond(200, {
            ok: true,
            provider: "twilio",
            received: true,
            signature: "valid",
            action: "ignored",
            reason: "no_message_sid",
            url_source: sigUrl.source,
        });
    }

    const status = (body.MessageStatus ?? body.SmsStatus ?? "").trim().toLowerCase();
    const errorCode = (body.ErrorCode ?? "").trim();
    const sid_tail = sidTail(messageSid);
    logTwilioStatus("parsed", { status: status || null, sid_tail, error_code_present: Boolean(errorCode) });

    const canonical = twilioStatusToCanonical(status);
    const occurredAt = new Date().toISOString();
    const metaEvent = { source: "twilio", status, error_code: errorCode || undefined };

    const receipt = canonical
        ? {
              provider: "twilio",
              channel: "sms",
              event_type: canonical,
              event_status: status,
              occurred_at: occurredAt,
              raw_payload: { MessageStatus: status, ErrorCode: errorCode || undefined },
          }
        : undefined;

    if (status === "delivered") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: messageSid,
            patch: { status: "delivered", delivered_at: occurredAt, metadata_event: metaEvent, receipt },
        });
        return jsonWebhookResult(r, { sid_tail, status, url_source: sigUrl.source });
    }

    if (status === "failed" || status === "undelivered") {
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: messageSid,
            patch: { status: "failed", metadata_event: metaEvent, receipt },
        });
        return jsonWebhookResult(r, { sid_tail, status, url_source: sigUrl.source });
    }

    const r = await applyOutboundProviderDeliveryPatch({
        supabase,
        providerMessageId: messageSid,
        patch: { metadata_event: metaEvent, receipt },
    });
    return jsonWebhookResult(r, { sid_tail, status, url_source: sigUrl.source });
}

function jsonWebhookResult(
    r: ProviderDeliveryApplyResult,
    extra: Pick<TwilioWebhookDiagnostic, "sid_tail" | "status" | "url_source">,
) {
    if (!r.ok && r.reason === "message_not_found_or_not_outbound") {
        logTwilioStatus("patch_ignored", { reason: r.reason, sid_tail: extra.sid_tail, status: extra.status ?? null });
        return respond(200, {
            ok: true,
            provider: "twilio",
            received: true,
            signature: "valid",
            action: "ignored",
            reason: r.reason,
            sid_tail: extra.sid_tail,
            status: extra.status,
            url_source: extra.url_source,
        });
    }
    if (!r.ok) {
        logTwilioStatus("patch_rejected", { reason: r.reason, sid_tail: extra.sid_tail, status: extra.status ?? null });
        return respond(422, {
            ok: false,
            provider: "twilio",
            received: true,
            signature: "valid",
            action: "rejected",
            reason: r.reason,
            sid_tail: extra.sid_tail,
            status: extra.status,
            url_source: extra.url_source,
        });
    }
    logTwilioStatus("patch_applied", {
        message_id: r.message_id,
        updated: r.updated,
        sid_tail: extra.sid_tail,
        status: extra.status ?? null,
    });
    return respond(200, {
        ok: true,
        provider: "twilio",
        received: true,
        signature: "valid",
        action: "applied",
        reason: "patched",
        sid_tail: extra.sid_tail,
        status: extra.status,
        url_source: extra.url_source,
    });
}
