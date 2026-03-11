import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type PricingDimensionListItem = {
    id: string;
    dimension_label: string | null;
    dimension_key: string | null;
    name: string | null;
    vertical_id: string | null;
    is_active: boolean;
    updated_at: string | null;
    created_at: string;
    _vertical_name?: string | null;
};

/** GET: list pricing_dimensions with optional vertical name */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("pricing_dimensions")
        .select("id, dimension_label, dimension_key, name, vertical_id, is_active, updated_at, created_at")
        .order("dimension_label", { ascending: true, nullsFirst: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const list = (rows ?? []) as { id: string; dimension_label?: string | null; dimension_key?: string | null; name?: string | null; vertical_id?: string | null; is_active?: boolean; updated_at?: string | null; created_at?: string }[];
    const verticalIds = [...new Set(list.map((r) => r.vertical_id).filter(Boolean))] as string[];
    const { data: vertData } = verticalIds.length
        ? await supabase.from("verticals").select("id, name, slug").in("id", verticalIds)
        : { data: [] };
    const verticalMap = new Map((vertData ?? []).map((v: { id: string; name?: string | null; slug?: string | null }) => [v.id, v.name ?? v.slug ?? null]));
    const items: PricingDimensionListItem[] = list.map((r) => ({
        id: r.id,
        dimension_label: r.dimension_label ?? null,
        dimension_key: r.dimension_key ?? null,
        name: r.name ?? null,
        vertical_id: r.vertical_id ?? null,
        is_active: r.is_active !== false,
        updated_at: r.updated_at ?? null,
        created_at: r.created_at ?? "",
        _vertical_name: r.vertical_id ? verticalMap.get(r.vertical_id) ?? null : null,
    }));
    return NextResponse.json({ pricing_dimensions: items });
}

/** POST: create pricing_dimension. Body: dimension_label?, dimension_key?, name?, vertical_id?, is_active? */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: { dimension_label?: string; dimension_key?: string; name?: string; vertical_id?: string | null; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const dimension_label = typeof body.dimension_label === "string" ? body.dimension_label.trim() || null : null;
    const dimension_key = typeof body.dimension_key === "string" ? body.dimension_key.trim() || null : null;
    const name = typeof body.name === "string" ? body.name.trim() || null : null;
    if (!dimension_label && !dimension_key && !name) return NextResponse.json({ error: "dimension_label, dimension_key, or name required" }, { status: 400 });

    const supabase = createAdminClient();
    const insert: Record<string, unknown> = {
        dimension_label: dimension_label ?? name ?? dimension_key,
        dimension_key: dimension_key ?? dimension_label ?? name,
        name: name ?? dimension_label ?? dimension_key,
        vertical_id: body.vertical_id && body.vertical_id.trim() ? body.vertical_id.trim() : null,
        is_active: body.is_active !== false,
    };
    const { data, error } = await supabase.from("pricing_dimensions").insert(insert).select("id, dimension_label, dimension_key, name, vertical_id, is_active, created_at, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}
