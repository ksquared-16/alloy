import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { CommercialRevenueCategory } from "@/lib/commercial/commercialProducts";

const SELECT_COLS =
    "id, org_id, label, gl_code, sort_order, is_active, metadata, created_at, updated_at";

function mapRow(r: Record<string, unknown>): CommercialRevenueCategory {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        label: String(r.label ?? ""),
        gl_code: (r.gl_code as string | null | undefined) ?? null,
        sort_order: Number(r.sort_order ?? 100),
        is_active: r.is_active !== false,
        metadata: r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("include_inactive") === "true";

    const supabase = createAdminClient();
    let q = supabase.from("commercial_revenue_categories").select(SELECT_COLS).eq("org_id", ctx.orgId).order("sort_order").order("label");
    if (!includeInactive) q = q.eq("is_active", true);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ revenue_categories: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)) });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const label = String(body.label ?? "").trim();
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_revenue_categories")
        .insert({
            org_id: ctx.orgId,
            label,
            gl_code: body.gl_code != null ? String(body.gl_code).trim() || null : null,
            sort_order: body.sort_order != null ? Math.round(Number(body.sort_order)) : 100,
            is_active: body.is_active !== false,
            metadata: (body.metadata as Record<string, unknown>) ?? {},
        })
        .select(SELECT_COLS)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ revenue_category: mapRow(data as Record<string, unknown>) }, { status: 201 });
}
