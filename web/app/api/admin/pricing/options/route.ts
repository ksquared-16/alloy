import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: options for pricing create forms. Query vertical_id to filter services, dimension values, frequencies by vertical. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const verticalId = searchParams.get("vertical_id")?.trim() || null;

    const supabase = createAdminClient();

    const [verticalsRes, servicesRes, tiersRes, freqsRes] = await Promise.all([
        supabase.from("verticals").select("id, name, slug").order("name", { ascending: true }),
        verticalId
            ? (async () => {
                const { data: offerings } = await supabase.from("service_offerings").select("id").eq("vertical_id", verticalId);
                const ids = (offerings ?? []).map((o: { id: string }) => o.id);
                if (ids.length === 0) return { data: [] };
                return supabase.from("pricing_services").select("id, service_offering_id").in("service_offering_id", ids);
            })()
            : supabase.from("pricing_services").select("id, service_offering_id"),
        supabase.from("pricing_square_footage_tiers").select("id, sqft_label, dimension_value_id").order("sort_order", { ascending: true, nullsFirst: false }),
        verticalId
            ? supabase.from("pricing_frequencies").select("id, frequency_label, frequency_key").eq("vertical_id", verticalId).order("frequency_label", { ascending: true })
            : supabase.from("pricing_frequencies").select("id, frequency_label, frequency_key").order("frequency_label", { ascending: true }),
    ]);

    const verticals = (verticalsRes.data ?? []) as { id: string; name: string | null; slug: string | null }[];
    const servicesRaw = (servicesRes.data ?? []) as { id: string; service_offering_id: string | null }[];
    const offeringIds = [...new Set(servicesRaw.map((s) => s.service_offering_id).filter(Boolean))] as string[];
    const { data: offeringsData } = offeringIds.length
        ? await supabase.from("service_offerings").select("id, offering_name, offering_key").in("id", offeringIds)
        : { data: [] };
    const offeringMap = new Map((offeringsData ?? []).map((o: { id: string; offering_name?: string | null; offering_key?: string | null }) => [o.id, o.offering_name ?? o.offering_key ?? o.id]));
    const pricing_services = servicesRaw.map((s) => ({
        id: s.id,
        label: s.service_offering_id ? (offeringMap.get(s.service_offering_id) ?? s.id) : s.id,
    }));

    const tiers = (tiersRes.data ?? []) as { id: string; sqft_label?: string | null; dimension_value_id?: string | null }[];
    const dimValIds = [...new Set(tiers.map((t) => t.dimension_value_id).filter(Boolean))] as string[];
    const { data: dimValsData } = dimValIds.length
        ? await supabase.from("pricing_dimension_values").select("id, value_label").in("id", dimValIds)
        : { data: [] };
    const dimValMap = new Map((dimValsData ?? []).map((d: { id: string; value_label?: string | null }) => [d.id, d.value_label ?? d.id]));
    const dimension_value_options = tiers.map((t) => ({
        id: t.id,
        label: (t.dimension_value_id ? (dimValMap.get(t.dimension_value_id) ?? null) : null) ?? t.sqft_label ?? t.id,
    }));

    const frequencies = (freqsRes.data ?? []) as { id: string; frequency_label?: string | null; frequency_key?: string | null }[];
    const pricing_frequencies = frequencies.map((f) => ({
        id: f.id,
        label: f.frequency_label ?? f.frequency_key ?? f.id,
    }));

    return NextResponse.json({
        verticals,
        pricing_services,
        dimension_value_options,
        pricing_frequencies,
    });
}
