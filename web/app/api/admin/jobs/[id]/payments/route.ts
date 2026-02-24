import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type JobPaymentRow = {
    id: string;
    created_at: string;
    amount_cents: number;
    paid_at: string | null;
    provider_payment_id: string | null;
    payment_status_id: string | null;
    payment_status: string | null;
};

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

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
    const payments: JobPaymentRow[] = (rows ?? []).map((r) => {
        const raw = r as {
            id: string;
            created_at: string;
            amount_cents: number;
            paid_at?: string | null;
            provider_payment_id?: string | null;
            payment_status_id?: string | null;
            payment_statuses?: { key?: string }[] | null;
        };
        const statusKey = raw.payment_statuses?.[0]?.key ?? null;
        return {
            id: raw.id,
            created_at: raw.created_at,
            amount_cents: raw.amount_cents,
            paid_at: raw.paid_at ?? null,
            provider_payment_id: raw.provider_payment_id ?? null,
            payment_status_id: raw.payment_status_id ?? null,
            payment_status: statusKey,
        };
    });
    return NextResponse.json({ payments });
}
