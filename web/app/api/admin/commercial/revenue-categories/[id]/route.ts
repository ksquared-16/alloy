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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.label !== undefined) {
        const label = String(body.label).trim();
        if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
        patch.label = label;
    }
    if ("gl_code" in body) patch.gl_code = body.gl_code != null ? String(body.gl_code).trim() || null : null;
    if (body.sort_order !== undefined) patch.sort_order = Math.round(Number(body.sort_order));
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

    if (Object.keys(patch).length <= 1) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_revenue_categories").update(patch).eq("id", id).eq("org_id", ctx.orgId).select(SELECT_COLS).maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Revenue category not found" }, { status: 404 });
    return NextResponse.json({ revenue_category: mapRow(data as Record<string, unknown>) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    const supabase = createAdminClient();
    const { data: existing } = await supabase.from("commercial_revenue_categories").select("id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Revenue category not found" }, { status: 404 });

    const { error } = await supabase.from("commercial_revenue_categories").delete().eq("id", id).eq("org_id", ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deleted: true });
}
