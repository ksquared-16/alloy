import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { CommercialProduct, CommercialType } from "@/lib/commercial/commercialProducts";

const SELECT_COLS =
    "id, org_id, location_id, program_key, name, description, commercial_type, category_id, amount_cents, cadence_key, revenue_category, revenue_category_id, effective_start, effective_end, behavior, is_active, metadata, source_table, source_id, created_at, updated_at";

const VALID_TYPES: CommercialType[] = ["fee", "addon", "deposit"];

function mapRow(r: Record<string, unknown>): CommercialProduct {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: (r.location_id as string | null | undefined) ?? null,
        program_key: (r.program_key as string | null | undefined) ?? null,
        name: String(r.name ?? ""),
        description: (r.description as string | null | undefined) ?? null,
        commercial_type: (r.commercial_type as CommercialType) ?? "fee",
        category_id: (r.category_id as string | null | undefined) ?? null,
        amount_cents: Number(r.amount_cents ?? 0),
        cadence_key: (r.cadence_key as string | null | undefined) ?? null,
        revenue_category: (r.revenue_category as string | null | undefined) ?? null,
        revenue_category_id: (r.revenue_category_id as string | null | undefined) ?? null,
        effective_start: (r.effective_start as string | null | undefined) ?? null,
        effective_end: (r.effective_end as string | null | undefined) ?? null,
        behavior: r.behavior != null && typeof r.behavior === "object" && !Array.isArray(r.behavior) ? (r.behavior as Record<string, unknown>) : {},
        is_active: r.is_active !== false,
        metadata: r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {},
        source_table: (r.source_table as string | null | undefined) ?? null,
        source_id: (r.source_id as string | null | undefined) ?? null,
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("commercial_type") ?? "").trim() || null;
    const locationId = (searchParams.get("location_id") ?? "").trim() || null;
    const programKey = (searchParams.get("program_key") ?? "").trim() || null;

    const supabase = createAdminClient();
    let q = supabase.from("commercial_products").select(SELECT_COLS).eq("org_id", ctx.orgId).order("name");
    if (type && VALID_TYPES.includes(type as CommercialType)) q = q.eq("commercial_type", type);
    if (locationId) q = q.eq("location_id", locationId);
    if (programKey) q = q.eq("program_key", programKey);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)) });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const name = String(body.name ?? "").trim();
    const commercial_type = String(body.commercial_type ?? "").trim();
    const amount_cents = body.amount_cents != null ? Number(body.amount_cents) : null;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!VALID_TYPES.includes(commercial_type as CommercialType))
        return NextResponse.json({ error: "commercial_type must be fee, addon, or deposit" }, { status: 400 });
    if (amount_cents === null || !Number.isFinite(amount_cents) || amount_cents < 0)
        return NextResponse.json({ error: "amount_cents must be a non-negative integer" }, { status: 400 });

    const behavior = body.behavior != null && typeof body.behavior === "object" && !Array.isArray(body.behavior)
        ? (body.behavior as Record<string, unknown>) : {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_products")
        .insert({
            org_id: ctx.orgId,
            location_id: body.location_id != null ? String(body.location_id).trim() || null : null,
            program_key: body.program_key != null ? String(body.program_key).trim() || null : null,
            name,
            description: body.description != null ? String(body.description).trim() || null : null,
            commercial_type,
            category_id: body.category_id != null ? String(body.category_id).trim() || null : null,
            amount_cents: Math.round(amount_cents),
            cadence_key: body.cadence_key != null ? String(body.cadence_key).trim() || null : null,
            revenue_category: body.revenue_category != null ? String(body.revenue_category).trim() || null : null,
            revenue_category_id: body.revenue_category_id != null ? String(body.revenue_category_id).trim() || null : null,
            effective_start: body.effective_start != null ? String(body.effective_start).trim() || null : null,
            effective_end: body.effective_end != null ? String(body.effective_end).trim() || null : null,
            behavior,
            is_active: body.is_active !== false,
            metadata: (body.metadata as Record<string, unknown>) ?? {},
        })
        .select(SELECT_COLS)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ product: mapRow(data as Record<string, unknown>) }, { status: 201 });
}
