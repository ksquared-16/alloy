import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/ledger
 * Query: date_from, date_to, type, direction, job_id, schedule_id, customer_id, vendor_id, limit (default 100, max 500)
 * Auth: getAdminContextCached(); admin/ops can read.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const { searchParams } = request.nextUrl;
    const orgId = ctx.orgId;
    const dateFrom = searchParams.get("date_from") || searchParams.get("start") || "";
    const dateTo = searchParams.get("date_to") || searchParams.get("end") || "";
    const type = searchParams.get("type") || "";
    const direction = searchParams.get("direction") || "";
    const jobId = searchParams.get("job_id") || "";
    const scheduleId = searchParams.get("schedule_id") || "";
    const customerId = searchParams.get("customer_id") || "";
    const vendorId = searchParams.get("vendor_id") || "";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
    const statusList = searchParams.get("status") || "";
    const providerFilter = searchParams.get("provider") || "";
    const search = searchParams.get("search") || "";

    let q = supabase
        .from("ledger_transactions")
        .select("id, occurred_at, status, type, direction, amount_cents, currency, provider, provider_ref, job_id, schedule_id, customer_id, vendor_id, journal_entry_id", { count: "exact" })
        .eq("org_id", orgId)
        .order("occurred_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (dateFrom) q = q.gte("occurred_at", dateFrom);
    if (dateTo) q = q.lte("occurred_at", dateTo);
    if (direction === "in" || direction === "out") q = q.eq("direction", direction);
    if (type) q = q.eq("type", type);
    if (jobId) q = q.eq("job_id", jobId);
    if (scheduleId) q = q.eq("schedule_id", scheduleId);
    if (customerId) q = q.eq("customer_id", customerId);
    if (vendorId) q = q.eq("vendor_id", vendorId);
    if (statusList) {
        const statuses = statusList.split(",").map((s) => s.trim()).filter(Boolean);
        if (statuses.length > 0) q = q.in("status", statuses);
    }
    if (providerFilter) q = q.ilike("provider", `%${providerFilter}%`);
    if (search) q = q.ilike("provider_ref", `%${search}%`);

    const { data: rows, error, count } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as { id: string; customer_id?: string | null; vendor_id?: string | null; job_id?: string | null; schedule_id?: string | null }[];
    const customerIds = [...new Set(list.map((r) => r.customer_id).filter(Boolean))] as string[];
    const vendorIds = [...new Set(list.map((r) => r.vendor_id).filter(Boolean))] as string[];
    const jobIds = [...new Set(list.map((r) => r.job_id).filter(Boolean))] as string[];
    const scheduleIds = [...new Set(list.map((r) => r.schedule_id).filter(Boolean))] as string[];

    const [customersRes, vendorsRes, jobsRes, schedulesRes] = await Promise.all([
        customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] as { id: string; name?: string | null }[] },
        vendorIds.length ? supabase.from("vendors").select("id, name").in("id", vendorIds) : { data: [] as { id: string; name?: string | null }[] },
        jobIds.length ? supabase.from("jobs").select("id, title, service_key, job_number_for_customer").in("id", jobIds) : { data: [] as { id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null }[] },
        scheduleIds.length ? supabase.from("schedules").select("id, start_at, end_at").in("id", scheduleIds) : { data: [] as { id: string; start_at?: string | null; end_at?: string | null }[] },
    ]);

    const customerMap = new Map((customersRes.data ?? []).map((c) => [c.id, c.name ?? null]));
    const vendorMap = new Map((vendorsRes.data ?? []).map((v) => [v.id, v.name ?? null]));
    const jobMap = new Map(
        (jobsRes.data ?? []).map((j) => [
            j.id,
            (j.title && String(j.title).trim()) || (j.service_key && String(j.service_key).trim()) || (j.job_number_for_customer && String(j.job_number_for_customer).trim()) || `Job #${j.id.slice(-6)}`,
        ])
    );
    const scheduleMap = new Map(
        (schedulesRes.data ?? []).map((s) => [s.id, s.start_at || s.end_at ? `${s.start_at ?? ""} – ${s.end_at ?? ""}`.trim() || s.id.slice(-8) : s.id.slice(-8)])
    );

    const data = list.map((r) => ({
        ...r,
        _customer_name: r.customer_id ? customerMap.get(r.customer_id) ?? null : null,
        _vendor_name: r.vendor_id ? vendorMap.get(r.vendor_id) ?? null : null,
        _job_label: r.job_id ? jobMap.get(r.job_id) ?? null : null,
        _schedule_label: r.schedule_id ? scheduleMap.get(r.schedule_id) ?? null : null,
    }));

    return NextResponse.json({
        data,
        total: count ?? 0,
        limit,
        offset,
    });
}
