import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type JobPaymentRow = {
    id: string;
    created_at: string;
    amount_cents: number;
    paid_at: string | null;
    provider_payment_id: string | null;
    payment_status_id: string;
    payment_statuses: { key: string } | null;
};

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (ctx instanceof NextResponse) return ctx;

    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const { data: rows, error } = await supabase
        .from("payments")
        .select("id, created_at, amount_cents, paid_at, provider_payment_id, payment_status_id, payment_statuses(key)")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const payments: JobPaymentRow[] = (rows ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        amount_cents: r.amount_cents,
        paid_at: (r as { paid_at?: string | null }).paid_at ?? null,
        provider_payment_id: r.provider_payment_id ?? null,
        payment_status_id: r.payment_status_id,
        payment_statuses: r.payment_statuses ?? null,
    }));
    return NextResponse.json({ payments });
}
