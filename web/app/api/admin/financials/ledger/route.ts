import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { ORG_ID_FINANCIALS } from "@/lib/financials";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/ledger
 * Query: org_id (optional, defaults to ORG_ID_FINANCIALS), start, end, status[], direction, type[], provider, search, limit, offset
 */
export async function GET(request: NextRequest) {
    const supabase = createAdminClient();
    const { searchParams } = request.nextUrl;
    const orgId = searchParams.get("org_id") || ORG_ID_FINANCIALS;
    const start = searchParams.get("start") || "";
    const end = searchParams.get("end") || "";
    const statusList = searchParams.get("status"); // comma-separated
    const direction = searchParams.get("direction"); // in | out
    const typeList = searchParams.get("type"); // comma-separated
    const provider = searchParams.get("provider") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let q = supabase
        .from("ledger_transactions")
        .select("id, org_id, occurred_at, status, type, direction, amount_cents, currency, provider, provider_ref, journal_entry_id, metadata, created_at", { count: "exact" })
        .eq("org_id", orgId)
        .order("occurred_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (start) {
        q = q.gte("occurred_at", start);
    }
    if (end) {
        q = q.lte("occurred_at", end);
    }
    if (direction === "in" || direction === "out") {
        q = q.eq("direction", direction);
    }
    if (statusList) {
        const statuses = statusList.split(",").map((s) => s.trim()).filter(Boolean);
        if (statuses.length > 0) q = q.in("status", statuses);
    }
    if (typeList) {
        const types = typeList.split(",").map((t) => t.trim()).filter(Boolean);
        if (types.length > 0) q = q.in("type", types);
    }
    if (provider) {
        q = q.ilike("provider", `%${provider}%`);
    }
    if (search) {
        q = q.ilike("provider_ref", `%${search}%`);
    }

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
