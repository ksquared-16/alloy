import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/** Lookup column in payment_statuses (use 'code' or 'name' if your table differs). */
const PAYMENT_STATUS_LOOKUP_COLUMN = "key";

/**
 * Resolve payment_statuses.id (UUID) for pending, paid, failed. Returns null if any missing.
 * Narrows row type via runtime checks; no Record<string, string> cast.
 */
async function getPaymentStatusIds(supabase: ReturnType<typeof createAdminClient>): Promise<{ pending: string; paid: string; failed: string } | null> {
    const { data: rows, error } = await supabase
        .from("payment_statuses")
        .select("id, " + PAYMENT_STATUS_LOOKUP_COLUMN)
        .in(PAYMENT_STATUS_LOOKUP_COLUMN, ["pending", "paid", "failed"]);
    if (error || !rows?.length) return null;
    const byKey: Record<string, string> = {};
    for (const r of rows) {
        if (r === null || typeof r !== "object") continue;
        const o = r as Record<string, unknown>;
        const id = o.id;
        const lookupVal = o[PAYMENT_STATUS_LOOKUP_COLUMN];
        if (typeof id === "string" && typeof lookupVal === "string" && lookupVal) {
            byKey[lookupVal] = id;
        }
    }
    if (!byKey.pending || !byKey.paid || !byKey.failed) return null;
    return { pending: byKey.pending, paid: byKey.paid, failed: byKey.failed };
}

/**
 * POST /api/admin/payments/run
 * Create a payment record and charge the customer's saved payment method via Stripe PaymentIntent.
 * Body: { job_id: string, amount_cents?: number }
 * - If amount_cents omitted, uses job.estimated_total_cents or job.recurring_total_cents (fallback).
 * - Aligns with live schema: payment_status_id UUID FK, provider, org_id, currency 'USD'.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey?.trim()) {
        return NextResponse.json(
            { error: "STRIPE_SECRET_KEY is not configured" },
            { status: 500 }
        );
    }

    let body: { job_id?: string; amount_cents?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const jobId = body.job_id;
    if (!jobId || typeof jobId !== "string") {
        return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Resolve payment_statuses UUIDs (pending, paid, failed)
    const statusIds = await getPaymentStatusIds(supabase);
    if (!statusIds) {
        return NextResponse.json(
            { error: "Could not resolve payment_statuses (pending/paid/failed). Check payment_statuses table and PAYMENT_STATUS_LOOKUP_COLUMN." },
            { status: 500 }
        );
    }

    // Load job (include org_id if present; else we resolve from opportunity)
    const { data: job, error: jobError } = await supabase
        .from("jobs")
        .select("id, customer_id, opportunity_id, org_id, estimated_total_cents, recurring_total_cents")
        .eq("id", jobId)
        .single();

    if (jobError || !job) {
        return NextResponse.json(
            { error: jobError?.message ?? "Job not found" },
            { status: 404 }
        );
    }

    let orgId: string | null = (job as { org_id?: string | null }).org_id ?? null;
    if (!orgId && (job as { opportunity_id?: string | null }).opportunity_id) {
        const { data: opp } = await supabase
            .from("opportunities")
            .select("org_id")
            .eq("id", (job as { opportunity_id: string }).opportunity_id)
            .single();
        orgId = (opp as { org_id?: string | null } | null)?.org_id ?? null;
    }
    if (!orgId) orgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;

    const customerId = (job as { customer_id?: string | null }).customer_id;
    if (!customerId) {
        return NextResponse.json(
            { error: "Job has no customer_id" },
            { status: 400 }
        );
    }

    // Load customer and default payment method (from customers table)
    const { data: customer, error: custError } = await supabase
        .from("customers")
        .select("id, stripe_customer_id, default_payment_method_id")
        .eq("id", customerId)
        .single();

    if (custError || !customer) {
        return NextResponse.json(
            { error: custError?.message ?? "Customer not found" },
            { status: 404 }
        );
    }

    const stripeCustomerId = (customer as { stripe_customer_id?: string | null }).stripe_customer_id;
    const defaultPaymentMethodId = (customer as { default_payment_method_id?: string | null }).default_payment_method_id;

    if (!stripeCustomerId) {
        return NextResponse.json(
            { error: "Customer has no stripe_customer_id (card not saved)" },
            { status: 400 }
        );
    }

    let amountCents = typeof body.amount_cents === "number" ? body.amount_cents : undefined;
    if (amountCents == null || amountCents < 1) {
        const estimated = (job as { estimated_total_cents?: number | null }).estimated_total_cents;
        const recurring = (job as { recurring_total_cents?: number | null }).recurring_total_cents;
        amountCents = (estimated ?? recurring ?? 0) || 0;
    }
    if (amountCents < 1) {
        return NextResponse.json(
            { error: "amount_cents required (or job must have estimated_total_cents/recurring_total_cents)" },
            { status: 400 }
        );
    }

    // Create payments row (status = pending, provider = stripe, currency USD)
    const { data: paymentRow, error: insertError } = await supabase
        .from("payments")
        .insert({
            job_id: jobId,
            customer_id: customerId,
            amount_cents: amountCents,
            currency: "USD",
            payment_status_id: statusIds.pending,
            provider: "stripe",
            org_id: orgId ?? undefined,
            metadata: { source: "payments_run", requested_at: new Date().toISOString() },
        })
        .select("id")
        .single();

    if (insertError || !paymentRow) {
        console.error("[PAYMENTS_RUN] insert payment failed", insertError);
        return NextResponse.json(
            { error: insertError?.message ?? "Failed to create payment record" },
            { status: 500 }
        );
    }

    const paymentId = (paymentRow as { id: string }).id;

    const stripe = new Stripe(secretKey);

    // Resolve payment method: use default or first on customer
    let paymentMethodId: string | null = defaultPaymentMethodId ?? null;

    if (!paymentMethodId) {
        const pmList = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: "card",
            limit: 1,
        });
        paymentMethodId = pmList.data[0]?.id ?? null;
    }

    if (!paymentMethodId) {
        await supabase
            .from("payments")
            .update({
                payment_status_id: statusIds.failed,
                metadata: { error: "No payment method found for customer" },
                updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
        return NextResponse.json(
            { error: "No payment method found for customer" },
            { status: 400 }
        );
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: "usd",
            customer: stripeCustomerId,
            payment_method: paymentMethodId,
            confirm: true,
            off_session: true,
            metadata: {
                job_id: jobId,
                customer_id: customerId,
                payment_id: paymentId,
            },
        });

        // Update payment with provider_payment_id immediately so webhook can find it
        await supabase
            .from("payments")
            .update({
                provider_payment_id: paymentIntent.id,
                updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);

        if (paymentIntent.status === "succeeded") {
            await supabase
                .from("payments")
                .update({
                    payment_status_id: statusIds.paid,
                    paid_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", paymentId);
            return NextResponse.json({
                ok: true,
                payment_id: paymentId,
                provider_payment_id: paymentIntent.id,
                status: "succeeded",
                amount_cents: amountCents,
            });
        }

        if (paymentIntent.status === "requires_action") {
            await supabase
                .from("payments")
                .update({
                    payment_status_id: statusIds.failed,
                    metadata: { error: "Payment requires customer authentication (SCA)" },
                    updated_at: new Date().toISOString(),
                })
                .eq("id", paymentId);
            return NextResponse.json({
                ok: false,
                payment_id: paymentId,
                provider_payment_id: paymentIntent.id,
                error: "Payment requires customer authentication",
                status: "requires_action",
            }, { status: 400 });
        }

        // Other failure status
        const errMsg = (paymentIntent as { last_payment_error?: { message?: string } }).last_payment_error?.message ?? paymentIntent.status;
        await supabase
            .from("payments")
            .update({
                payment_status_id: statusIds.failed,
                metadata: { error: errMsg },
                updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
        return NextResponse.json({
            ok: false,
            payment_id: paymentId,
            provider_payment_id: paymentIntent.id,
            error: errMsg,
            status: paymentIntent.status,
        }, { status: 400 });
    } catch (err: unknown) {
        const stripeErr = err as Stripe.errors.StripeError & { message?: string };
        const message = stripeErr?.message ?? String(err);
        await supabase
            .from("payments")
            .update({
                payment_status_id: statusIds.failed,
                metadata: { error: message },
                updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);
        return NextResponse.json(
            { error: message, payment_id: paymentId },
            { status: 500 }
        );
    }
}
