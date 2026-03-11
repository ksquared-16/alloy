import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type PricingDimensionValueListItem = {
    id: string;
    value_label: string | null;
    value_key: string | null;
    dimension_id: string | null;
    sort_order: number | null;
    is_active: boolean;
    updated_at: string | null;
    created_at: string;
    _dimension_label?: string | null;
};

/** GET: list pricing_dimension_values with dimension name */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const dimensionId = searchParams.get("dimension_id")?.trim() || null;

    const supabase = createAdminClient();
    let q = supabase
        .from("pricing_dimension_values")
        .select("id, value_label, value_key, dimension_id, sort_order, is_active, updated_at, created_at")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("value_label", { ascending: true, nullsFirst: false });
    if (dimensionId) q = q.eq("dimension_id", dimensionId);
    const { data: rows, error } = await q;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const list = (rows ?? []) as { id: string; value_label?: string | null; value_key?: string | null; dimension_id?: string | null; sort_order?: number | null; is_active?: boolean; updated_at?: string | null; created_at?: string }[];
    const dimIds = [...new Set(list.map((r) => r.dimension_id).filter(Boolean))] as string[];
    const { data: dimData } = dimIds.length
        ? await supabase.from("pricing_dimensions").select("id, dimension_name, dimension_key").in("id", dimIds)
        : { data: [] };
    const dimMap = new Map((dimData ?? []).map((d: { id: string; dimension_name?: string | null; dimension_key?: string | null }) => [d.id, d.dimension_name ?? d.dimension_key ?? null]));
    const items: PricingDimensionValueListItem[] = list.map((r) => ({
        id: r.id,
        value_label: r.value_label ?? null,
        value_key: r.value_key ?? null,
        dimension_id: r.dimension_id ?? null,
        sort_order: r.sort_order != null ? Number(r.sort_order) : null,
        is_active: r.is_active !== false,
        updated_at: r.updated_at ?? null,
        created_at: r.created_at ?? "",
        _dimension_label: r.dimension_id ? dimMap.get(r.dimension_id) ?? null : null,
    }));
    return NextResponse.json({ pricing_dimension_values: items });
}

/** POST: create pricing_dimension_value. Body: value_label?, value_key?, dimension_id, sort_order?, is_active? */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: { value_label?: string; value_key?: string; dimension_id?: string | null; sort_order?: number | null; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const value_label = typeof body.value_label === "string" ? body.value_label.trim() || null : null;
    const value_key = typeof body.value_key === "string" ? body.value_key.trim() || null : null;
    const dimension_id = typeof body.dimension_id === "string" && body.dimension_id.trim() ? body.dimension_id.trim() : null;
    if (!value_label && !value_key) return NextResponse.json({ error: "value_label or value_key required" }, { status: 400 });
    if (!dimension_id) return NextResponse.json({ error: "dimension_id required" }, { status: 400 });

    const supabase = createAdminClient();
    const sort_order = body.sort_order != null ? Number(body.sort_order) : null;
    const insert: Record<string, unknown> = {
        value_label: value_label ?? value_key,
        value_key: value_key ?? value_label,
        dimension_id,
        sort_order: Number.isFinite(sort_order) ? sort_order : null,
        is_active: body.is_active !== false,
    };
    const { data, error } = await supabase.from("pricing_dimension_values").insert(insert).select("id, value_label, value_key, dimension_id, sort_order, is_active, created_at, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}
