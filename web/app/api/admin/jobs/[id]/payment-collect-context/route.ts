import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { computeJobBalanceSnapshot, getJobPricingTotalCents } from "@/lib/admin/jobPaymentBalances";

function formatCardBrand(brand: string | null | undefined): string {
    if (!brand || !String(brand).trim()) return "Card";
    const b = String(brand).toLowerCase();
    const map: Record<string, string> = {
        visa: "Visa",
        mastercard: "Mastercard",
        amex: "American Express",
        discover: "Discover",
        diners: "Diners Club",
        jcb: "JCB",
        unionpay: "UnionPay",
    };
    return map[b] ?? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
}

/**
 * GET: financial + customer card summary for admin Collect Payment modal.
 * ?schedule_id= optional — when set, must belong to this job; returned only in `schedule_context` (informational).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const scheduleId = request.nextUrl.searchParams.get("schedule_id")?.trim() || null;

    const supabase = createAdminClient();

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select(
            "id, customer_id, org_id, gross_price_cents, estimated_total_cents, discount_amount, discounted, recurring_total_cents"
        )
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (jobErr || !job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const j = job as { id: string; customer_id: string | null };
    const balanceSnap = await computeJobBalanceSnapshot(supabase, ctx.orgId, jobId);
    const jobTotalCents = balanceSnap.job_total_cents ?? (await getJobPricingTotalCents(supabase, ctx.orgId, jobId));

    const paidCents = balanceSnap.paid_amount_cents;
    const pendingAllocatedCents = balanceSnap.pending_payment_amount_cents;

    const jobOriginalSafe = jobTotalCents != null && jobTotalCents > 0 ? jobTotalCents : null;
    const basisForBalance = jobOriginalSafe ?? 0;
    const jobBalanceCents =
        balanceSnap.outstanding_balance_cents != null
            ? balanceSnap.outstanding_balance_cents
            : Math.max(0, basisForBalance - paidCents);

    let schedule_context: { visit_start_at: string | null; list_price_cents: number | null } | null = null;
    if (scheduleId) {
        const { data: sched } = await supabase
            .from("schedules")
            .select("id, job_id, price_cents, start_at")
            .eq("id", scheduleId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const s = sched as { job_id?: string; price_cents?: number | null; start_at?: string | null } | null;
        if (!s || s.job_id !== jobId) {
            return NextResponse.json({ error: "Schedule not found for this job" }, { status: 400 });
        }
        let listPrice: number | null = null;
        if (s.price_cents != null && Number.isFinite(Number(s.price_cents)) && Number(s.price_cents) > 0) {
            listPrice = Math.max(0, Math.round(Number(s.price_cents)));
        }
        schedule_context = {
            visit_start_at: s.start_at != null ? String(s.start_at) : null,
            list_price_cents: listPrice,
        };
    }

    const customerId = j.customer_id;
    let customer: {
        id: string;
        stripe_customer_id: string | null;
        default_payment_method_id: string | null;
        payment_method_brand: string | null;
        payment_method_last4: string | null;
    } | null = null;

    if (customerId) {
        const { data: cust } = await supabase
            .from("customers")
            .select("id, stripe_customer_id, default_payment_method_id, payment_method_brand, payment_method_last4")
            .eq("id", customerId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (cust) {
            const c = cust as {
                id: string;
                stripe_customer_id?: string | null;
                default_payment_method_id?: string | null;
                payment_method_brand?: string | null;
                payment_method_last4?: string | null;
            };
            let payment_method_brand = c.payment_method_brand ?? null;
            let payment_method_last4 = c.payment_method_last4 ?? null;
            const defPm = c.default_payment_method_id?.trim() || null;
            const missingCardMeta =
                !payment_method_brand ||
                !String(payment_method_brand).trim() ||
                !payment_method_last4 ||
                !String(payment_method_last4).trim();
            if (missingCardMeta) {
                const { data: pmRows, error: pmErr } = await supabase
                    .from("customer_payment_methods")
                    .select(
                        "payment_method_brand, payment_method_last4, brand, last4, stripe_payment_method_id, is_default"
                    )
                    .eq("customer_id", customerId);
                if (pmErr) {
                    console.warn("[payment-collect-context] customer_payment_methods lookup skipped:", pmErr.message);
                }
                if (!pmErr && pmRows && pmRows.length > 0) {
                    type Pm = {
                        payment_method_brand?: string | null;
                        payment_method_last4?: string | null;
                        brand?: string | null;
                        last4?: string | null;
                        stripe_payment_method_id?: string | null;
                        is_default?: boolean | null;
                    };
                    const list = pmRows as Pm[];
                    const match =
                        (defPm ? list.find((p) => String(p.stripe_payment_method_id ?? "").trim() === defPm) : null) ??
                        list.find((p) => p.is_default === true) ??
                        list[0];
                    if (match) {
                        const b = match.payment_method_brand ?? match.brand ?? null;
                        const l4 = match.payment_method_last4 ?? match.last4 ?? null;
                        if (!payment_method_brand || !String(payment_method_brand).trim()) {
                            payment_method_brand = b ?? payment_method_brand;
                        }
                        if (!payment_method_last4 || !String(payment_method_last4).trim()) {
                            payment_method_last4 = l4 ?? payment_method_last4;
                        }
                    }
                }
            }
            customer = {
                id: c.id,
                stripe_customer_id: c.stripe_customer_id ?? null,
                default_payment_method_id: c.default_payment_method_id ?? null,
                payment_method_brand,
                payment_method_last4,
            };
        }
    }

    const savedCardLabel =
        customer?.payment_method_last4 && String(customer.payment_method_last4).trim()
            ? `${formatCardBrand(customer.payment_method_brand)} ending in ${String(customer.payment_method_last4).trim()}`
            : customer?.stripe_customer_id
              ? "Saved card on file"
              : null;

    return NextResponse.json({
        job: {
            /** @deprecated use job_total_cents — kept for collect-payment modal compatibility */
            original_cents: jobOriginalSafe,
            job_total_cents: jobTotalCents,
            paid_cents: paidCents,
            balance_cents: jobBalanceCents,
            pending_payment_amount_cents: pendingAllocatedCents,
        },
        schedule_context,
        customer,
        saved_card_label: savedCardLabel,
        /** Value kept as `job` for client typing; amounts use allocations + posted payments. */
        paid_attribution: "job" as const,
    });
}
