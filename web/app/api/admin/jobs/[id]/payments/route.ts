import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";

export type JobPaymentRow = {
    id: string;
    created_at: string;
    amount_cents: number;
    provider_payment_id: string | null;
    payment_status_id: string;
    payment_statuses: { key: string } | null;
};

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("payments")
        .select("id, created_at, amount_cents, provider_payment_id, payment_status_id, payment_statuses(key)")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const payments = (rows ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        amount_cents: r.amount_cents,
        provider_payment_id: r.provider_payment_id ?? null,
        payment_status_id: r.payment_status_id,
        payment_statuses: r.payment_statuses ?? null,
    }));
    return NextResponse.json({ payments });
}
