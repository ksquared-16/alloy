import { NextRequest } from "next/server";
import { handleTwilioSmsStatus } from "@/lib/communications/twilioSmsStatusWebhook";

/**
 * POST /api/webhooks/twilio/sms-status/[binding_id] — per-tenant Twilio status callback.
 * The binding id (set by the outbound statusCallback URL, P3.1) lets us resolve the per-tenant
 * verification token (subaccount via env:* secret_ref) before checking the signature.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ binding_id: string }> },
) {
    const { binding_id } = await params;
    return handleTwilioSmsStatus(request, { bindingId: binding_id });
}
