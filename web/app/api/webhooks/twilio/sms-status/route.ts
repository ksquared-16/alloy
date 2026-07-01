import { NextRequest } from "next/server";
import { handleTwilioSmsStatus } from "@/lib/communications/twilioSmsStatusWebhook";

/**
 * POST /api/webhooks/twilio/sms-status — Twilio status callback (form POST).
 * Bare path: verifies with the global TWILIO_AUTH_TOKEN (sandbox + legacy bindings).
 * Per-tenant subaccounts should use /api/webhooks/twilio/sms-status/[binding_id].
 */
export async function POST(request: NextRequest) {
    return handleTwilioSmsStatus(request, { bindingId: null });
}
