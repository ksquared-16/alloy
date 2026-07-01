import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";

const SELECT_COLS =
    "id, org_id, location_id, variant_id, cadence_key, payer_type, rate_cents, is_active, not_offered, effective_start, effective_end, metadata, created_at, updated_at";

function mapRateRow(r: Record<string, unknown>): TuitionRateRow {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: (r.location_id as string | null | undefined) ?? null,
        variant_id: String(r.variant_id ?? ""),
        cadence_key: String(r.cadence_key ?? ""),
        payer_type: String(r.payer_type ?? "private_pay"),
        rate_cents: Number(r.rate_cents ?? 0),
        is_active: r.is_active !== false,
        not_offered: r.not_offered === true,
        effective_start: (r.effective_start as string | null | undefined) ?? null,
        effective_end: (r.effective_end as string | null | undefined) ?? null,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

/** PATCH /api/admin/commercial/tuition-rates/[id] — update rate_cents, is_active, or not_offered. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const { id } = await params;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.rate_cents !== undefined) {
        const cents = Number(body.rate_cents);
        if (!Number.isFinite(cents) || cents < 0) {
            return NextResponse.json(
                { error: "rate_cents must be a non-negative integer" },
                { status: 400 },
            );
        }
        patch.rate_cents = Math.round(cents);
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (typeof body.not_offered === "boolean") patch.not_offered = body.not_offered;
    if ("effective_start" in body) patch.effective_start = body.effective_start != null ? String(body.effective_start).trim() || null : null;
    if ("effective_end" in body) patch.effective_end = body.effective_end != null ? String(body.effective_end).trim() || null : null;

    if (Object.keys(patch).length <= 1) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_tuition_rates")
        .update(patch)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select(SELECT_COLS)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Rate not found" }, { status: 404 });

    return NextResponse.json({ rate: mapRateRow(data as Record<string, unknown>) });
}

/** DELETE /api/admin/commercial/tuition-rates/[id] — remove a rate (resets to org default or removes entry). */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("commercial_tuition_rates")
        .select("id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (!existing) return NextResponse.json({ error: "Rate not found" }, { status: 404 });

    const { error } = await supabase
        .from("commercial_tuition_rates")
        .delete()
        .eq("id", id)
        .eq("org_id", ctx.orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ deleted: true });
}
