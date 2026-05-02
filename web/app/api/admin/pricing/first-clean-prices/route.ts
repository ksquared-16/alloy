import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

export type FirstCleanPriceRow = {
    id: string;
    service_id?: string | null;
    dimension_value_id?: string | null;
    sqft_tier_id?: string | null;
    vertical_id?: string | null;
    amount_cents: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
    _service_name: string | null;
    _pricing_dimension_label: string | null;
    _dimension_value_label: string | null;
    _updated: string | null;
};

/** GET: list first clean prices with joined labels. Filter by vertical_id, service_offering_id (via service). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const verticalId = searchParams.get("vertical_id")?.trim() || null;
    const serviceOfferingId = searchParams.get("service_offering_id")?.trim() || null;

    const supabase = createAdminClient();
    try {
        let q = supabase.from("pricing_first_clean_prices").select(`
            id,
            vertical_id,
            service_id,
            sqft_tier_id,
            amount_cents,
            is_active,
            created_at,
            updated_at
        `, { count: "exact" });

        if (verticalId) q = q.eq("vertical_id", verticalId);

        const { data: rows, error } = await q.order("updated_at", { ascending: false, nullsFirst: false });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const list = rows ?? [];
        const serviceIds = [...new Set(list.map((r: Record<string, unknown>) => r.service_id as string).filter(Boolean))] as string[];
        const tierIds = [...new Set(list.map((r: Record<string, unknown>) => r.sqft_tier_id as string).filter(Boolean))] as string[];

        const [servicesRes, tiersRes] = await Promise.all([
            serviceIds.length ? supabase.from("pricing_services").select("id, service_offering_id").in("id", serviceIds) : { data: [] },
            tierIds.length ? supabase.from("pricing_square_footage_tiers").select("id, dimension_value_id, tier_key").in("id", tierIds) : { data: [] },
        ]);

        const serviceOfferingIds = (servicesRes.data ?? []).map((s: Record<string, unknown>) => s.service_offering_id).filter(Boolean) as string[];
        const offeringsRes = serviceOfferingIds.length ? await supabase.from("service_offerings").select("id, offering_name").in("id", serviceOfferingIds) : { data: [] };
        const offeringMap = new Map((offeringsRes.data ?? []).map((o: Record<string, unknown>) => [o.id as string, (o.offering_name as string) ?? null]));
        const serviceToOffering = new Map((servicesRes.data ?? []).map((s: Record<string, unknown>) => [s.id as string, s.service_offering_id as string]));
        const serviceNameMap = new Map<string, string>();
        serviceToOffering.forEach((offId, svcId) => { const name = offeringMap.get(offId); if (name) serviceNameMap.set(svcId, name); });

        const tierMap = new Map(
            (tiersRes.data ?? []).map((t: Record<string, unknown>) => [
                t.id as string,
                {
                    dimension_value_id: t.dimension_value_id as string | null,
                    tier_key: (t.tier_key as string) ?? null,
                },
            ])
        );
        const dimValIdsFromTiers = [...new Set((tiersRes.data ?? []).map((t: Record<string, unknown>) => t.dimension_value_id as string).filter(Boolean))] as string[];
        const { data: dimValsData } = dimValIdsFromTiers.length ? await supabase.from("pricing_dimension_values").select("id, value_label").in("id", dimValIdsFromTiers) : { data: [] };
        const dimValMap = new Map((dimValsData ?? []).map((d: Record<string, unknown>) => [d.id as string, (d.value_label as string) ?? null]));

        const out: FirstCleanPriceRow[] = list.map((r: Record<string, unknown>) => {
            const svcId = r.service_id as string | null;
            const tierId = r.sqft_tier_id as string | null;
            const tier = tierId ? tierMap.get(tierId) : null;
            const dimValId = tier?.dimension_value_id ?? null;
            const dimLabel = dimValId ? (dimValMap.get(dimValId) ?? null) : null;
            const sqftLabel = tier?.tier_key ?? null;
            return {
                id: r.id as string,
                service_id: svcId ?? null,
                dimension_value_id: dimValId ?? null,
                sqft_tier_id: tierId ?? null,
                vertical_id: (r.vertical_id as string) ?? null,
                amount_cents: r.amount_cents != null ? Number(r.amount_cents) : null,
                is_active: !!(r.is_active ?? true),
                created_at: (r.created_at as string) ?? "",
                updated_at: (r.updated_at as string) ?? null,
                _service_name: svcId ? (serviceNameMap.get(svcId) ?? null) : null,
                _pricing_dimension_label: "Square Footage",
                _dimension_value_label: dimLabel ?? sqftLabel ?? null,
                _updated: (r.updated_at as string) ?? (r.created_at as string) ?? null,
            };
        });

        const filtered = serviceOfferingId ? out.filter((r) => { const sid = r.service_id; if (!sid) return false; return serviceToOffering.get(sid) === serviceOfferingId; }) : out;
        return NextResponse.json({ rows: filtered, total: filtered.length });
    } catch (e) {
        console.error("[pricing/first-clean-prices]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/** POST: create first clean price. Body: vertical_id, service_id, sqft_tier_id, amount (dollars) or amount_cents, is_active. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: { vertical_id?: string; service_id?: string; sqft_tier_id?: string; amount?: number; amount_cents?: number; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const vertical_id = typeof body.vertical_id === "string" && body.vertical_id.trim() ? body.vertical_id.trim() : null;
    const service_id = typeof body.service_id === "string" && body.service_id.trim() ? body.service_id.trim() : null;
    const sqft_tier_id = typeof body.sqft_tier_id === "string" && body.sqft_tier_id.trim() ? body.sqft_tier_id.trim() : null;
    if (!vertical_id || !service_id || !sqft_tier_id) {
        return NextResponse.json({ error: "vertical_id, service_id, and sqft_tier_id are required" }, { status: 400 });
    }

    let amount_cents: number;
    if (body.amount_cents != null && typeof body.amount_cents === "number") amount_cents = Math.round(body.amount_cents);
    else if (body.amount != null && typeof body.amount === "number") amount_cents = Math.round(body.amount * 100);
    else amount_cents = 0;
    amount_cents = Math.max(0, amount_cents);

    const supabase = createAdminClient();
    const insert = {
        vertical_id,
        service_id,
        sqft_tier_id,
        amount_cents,
        is_active: body.is_active !== false,
    };
    const { data, error } = await supabase.from("pricing_first_clean_prices").insert(insert).select("id, vertical_id, service_id, sqft_tier_id, amount_cents, is_active, created_at, updated_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}
