import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";

export type PaymentListItem = {
    id: string;
    created_at: string;
    amount_cents: number;
    provider_payment_id: string | null;
    payment_status_id: string;
    job_id: string | null;
    payment_statuses: { key: string } | null;
};

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const statusKey = searchParams.get("status"); // paid | pending | failed
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const jobId = searchParams.get("job_id");
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    const supabase = createAdminClient();
    let q = supabase
        .from("payments")
        .select("id, created_at, amount_cents, provider_payment_id, payment_status_id, job_id, payment_statuses(key)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (jobId) q = q.eq("job_id", jobId);
    if (fromDate) q = q.gte("created_at", fromDate);
    if (toDate) q = q.lte("created_at", toDate);

    const { data: rows, error, count } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let payments: PaymentListItem[] = (rows ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        amount_cents: r.amount_cents,
        provider_payment_id: r.provider_payment_id ?? null,
        payment_status_id: r.payment_status_id,
        job_id: r.job_id ?? null,
        payment_statuses: r.payment_statuses ?? null,
    }));

    if (statusKey) {
        const keys = statusKey.split(",").map((k) => k.trim().toLowerCase());
        payments = payments.filter((p) => p.payment_statuses?.key && keys.includes(p.payment_statuses.key));
    }

    return NextResponse.json({
        payments,
        total: count ?? payments.length,
    });
}
