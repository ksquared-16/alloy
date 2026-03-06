import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

const SCHEDULE_SOURCE_TYPES = ["schedule_completed", "customer_payment", "vendor_payout"];

/**
 * GET /api/admin/financials/journal-entries
 * Query: date_from, date_to, source_type, job_id, schedule_id, customer_id, vendor_id, limit (default 100, max 500)
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
    const dateFrom = searchParams.get("date_from") || "";
    const dateTo = searchParams.get("date_to") || "";
    const sourceType = searchParams.get("source_type") || "";
    const jobId = searchParams.get("job_id") || "";
    const scheduleId = searchParams.get("schedule_id") || "";
    const customerId = searchParams.get("customer_id") || "";
    const vendorId = searchParams.get("vendor_id") || "";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10), 1), 500);

    let entryIdsFilter: string[] | null = null;

    if (jobId || scheduleId || customerId || vendorId) {
        let lineQuery = supabase
            .from("gl_journal_lines")
            .select("entry_id");
        if (jobId) lineQuery = lineQuery.eq("job_id", jobId);
        if (scheduleId) lineQuery = lineQuery.eq("schedule_id", scheduleId);
        if (customerId) lineQuery = lineQuery.eq("customer_id", customerId);
        if (vendorId) lineQuery = lineQuery.eq("vendor_id", vendorId);
        const { data: lineRows } = await lineQuery;
        const fromLines = [...new Set((lineRows ?? []).map((r: { entry_id: string }) => r.entry_id))];

        const fromSource: string[] = [];
        if (scheduleId) {
            const { data: entryRows } = await supabase
                .from("gl_journal_entries")
                .select("id")
                .eq("org_id", orgId)
                .in("source_type", SCHEDULE_SOURCE_TYPES)
                .eq("source_id", scheduleId);
            fromSource.push(...((entryRows ?? []).map((r: { id: string }) => r.id)));
        }

        const candidateIds = [...new Set([...fromLines, ...fromSource])];
        if (candidateIds.length === 0) {
            return NextResponse.json({ data: [], total: 0, limit });
        }
        const { data: orgEntries } = await supabase
            .from("gl_journal_entries")
            .select("id")
            .eq("org_id", orgId)
            .in("id", candidateIds);
        entryIdsFilter = (orgEntries ?? []).map((r: { id: string }) => r.id);
        if (entryIdsFilter.length === 0) {
            return NextResponse.json({ data: [], total: 0, limit });
        }
    }

    let q = supabase
        .from("gl_journal_entries")
        .select("id, entry_date, status, source_type, source_id, description, created_at", { count: "exact" })
        .eq("org_id", orgId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

    if (dateFrom) q = q.gte("entry_date", dateFrom);
    if (dateTo) q = q.lte("entry_date", dateTo);
    if (sourceType) q = q.eq("source_type", sourceType);
    if (entryIdsFilter && entryIdsFilter.length > 0) {
        q = q.in("id", entryIdsFilter);
    }

    const { data: rows, error, count } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        data: rows ?? [],
        total: count ?? 0,
        limit,
    });
}
