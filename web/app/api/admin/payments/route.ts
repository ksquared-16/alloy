import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

export type PaymentListItem = {
    id: string;
    created_at: string;
    updated_at?: string | null;
    amount_cents: number;
    provider_payment_id: string | null;
    payment_status_id: string;
    job_id: string | null;
    customer_id: string | null;
    status_key: string | null;
    payment_statuses: { key: string; label?: string | null } | null;
    paid_at?: string | null;
    posted_to_ledger_at?: string | null;
    provider?: string | null;
    _payment_label?: string | null;
    _customer_name?: string | null;
    _job_label?: string | null;
    _status_display?: string | null;
    _amount_display?: number | null;
    _posted_yes_no?: boolean;
    _updated?: string | null;
};

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const statusKey = searchParams.get("status");
    const statusKeyParam = searchParams.get("status_key")?.trim();
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const jobId = searchParams.get("job_id");
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    const supabase = createAdminClient();
    if (jobId) {
        const jobOk = await assertRowOrg(supabase, "jobs", jobId, ctx.orgId);
        if (!jobOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let q = supabase
        .from("payments")
        .select(
            "id, created_at, updated_at, amount_cents, provider_payment_id, payment_status_id, job_id, customer_id, org_id, status_key, paid_at, posted_to_ledger_at, provider",
            { count: "exact" }
        )
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (jobId) q = q.eq("job_id", jobId);
    if (statusKeyParam) q = q.eq("status_key", statusKeyParam);
    if (fromDate) q = q.gte("created_at", fromDate);
    if (toDate) q = q.lte("created_at", toDate);

    const { data: rows, error, count } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = rows ?? [];
    const customerIds = [...new Set(list.map((r) => (r as { customer_id?: string }).customer_id).filter(Boolean))] as string[];
    const jobIds = [...new Set(list.map((r) => (r as { job_id?: string }).job_id).filter(Boolean))] as string[];

    const [custRes, jobRes] = await Promise.all([
        customerIds.length
            ? supabase.from("customers").select("id, name").eq("org_id", ctx.orgId).in("id", customerIds)
            : { data: [] },
        jobIds.length
            ? supabase.from("jobs").select("id, title, service_key, job_number_for_customer").eq("org_id", ctx.orgId).in("id", jobIds)
            : { data: [] },
    ]);

    const customerMap = new Map((custRes.data ?? []).map((c) => [(c as { id: string }).id, (c as { name?: string | null }).name ?? null]));

    const paymentStatusLabelByOrg = new Map<string, string>();
    const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "payments", { activeOnly: true });
    for (const d of defs) {
        paymentStatusLabelByOrg.set(d.status_key, (d.status_label?.trim() || d.status_key) as string);
    }
    const jobLabelMap = new Map((jobRes.data ?? []).map((j) => {
        const row = j as { id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null };
        const label = (row.title && String(row.title).trim()) || (row.service_key && String(row.service_key).trim()) || (row.job_number_for_customer && String(row.job_number_for_customer).trim()) || `Job #${row.id.slice(-6)}`;
        return [row.id, label];
    }));

    let payments: PaymentListItem[] = list.map((r) => {
        const statusKeyVal = (r as { status_key?: string | null }).status_key ?? null;
        const _status_display =
            statusKeyVal && paymentStatusLabelByOrg.size
                ? (paymentStatusLabelByOrg.get(statusKeyVal) ?? statusKeyVal)
                : statusKeyVal ?? null;
        const statusObj: { key: string; label?: string | null } | null =
            statusKeyVal != null ? { key: statusKeyVal, label: _status_display } : null;
        const _payment_label = (r as { provider_payment_id?: string | null }).provider_payment_id?.trim() || `Payment #${(r as { id: string }).id.slice(-6)}`;
        const _updated = (r as { updated_at?: string | null }).updated_at ?? (r as { created_at: string }).created_at;
        return {
            id: (r as { id: string }).id,
            created_at: (r as { created_at: string }).created_at,
            updated_at: (r as { updated_at?: string | null }).updated_at ?? null,
            amount_cents: (r as { amount_cents: number }).amount_cents,
            provider_payment_id: (r as { provider_payment_id?: string | null }).provider_payment_id ?? null,
            payment_status_id: (r as { payment_status_id: string }).payment_status_id,
            job_id: (r as { job_id?: string | null }).job_id ?? null,
            customer_id: (r as { customer_id?: string | null }).customer_id ?? null,
            status_key: statusKeyVal,
            payment_statuses: statusObj,
            paid_at: (r as { paid_at?: string | null }).paid_at ?? null,
            posted_to_ledger_at: (r as { posted_to_ledger_at?: string | null }).posted_to_ledger_at ?? null,
            provider: (r as { provider?: string | null }).provider ?? null,
            _payment_label,
            _customer_name: (r as { customer_id?: string | null }).customer_id ? customerMap.get((r as { customer_id: string }).customer_id) ?? null : null,
            _job_label: (r as { job_id?: string | null }).job_id ? jobLabelMap.get((r as { job_id: string }).job_id) ?? null : null,
            _status_display,
            _amount_display: (r as { amount_cents: number }).amount_cents / 100,
            _posted_yes_no: !!(r as { posted_to_ledger_at?: string | null }).posted_to_ledger_at,
            _updated,
        };
    });

    if (statusKey) {
        const keys = statusKey.split(",").map((k) => k.trim().toLowerCase());
        payments = payments.filter((p) => p.status_key && keys.includes(String(p.status_key).toLowerCase()));
    }

    return NextResponse.json({
        payments,
        total: count ?? payments.length,
    });
}
