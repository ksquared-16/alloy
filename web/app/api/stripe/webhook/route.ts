import { NextRequest, NextResponse } from "next/server";

import { handleStripeWebhook } from "@/lib/financials/payments/stripeWebhook";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST /api/stripe/webhook — the Connect-aware Stripe boundary.
 *
 * New infrastructure, not the GHL webhook that was deleted with that retirement. That one served a
 * single-tenant cleaning funnel on the platform account and authenticated with a workflow secret;
 * this one is for direct charges on many connected accounts and authenticates with Stripe's own
 * signature.
 *
 * ── WHY THIS ROUTE IS DELIBERATELY THIN ──
 *
 * Everything that matters is in `handleStripeWebhook`, so it can be certified directly against real
 * Postgres and real signed payloads without standing up HTTP. The route's only real jobs are to hand
 * over the RAW body — re-serialising parsed JSON changes bytes and every signature then fails — and
 * to keep the signing secret server-side.
 *
 * ── WHY IT IS UNAUTHENTICATED, WHICH IS NOT THE SAME AS UNPROTECTED ──
 *
 * Stripe cannot present an Alloy session. The signature IS the authentication, it is checked before
 * anything in the body is treated as meaningful, and tenancy is resolved afterwards from the
 * connected account through the merchant binding rather than from anything the payload asserts.
 *
 * A 200 with a non-`applied` outcome is correct and intentional: a duplicate, a stale ordering or an
 * unknown account are all handled outcomes, and telling Stripe they failed would earn an endless
 * redelivery of an event that has nowhere to go.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    // The raw text, before any parsing. This is load-bearing.
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");

    try {
        const result = await handleStripeWebhook(createAdminClient(), rawBody, signature, secret);
        return NextResponse.json(
            { ok: result.outcome !== "rejected", outcome: result.outcome, detail: result.detail },
            { status: result.status },
        );
    } catch (e) {
        // A genuine server fault: 500 asks Stripe to redeliver, which is what we want when the
        // failure was ours rather than the event's.
        return NextResponse.json(
            { ok: false, outcome: "error", detail: e instanceof Error ? e.message : "unhandled" },
            { status: 500 },
        );
    }
}
