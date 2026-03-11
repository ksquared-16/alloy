import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

export type ServiceOfferingListItem = {
    id: string;
    offering_name: string | null;
    offering_key: string | null;
    vertical_id: string | null;
    is_active: boolean;
    description: string | null;
    created_at: string;
    updated_at: string | null;
    org_id: string | null;
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
        .from("service_offerings")
        .select("*", { count: "exact" })
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (ctx.orgId) {
        q = q.eq("org_id", ctx.orgId);
    }

    const { data: rows, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = rows ?? [];
    const verticalIds = [...new Set(list.map((r) => (r as { vertical_id?: string | null }).vertical_id).filter(Boolean))] as string[];
    const { data: verticals } = verticalIds.length
        ? await supabase.from("verticals").select("id, name, slug").in("id", verticalIds)
        : { data: [] };
    const verticalMap = new Map((verticals ?? []).map((v) => [(v as { id: string }).id, (v as { name?: string | null; slug?: string | null }).name ?? (v as { slug?: string | null }).slug ?? null]));

    const items: ServiceOfferingListItem[] = list.map((r) => {
        const row = r as Record<string, unknown> & { vertical_id?: string | null; updated_at?: string | null; created_at: string; is_active?: boolean };
        const _updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
        return {
            id: row.id as string,
            offering_name: (row.offering_name as string) ?? null,
            offering_key: (row.offering_key as string) ?? null,
            vertical_id: row.vertical_id ?? null,
            is_active: !!row.is_active,
            description: (row.description as string) ?? null,
            created_at: (row.created_at as string) ?? "",
            updated_at: (row.updated_at as string) ?? null,
            org_id: (row.org_id as string) ?? null,
            _vertical_name: row.vertical_id ? (verticalMap.get(row.vertical_id) ?? null) : null,
            _active_yes_no: !!row.is_active,
            _updated,
        };
    });

    return NextResponse.json({ service_offerings: items, total: count ?? items.length });
}

/** POST: create a service offering. Body: offering_name, offering_key, vertical_id, description?, is_active? */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: { offering_name?: string; offering_key?: string; vertical_id?: string | null; description?: string | null; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const offering_name = typeof body.offering_name === "string" ? body.offering_name.trim() || null : null;
    const offering_key = typeof body.offering_key === "string" ? body.offering_key.trim() || null : null;
    if (!offering_name && !offering_key) return NextResponse.json({ error: "offering_name or offering_key required" }, { status: 400 });

    const supabase = createAdminClient();
    const insert: Record<string, unknown> = {
        offering_name: offering_name ?? undefined,
        offering_key: offering_key ?? undefined,
        vertical_id: typeof body.vertical_id === "string" && body.vertical_id.trim() ? body.vertical_id.trim() : null,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        is_active: body.is_active !== false,
    };
    if (ctx.orgId) insert.org_id = ctx.orgId;

    const { data, error } = await supabase.from("service_offerings").insert(insert).select("id, offering_name, offering_key, vertical_id, is_active, description, created_at, updated_at, org_id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}
