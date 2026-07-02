import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { CommercialProduct, CommercialType } from "@/lib/commercial/commercialProducts";

const SELECT_COLS =
    "id, org_id, location_id, program_key, name, description, commercial_type, category_id, amount_cents, cadence_key, revenue_category, revenue_category_id, effective_start, effective_end, behavior, is_active, metadata, source_table, source_id, created_at, updated_at";

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.description !== undefined) patch.description = body.description != null ? String(body.description).trim() || null : null;
    // commercial_type is intentionally immutable after creation — changing a product's
    // primitive type is a delete + recreate, not an edit (behavior shape would be invalid).
    if (body.category_id !== undefined) patch.category_id = body.category_id != null ? String(body.category_id).trim() || null : null;
    if (body.amount_cents !== undefined) {
        const cents = Number(body.amount_cents);
        if (!Number.isFinite(cents) || cents < 0) return NextResponse.json({ error: "amount_cents must be a non-negative integer" }, { status: 400 });
        patch.amount_cents = Math.round(cents);
    }
    if (body.cadence_key !== undefined) patch.cadence_key = body.cadence_key != null ? String(body.cadence_key).trim() || null : null;
    if (body.revenue_category !== undefined) patch.revenue_category = body.revenue_category != null ? String(body.revenue_category).trim() || null : null;
    if (body.revenue_category_id !== undefined) patch.revenue_category_id = body.revenue_category_id != null ? String(body.revenue_category_id).trim() || null : null;
    if ("effective_start" in body) patch.effective_start = body.effective_start != null ? String(body.effective_start).trim() || null : null;
    if ("effective_end" in body) patch.effective_end = body.effective_end != null ? String(body.effective_end).trim() || null : null;
    if (body.behavior !== undefined && typeof body.behavior === "object" && !Array.isArray(body.behavior)) patch.behavior = body.behavior;
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (body.location_id !== undefined) patch.location_id = body.location_id != null ? String(body.location_id).trim() || null : null;
    if (body.program_key !== undefined) patch.program_key = body.program_key != null ? String(body.program_key).trim() || null : null;

    if (Object.keys(patch).length <= 1) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_products").update(patch).eq("id", id).eq("org_id", ctx.orgId).select(SELECT_COLS).maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json({ product: mapRow(data as Record<string, unknown>) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    const supabase = createAdminClient();
    const { data: existing } = await supabase.from("commercial_products").select("id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const { error } = await supabase.from("commercial_products").delete().eq("id", id).eq("org_id", ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deleted: true });
}
