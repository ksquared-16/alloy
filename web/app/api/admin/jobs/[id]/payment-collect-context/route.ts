import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { computeJobDisplayTotalCents, type JobPriceInput } from "@/lib/admin/jobDisplayPrice";
import { sumPaidAmountCents, type PaymentRowLike } from "@/lib/admin/jobPaymentSummary";
import { fetchPaymentStatusKeyByIdMap } from "@/lib/admin/resolvePaymentStatusKeys";

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
 * ?schedule_id= optional — when set, must belong to this job.
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

    const j = job as JobPriceInput & { id: string; customer_id: string | null };
    const jobOriginalCents = computeJobDisplayTotalCents(j);

    const { data: payRows } = await supabase
        .from("payments")
        .select("amount_cents, paid_at, status_key, payment_status_id")
        .eq("job_id", jobId);

    const payStatusMap = await fetchPaymentStatusKeyByIdMap(
        supabase,
        (payRows ?? []).map((p) => (p as { payment_status_id?: string | null }).payment_status_id)
    );
    const rowsForSum: PaymentRowLike[] = (payRows ?? []).map((p) => {
        const raw = p as {
            amount_cents?: number;
            paid_at?: string | null;
            status_key?: string | null;
            payment_status_id?: string | null;
        };
        const col =
            raw.status_key != null && String(raw.status_key).trim() !== ""
                ? String(raw.status_key).trim().toLowerCase()
                : null;
        const fk = raw.payment_status_id ? payStatusMap.get(raw.payment_status_id) : undefined;
        const resolved = col ?? fk ?? null;
        return {
            amount_cents: raw.amount_cents,
            paid_at: raw.paid_at ?? null,
            status_key: resolved,
            payment_statuses: resolved ? { key: resolved } : null,
        };
    });

    const paidCents = sumPaidAmountCents(rowsForSum);

    const jobOriginalSafe = jobOriginalCents != null && jobOriginalCents > 0 ? jobOriginalCents : null;
    const basisForBalance = jobOriginalSafe ?? 0;
    const jobBalanceCents = Math.max(0, basisForBalance - paidCents);

    let scheduleOriginalCents: number | null = null;
    if (scheduleId) {
        const { data: sched } = await supabase
            .from("schedules")
            .select("id, job_id, price_cents")
            .eq("id", scheduleId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const s = sched as { job_id?: string; price_cents?: number | null } | null;
        if (!s || s.job_id !== jobId) {
            return NextResponse.json({ error: "Schedule not found for this job" }, { status: 400 });
        }
        if (s.price_cents != null && Number.isFinite(Number(s.price_cents)) && Number(s.price_cents) > 0) {
            scheduleOriginalCents = Math.max(0, Math.round(Number(s.price_cents)));
        } else if (jobOriginalSafe != null) {
            scheduleOriginalCents = jobOriginalSafe;
        }
    }

    /** Default for this schedule line: cap by remaining job balance when we have both. */
    const scheduleBalanceCents =
        scheduleOriginalCents != null ? Math.max(0, Math.min(scheduleOriginalCents, jobBalanceCents)) : null;

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
            original_cents: jobOriginalSafe,
            paid_cents: paidCents,
            balance_cents: jobBalanceCents,
        },
        schedule:
            scheduleId && scheduleOriginalCents != null
                ? {
                      schedule_id: scheduleId,
                      original_cents: scheduleOriginalCents,
                      /** Same job-level sum; payments are stored on the job today. */
                      paid_cents: paidCents,
                      balance_cents: scheduleBalanceCents ?? Math.max(0, scheduleOriginalCents - paidCents),
                  }
                : null,
        customer,
        saved_card_label: savedCardLabel,
        /** Payments without paid_at are not counted toward "already paid" (pending/failed). */
        paid_attribution: "job" as const,
    });
}
