import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type AddonListItem = {
    id: string;
    addon_name: string | null;
    addon_key: string | null;
    vertical_id: string | null;
    amount_cents: number | null;
    sort_order: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
    _vertical_name: string | null;
    _active_yes_no: boolean;
    _updated: string | null;
};

export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    const supabase = createAdminClient();
    let q = supabase
        .from("pricing_addons")
        .select("*", { count: "exact" })
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    const { data: rows, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = rows ?? [];
    const verticalIds = [...new Set(list.map((r) => (r as { vertical_id?: string | null }).vertical_id).filter(Boolean))] as string[];
    const { data: verticals } = verticalIds.length
        ? await supabase.from("verticals").select("id, name, slug").in("id", verticalIds)
        : { data: [] };
    const verticalMap = new Map((verticals ?? []).map((v) => [(v as { id: string }).id, (v as { name?: string | null; slug?: string | null }).name ?? (v as { slug?: string | null }).slug ?? null]));

    const items: AddonListItem[] = list.map((r) => {
        const row = r as Record<string, unknown> & { vertical_id?: string | null; updated_at?: string | null; created_at: string; is_active?: boolean };
        const _updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
        return {
            id: row.id as string,
            addon_name: (row.addon_name as string) ?? null,
            addon_key: (row.addon_key as string) ?? null,
            vertical_id: row.vertical_id ?? null,
            amount_cents: row.amount_cents != null ? Number(row.amount_cents) : null,
            sort_order: row.sort_order != null ? Number(row.sort_order) : null,
            is_active: !!row.is_active,
            created_at: (row.created_at as string) ?? "",
            updated_at: (row.updated_at as string) ?? null,
            _vertical_name: row.vertical_id ? (verticalMap.get(row.vertical_id) ?? null) : null,
            _active_yes_no: !!row.is_active,
            _updated,
        };
    });

    return NextResponse.json({ addons: items, total: count ?? items.length });
}

/** POST: create a pricing addon. Body: addon_name, addon_key, vertical_id, amount_cents (or amount in dollars), sort_order?, is_active? */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: { addon_name?: string; addon_key?: string; vertical_id?: string | null; amount_cents?: number; amount?: number; sort_order?: number | null; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const addon_name = typeof body.addon_name === "string" ? body.addon_name.trim() || null : null;
    const addon_key = typeof body.addon_key === "string" ? body.addon_key.trim() || null : null;
    if (!addon_name && !addon_key) return NextResponse.json({ error: "addon_name or addon_key required" }, { status: 400 });

    let amount_cents: number | null = null;
    if (body.amount_cents != null && typeof body.amount_cents === "number") amount_cents = Math.round(body.amount_cents);
    else if (body.amount != null && typeof body.amount === "number") amount_cents = Math.round(body.amount * 100);
    if (amount_cents === null || amount_cents < 0) amount_cents = 0;

    const sort_order = body.sort_order != null ? Math.max(0, Number(body.sort_order) || 0) : 0;

    const supabase = createAdminClient();
    const insert: Record<string, unknown> = {
        addon_name: addon_name ?? undefined,
        addon_key: addon_key ?? undefined,
        vertical_id: typeof body.vertical_id === "string" && body.vertical_id.trim() ? body.vertical_id.trim() : null,
        amount_cents,
        sort_order,
        is_active: body.is_active !== false,
    };

    const { data, error } = await supabase.from("pricing_addons").insert(insert).select("id, addon_name, addon_key, vertical_id, amount_cents, sort_order, is_active, created_at, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}
