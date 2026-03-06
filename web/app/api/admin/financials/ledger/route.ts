import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/ledger
 * Query: date_from, date_to, type, direction, job_id, schedule_id, customer_id, vendor_id, limit (default 100, max 500)
 * Auth: getAdminContext(); admin/ops can read.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
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
        .select("id, occurred_at, type, direction, amount_cents, currency, provider, provider_ref, job_id, schedule_id, customer_id, vendor_id, journal_entry_id", { count: "exact" })
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

    return NextResponse.json({
        data: rows ?? [],
        total: count ?? 0,
        limit,
        offset,
    });
}
