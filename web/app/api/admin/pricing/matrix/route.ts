import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

export type PricingMatrixRow = {
    id: string;
    vertical_id: string | null;
    service_offering_id: string | null;
    service_plan_template_id: string | null;
    pricing_mode_id: string | null;
    pricing_dimension_value_id: string | null;
    amount_cents: number | null;
    is_active: boolean;
    source_table: string | null;
    source_id: string | null;
    created_at: string;
    updated_at: string | null;
    _service_offering_name: string | null;
    _plan_template_name: string | null;
    _pricing_mode_name: string | null;
    _dimension_name: string | null;
    _dimension_value_label: string | null;
    _vertical_name: string | null;
    _amount_display: string | null;
    _updated: string | null;
    _source_label: string | null;
};

/** GET: list pricing_matrix rows with joined display labels (live quote base amounts for get_quote_pricing). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const verticalId = searchParams.get("vertical_id")?.trim() || null;
    const serviceOfferingId = searchParams.get("service_offering_id")?.trim() || null;
    const pricingModeId = searchParams.get("pricing_mode_id")?.trim() || null;
    const servicePlanTemplateId = searchParams.get("service_plan_template_id")?.trim() || null;
    const isActiveParam = searchParams.get("is_active")?.trim().toLowerCase();

    const supabase = createAdminClient();
    try {
        let q = supabase
            .from("pricing_matrix")
            .select("id, vertical_id, service_offering_id, service_plan_template_id, pricing_mode_id, pricing_dimension_value_id, amount_cents, is_active, source_table, source_id, created_at, updated_at", { count: "exact" });

        if (verticalId) q = q.eq("vertical_id", verticalId);
        if (serviceOfferingId) q = q.eq("service_offering_id", serviceOfferingId);
        if (pricingModeId) q = q.eq("pricing_mode_id", pricingModeId);
        if (servicePlanTemplateId) q = q.eq("service_plan_template_id", servicePlanTemplateId);
        if (isActiveParam === "true") q = q.eq("is_active", true);
        if (isActiveParam === "false") q = q.eq("is_active", false);

        const { data: rows, error } = await q.order("updated_at", { ascending: false, nullsFirst: false });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const list = (rows ?? []) as Record<string, unknown>[];
        if (list.length === 0) {
            return NextResponse.json({ rows: [], total: 0 });
        }

        const verticalIds = [...new Set(list.map((r) => r.vertical_id as string).filter(Boolean))] as string[];
        const offeringIds = [...new Set(list.map((r) => r.service_offering_id as string).filter(Boolean))] as string[];
        const planIds = [...new Set(list.map((r) => r.service_plan_template_id as string).filter(Boolean))] as string[];
        const modeIds = [...new Set(list.map((r) => r.pricing_mode_id as string).filter(Boolean))] as string[];
        const dimValIds = [...new Set(list.map((r) => r.pricing_dimension_value_id as string).filter(Boolean))] as string[];

        const [verticalsRes, offeringsRes, plansRes, modesRes, dimValsRes] = await Promise.all([
            verticalIds.length ? supabase.from("verticals").select("id, name, slug").in("id", verticalIds) : { data: [] },
            offeringIds.length ? supabase.from("service_offerings").select("id, offering_name, offering_key").in("id", offeringIds) : { data: [] },
            planIds.length ? supabase.from("service_plan_templates").select("id, plan_name, plan_key").in("id", planIds) : { data: [] },
            modeIds.length ? supabase.from("pricing_modes").select("id, mode_name, mode_key").in("id", modeIds) : { data: [] },
            dimValIds.length ? supabase.from("pricing_dimension_values").select("id, value_label, dimension_id").in("id", dimValIds) : { data: [] },
        ]);

        const verticalMap = new Map((verticalsRes.data ?? []).map((v: Record<string, unknown>) => [v.id as string, (v.name as string) ?? (v.slug as string) ?? null]));
        const offeringMap = new Map((offeringsRes.data ?? []).map((o: Record<string, unknown>) => [o.id as string, (o.offering_name as string) ?? (o.offering_key as string) ?? null]));
        const planMap = new Map((plansRes.data ?? []).map((p: Record<string, unknown>) => [p.id as string, (p.plan_name as string) ?? (p.plan_key as string) ?? null]));
        const modeMap = new Map((modesRes.data ?? []).map((m: Record<string, unknown>) => [m.id as string, (m.mode_name as string) ?? (m.mode_key as string) ?? null]));
        const dimValData = (dimValsRes.data ?? []) as { id: string; value_label?: string | null; dimension_id?: string | null }[];
        const dimValMap = new Map(dimValData.map((d) => [d.id, d.value_label ?? null]));
        const dimensionIdFromVal = (d: (typeof dimValData)[0]) => d.dimension_id ?? null;
        const dimensionIds = [...new Set(dimValData.map(dimensionIdFromVal).filter(Boolean))] as string[];
        const { data: dimensionsData } = dimensionIds.length
            ? await supabase.from("pricing_dimensions").select("id, dimension_name, dimension_key").in("id", dimensionIds)
            : { data: [] };
        const dimensionMap = new Map((dimensionsData ?? []).map((d: Record<string, unknown>) => [d.id as string, (d.dimension_name as string) ?? (d.dimension_key as string) ?? null]));
        const dimValToDimensionId = new Map(dimValData.map((d) => [d.id, dimensionIdFromVal(d)]));

        const out: PricingMatrixRow[] = list.map((r) => {
            const amountCents = r.amount_cents != null ? Number(r.amount_cents) : null;
            const amountDisplay = amountCents != null ? `$${(amountCents / 100).toFixed(2)}` : null;
            const dimValId = r.pricing_dimension_value_id as string | null;
            const dimensionId = dimValId ? dimValToDimensionId.get(dimValId) ?? null : null;
            const sourceTable = (r.source_table as string) ?? null;
            const sourceLabel =
                sourceTable === "pricing_first_clean_prices" ? "Initial Legacy" : sourceTable === "pricing_recurring_prices" ? "Recurring Legacy" : sourceTable ?? null;

            return {
                id: r.id as string,
                vertical_id: (r.vertical_id as string) ?? null,
                service_offering_id: (r.service_offering_id as string) ?? null,
                service_plan_template_id: (r.service_plan_template_id as string) ?? null,
                pricing_mode_id: (r.pricing_mode_id as string) ?? null,
                pricing_dimension_value_id: dimValId ?? null,
                amount_cents: amountCents,
                is_active: !!(r.is_active ?? true),
                source_table: sourceTable,
                source_id: (r.source_id as string) ?? null,
                created_at: (r.created_at as string) ?? "",
                updated_at: (r.updated_at as string) ?? null,
                _service_offering_name: (r.service_offering_id as string) ? offeringMap.get(r.service_offering_id as string) ?? null : null,
                _plan_template_name: (r.service_plan_template_id as string) ? planMap.get(r.service_plan_template_id as string) ?? null : null,
                _pricing_mode_name: (r.pricing_mode_id as string) ? modeMap.get(r.pricing_mode_id as string) ?? null : null,
                _dimension_name: dimensionId ? dimensionMap.get(dimensionId) ?? null : null,
                _dimension_value_label: dimValId ? dimValMap.get(dimValId) ?? null : null,
                _vertical_name: (r.vertical_id as string) ? verticalMap.get(r.vertical_id as string) ?? null : null,
                _amount_display: amountDisplay,
                _updated: (r.updated_at as string) ?? (r.created_at as string) ?? null,
                _source_label: sourceLabel,
            };
        });

        return NextResponse.json({ rows: out, total: out.length });
    } catch (e) {
        console.error("[pricing/matrix]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/** POST: create a pricing_matrix row. Body: vertical_id, service_offering_id, pricing_mode_id, service_plan_template_id (optional), pricing_dimension_value_id (optional), amount or amount_cents, is_active. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: {
        vertical_id?: string;
        service_offering_id?: string;
        pricing_mode_id?: string;
        service_plan_template_id?: string | null;
        pricing_dimension_value_id?: string | null;
        amount?: number;
        amount_cents?: number;
        is_active?: boolean;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const vertical_id = typeof body.vertical_id === "string" && body.vertical_id.trim() ? body.vertical_id.trim() : null;
    const service_offering_id = typeof body.service_offering_id === "string" && body.service_offering_id.trim() ? body.service_offering_id.trim() : null;
    const pricing_mode_id = typeof body.pricing_mode_id === "string" && body.pricing_mode_id.trim() ? body.pricing_mode_id.trim() : null;
    const service_plan_template_id =
        body.service_plan_template_id !== undefined && body.service_plan_template_id !== null && typeof body.service_plan_template_id === "string" && body.service_plan_template_id.trim()
            ? body.service_plan_template_id.trim()
            : null;
    const pricing_dimension_value_id =
        body.pricing_dimension_value_id !== undefined && body.pricing_dimension_value_id !== null && typeof body.pricing_dimension_value_id === "string" && body.pricing_dimension_value_id.trim()
            ? body.pricing_dimension_value_id.trim()
            : null;

    if (!vertical_id || !service_offering_id || !pricing_mode_id) {
        return NextResponse.json({ error: "vertical_id, service_offering_id, and pricing_mode_id are required" }, { status: 400 });
    }

    let amount_cents: number;
    if (body.amount_cents != null && typeof body.amount_cents === "number") amount_cents = Math.round(body.amount_cents);
    else if (body.amount != null && typeof body.amount === "number") amount_cents = Math.round(body.amount * 100);
    else amount_cents = 0;
    amount_cents = Math.max(0, amount_cents);

    const supabase = createAdminClient();
    const insert = {
        vertical_id,
        service_offering_id,
        service_plan_template_id: service_plan_template_id || null,
        pricing_mode_id,
        pricing_dimension_value_id: pricing_dimension_value_id || null,
        amount_cents,
        is_active: body.is_active !== false,
    };
    const { data, error } = await supabase
        .from("pricing_matrix")
        .insert(insert)
        .select("id, vertical_id, service_offering_id, service_plan_template_id, pricing_mode_id, pricing_dimension_value_id, amount_cents, is_active, created_at, updated_at")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}
