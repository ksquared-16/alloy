import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";

const SELECT_COLS =
    "id, org_id, location_id, offering_id, cadence_key, payer_type, rate_cents, is_active, not_offered, metadata, created_at, updated_at";

function mapRateRow(r: Record<string, unknown>): TuitionRateRow {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: (r.location_id as string | null | undefined) ?? null,
        offering_id: String(r.offering_id ?? ""),
        cadence_key: String(r.cadence_key ?? ""),
        payer_type: String(r.payer_type ?? "private_pay"),
        rate_cents: Number(r.rate_cents ?? 0),
        is_active: r.is_active !== false,
        not_offered: r.not_offered === true,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

/**
 * GET /api/admin/commercial/tuition-rates
 * Returns all tuition rates for the org.
 * Optional: ?location_id= — returns org defaults + that location only.
 * Optional: ?offering_id= — filter to a specific offering.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const locationId = (searchParams.get("location_id") ?? "").trim() || null;
    const offeringId = (searchParams.get("offering_id") ?? "").trim() || null;

    const supabase = createAdminClient();
    let q = supabase
        .from("commercial_tuition_rates")
        .select(SELECT_COLS)
        .eq("org_id", ctx.orgId)
        .order("offering_id")
        .order("cadence_key");

    if (locationId) {
        q = q.or(`location_id.is.null,location_id.eq.${locationId}`);
    }
    if (offeringId) {
        q = q.eq("offering_id", offeringId);
    }

    const { data, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        rates: (data ?? []).map((r: Record<string, unknown>) => mapRateRow(r)),
    });
}

/**
 * POST /api/admin/commercial/tuition-rates
 * Create or update a tuition rate.
 * Body: { offering_id, cadence_key, rate_cents, location_id?, payer_type?, not_offered?, is_active? }
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const offering_id = String(body.offering_id ?? "").trim();
    const cadence_key = String(body.cadence_key ?? "").trim();
    const not_offered = body.not_offered === true;
    const rate_cents = not_offered ? 0 : (body.rate_cents != null ? Number(body.rate_cents) : null);
    const location_id = body.location_id != null ? String(body.location_id).trim() : null;
    const payer_type = String(body.payer_type ?? "private_pay").trim();
    const is_active = body.is_active !== false;

    if (!offering_id) return NextResponse.json({ error: "offering_id is required" }, { status: 400 });
    if (!cadence_key) return NextResponse.json({ error: "cadence_key is required" }, { status: 400 });
    if (!not_offered && (rate_cents === null || !Number.isFinite(rate_cents) || rate_cents < 0)) {
        return NextResponse.json({ error: "rate_cents must be a non-negative integer" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Validate offering belongs to org
    const { data: offering } = await supabase
        .from("program_offerings")
        .select("id")
        .eq("id", offering_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (!offering) {
        return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    // Validate location belongs to org if provided
    if (location_id) {
        const { data: loc } = await supabase
            .from("locations")
            .select("id")
            .eq("id", location_id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (!loc) {
            return NextResponse.json({ error: "Location not found" }, { status: 404 });
        }
    }

    // find-then-update-or-insert (avoids upsert with nullable unique column)
    const matchQ = supabase
        .from("commercial_tuition_rates")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("offering_id", offering_id)
        .eq("cadence_key", cadence_key)
        .eq("payer_type", payer_type);

    const filteredQ = location_id
        ? matchQ.eq("location_id", location_id)
        : matchQ.is("location_id", null);

    const { data: existingRow } = await filteredQ.maybeSingle();

    let data: Record<string, unknown> | null = null;
    let error: { message: string } | null = null;

    const payload = {
        rate_cents: Math.round(rate_cents ?? 0),
        not_offered,
        is_active,
        updated_at: new Date().toISOString(),
    };

    if (existingRow) {
        const res = await supabase
            .from("commercial_tuition_rates")
            .update(payload)
            .eq("id", existingRow.id)
            .eq("org_id", ctx.orgId)
            .select(SELECT_COLS)
            .single();
        data = res.data as Record<string, unknown> | null;
        error = res.error;
    } else {
        const res = await supabase
            .from("commercial_tuition_rates")
            .insert({
                org_id: ctx.orgId,
                location_id,
                offering_id,
                cadence_key,
                payer_type,
                ...payload,
            })
            .select(SELECT_COLS)
            .single();
        data = res.data as Record<string, unknown> | null;
        error = res.error;
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rate: mapRateRow(data as Record<string, unknown>) }, { status: 201 });
}
