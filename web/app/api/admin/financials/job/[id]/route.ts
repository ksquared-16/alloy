import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { effectiveScheduleStatusKey, fetchScheduleStatusKeyByFk } from "@/lib/admin/scheduleEffectiveStatusKey";

export const dynamic = "force-dynamic";

const MAPPING_KEYS = ["revenue_service", "contra_discounts", "expense_vendor_payouts", "asset_cash_clearing", "liability_vendor_payable"] as const;

/** GET /api/admin/financials/job/[id] — job header + schedules (with posted?) + totals from gl_journal_lines. Admin/ops. */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select(
            "id, customer_id, assigned_vendor_id, gross_price_cents, estimated_total_cents, recurring_total_cents, discounted, discount_code, discount_amount, is_recurring, service_frequency_key"
        )
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const { data: scheduleRows } = await supabase
        .from("schedules")
        .select("id, status_key, schedule_status_id, start_at, assigned_vendor_id, price_cents, subscription_sequence")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .order("start_at", { ascending: true, nullsFirst: false });

    const schedules = (scheduleRows ?? []) as {
        id: string;
        status_key: string | null;
        schedule_status_id: string | null;
        start_at: string | null;
        assigned_vendor_id: string | null;
        price_cents: number | null;
        subscription_sequence: number | null;
    }[];
    const statusKeyByFk = await fetchScheduleStatusKeyByFk(
        supabase,
        schedules.map((s) => s.schedule_status_id)
    );

    const { data: entriesForJob } = await supabase
        .from("gl_journal_entries")
        .select("id, source_id")
        .eq("org_id", orgId)
        .eq("source_type", "schedule_completed")
        .in("source_id", schedules.map((s) => s.id));

    const postedScheduleIds = new Set((entriesForJob ?? []).map((e) => (e as { source_id: string }).source_id));

    const schedulesWithPosted = schedules.map((s) => ({
        id: s.id,
        status_key: effectiveScheduleStatusKey(s, statusKeyByFk) ?? s.status_key,
        start_at: s.start_at,
        assigned_vendor_id: s.assigned_vendor_id,
        price_cents: s.price_cents,
        subscription_sequence: s.subscription_sequence,
        visit_kind:
            s.subscription_sequence == null || s.subscription_sequence <= 1 ? ("first" as const) : ("recurring" as const),
        posted: postedScheduleIds.has(s.id),
    }));

    const { data: mappingsRows } = await supabase
        .from("gl_account_mappings")
        .select("key, gl_account_id")
        .eq("org_id", orgId)
        .in("key", [...MAPPING_KEYS]);

    const keyByAccountId = new Map<string, string>();
    (mappingsRows ?? []).forEach((r: { key: string; gl_account_id: string }) => {
        keyByAccountId.set(r.gl_account_id, r.key);
    });

    const { data: lines } = await supabase
        .from("gl_journal_lines")
        .select("account_id, debit_cents, credit_cents")
        .eq("org_id", orgId)
        .eq("job_id", jobId);

    const lineList = (lines ?? []) as { account_id: string; debit_cents: number; credit_cents: number }[];
    let total_revenue_credits = 0;
    let total_discount_debits = 0;
    let total_vendor_payout_debits = 0;
    let total_cash_debits = 0;
    let total_vendor_payable_credits = 0;

    for (const l of lineList) {
        const key = keyByAccountId.get(l.account_id);
        const debit = Number(l.debit_cents) || 0;
        const credit = Number(l.credit_cents) || 0;
        if (key === "revenue_service") total_revenue_credits += credit;
        else if (key === "contra_discounts") total_discount_debits += debit;
        else if (key === "expense_vendor_payouts") total_vendor_payout_debits += debit;
        else if (key === "asset_cash_clearing") total_cash_debits += debit;
        else if (key === "liability_vendor_payable") total_vendor_payable_credits += credit;
    }

    const j = job as {
        id: string;
        customer_id: string | null;
        assigned_vendor_id: string | null;
        gross_price_cents: number | null;
        estimated_total_cents: number | null;
        recurring_total_cents: number | null;
        discounted: boolean | null;
        discount_code: string | null;
        discount_amount: number | string | null;
        is_recurring: boolean | null;
        service_frequency_key: string | null;
    };
    const gross = j.gross_price_cents != null ? Number(j.gross_price_cents) : null;
    const disc =
        j.discount_amount != null && String(j.discount_amount).trim() !== ""
            ? Math.round(Number(j.discount_amount))
            : null;
    const netFirst = j.estimated_total_cents != null ? Number(j.estimated_total_cents) : null;
    const recurring = j.recurring_total_cents != null ? Number(j.recurring_total_cents) : null;

    return NextResponse.json({
        job: {
            id: j.id,
            customer_id: j.customer_id,
            assigned_vendor_id: j.assigned_vendor_id,
            gross_price_cents: j.gross_price_cents,
            estimated_total_cents: j.estimated_total_cents,
            recurring_total_cents: j.recurring_total_cents,
            discounted: j.discounted,
            discount_code: j.discount_code,
            discount_amount: j.discount_amount,
            is_recurring: j.is_recurring,
            service_frequency_key: j.service_frequency_key,
        },
        booking_economics: {
            first_visit_gross_cents: gross,
            discount_cents: disc,
            first_visit_net_cents: netFirst ?? (gross != null && disc != null ? Math.max(0, gross - disc) : netFirst),
            recurring_visit_cents: recurring,
        },
        schedules: schedulesWithPosted,
        totals: {
            total_revenue_credits,
            total_discount_debits,
            total_vendor_payout_debits,
            total_cash_debits,
            total_vendor_payable_credits,
        },
        posted_entries_count: postedScheduleIds.size,
        /** Explains scope for admin UI; Stripe payments do not populate these lines in the current app. */
        ledger_meta: {
            journal_lines_filter: "gl_journal_lines.org_id + job_id",
            posted_entries_scope: "gl_journal_entries where source_type = schedule_completed and source_id in this job's schedule ids",
            stripe_payments_note:
                "Successful admin/Stripe payments update public.payments; they are not summed here unless matching GL lines exist.",
        },
    });
}
