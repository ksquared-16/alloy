import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { TuitionRateRow, TuitionBillingPeriod } from "@/lib/commercial/tuitionRates";

const VALID_BILLING_PERIODS = new Set<TuitionBillingPeriod>([
    "weekly",
    "biweekly",
    "monthly",
    "annual",
]);

function mapRateRow(r: Record<string, unknown>): TuitionRateRow {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: (r.location_id as string | null | undefined) ?? null,
        program_key: String(r.program_key ?? ""),
        schedule_key: String(r.schedule_key ?? ""),
        rate_cents: Number(r.rate_cents ?? 0),
        billing_period: (r.billing_period as TuitionBillingPeriod) ?? "monthly",
        is_active: r.is_active !== false,
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
 * Optional: ?location_id= to filter to org defaults + that location only.
 * Optional: ?billing_period= to filter by period.
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
    const billingPeriod = (searchParams.get("billing_period") ?? "").trim() || null;

    const supabase = createAdminClient();
    let q = supabase
        .from("commercial_tuition_rates")
        .select(
            "id, org_id, location_id, program_key, schedule_key, rate_cents, billing_period, is_active, metadata, created_at, updated_at"
        )
        .eq("org_id", ctx.orgId)
        .order("program_key")
        .order("schedule_key");

    if (locationId) {
        // Return org defaults + this location's overrides
        q = q.or(`location_id.is.null,location_id.eq.${locationId}`);
    }

    if (billingPeriod) {
        q = q.eq("billing_period", billingPeriod);
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
 * Create or upsert a tuition rate.
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

    const programKey = String(body.program_key ?? "").trim();
    const scheduleKey = String(body.schedule_key ?? "").trim();
    const rateCents = body.rate_cents != null ? Number(body.rate_cents) : null;
    const billingPeriod = String(body.billing_period ?? "monthly").trim() as TuitionBillingPeriod;
    const locationId = body.location_id != null ? String(body.location_id).trim() : null;
    const isActive = body.is_active !== false;

    if (!programKey) {
        return NextResponse.json({ error: "program_key is required" }, { status: 400 });
    }
    if (!scheduleKey) {
        return NextResponse.json({ error: "schedule_key is required" }, { status: 400 });
    }
    if (rateCents === null || !Number.isFinite(rateCents) || rateCents < 0) {
        return NextResponse.json({ error: "rate_cents must be a non-negative integer" }, { status: 400 });
    }
    if (!VALID_BILLING_PERIODS.has(billingPeriod)) {
        return NextResponse.json({ error: "Invalid billing_period" }, { status: 400 });
    }

    // Validate location belongs to org if provided
    if (locationId) {
        const supabase = createAdminClient();
        const { data: loc } = await supabase
            .from("locations")
            .select("id, location_type")
            .eq("id", locationId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (!loc) {
            return NextResponse.json({ error: "Location not found" }, { status: 404 });
        }
    }

    const supabase = createAdminClient();

    // find existing then update-or-insert — avoids upsert with nullable unique column
    const matchQuery = supabase
        .from("commercial_tuition_rates")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("program_key", programKey)
        .eq("schedule_key", scheduleKey)
        .eq("billing_period", billingPeriod);

    const filteredQuery = locationId
        ? matchQuery.eq("location_id", locationId)
        : matchQuery.is("location_id", null);

    const { data: existingRow } = await filteredQuery.maybeSingle();

    let data: Record<string, unknown> | null = null;
    let error: { message: string } | null = null;

    if (existingRow) {
        const res = await supabase
            .from("commercial_tuition_rates")
            .update({
                rate_cents: Math.round(rateCents),
                is_active: isActive,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existingRow.id)
            .eq("org_id", ctx.orgId)
            .select(
                "id, org_id, location_id, program_key, schedule_key, rate_cents, billing_period, is_active, metadata, created_at, updated_at"
            )
            .single();
        data = res.data as Record<string, unknown> | null;
        error = res.error;
    } else {
        const res = await supabase
            .from("commercial_tuition_rates")
            .insert({
                org_id: ctx.orgId,
                location_id: locationId,
                program_key: programKey,
                schedule_key: scheduleKey,
                rate_cents: Math.round(rateCents),
                billing_period: billingPeriod,
                is_active: isActive,
                updated_at: new Date().toISOString(),
            })
            .select(
                "id, org_id, location_id, program_key, schedule_key, rate_cents, billing_period, is_active, metadata, created_at, updated_at"
            )
            .single();
        data = res.data as Record<string, unknown> | null;
        error = res.error;
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ rate: mapRateRow(data as Record<string, unknown>) }, { status: 201 });
}
