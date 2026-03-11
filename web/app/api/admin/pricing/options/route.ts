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

    const [verticalsRes, modesRes, servicesRes, tiersRes, freqsRes] = await Promise.all([
        supabase.from("verticals").select("id, name, slug").order("name", { ascending: true }),
        supabase.from("pricing_modes").select("id, mode_key, mode_label").order("mode_key", { ascending: true }),
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

    const pricing_modes = (modesRes.data ?? []) as { id: string; mode_key?: string | null; mode_label?: string | null }[];
    const modes = pricing_modes.map((m) => ({
        id: m.id,
        key: m.mode_key ?? m.id,
        label: m.mode_label ?? m.mode_key ?? m.id,
    }));

    // Matrix create form: service_offerings (by vertical), plan templates, dimension values with dimension label
    let matrix_service_offerings: { id: string; label: string }[];
    if (verticalId) {
        const { data: byVertical } = await supabase.from("service_offerings").select("id, offering_name, offering_key").eq("vertical_id", verticalId).order("offering_name", { ascending: true });
        matrix_service_offerings = (byVertical ?? []).map((o: { id: string; offering_name?: string | null; offering_key?: string | null }) => ({
            id: o.id,
            label: o.offering_name ?? o.offering_key ?? o.id,
        }));
    } else {
        const { data: allOfferings } = await supabase.from("service_offerings").select("id, offering_name, offering_key").order("offering_name", { ascending: true });
        matrix_service_offerings = (allOfferings ?? []).map((o: { id: string; offering_name?: string | null; offering_key?: string | null }) => ({
            id: o.id,
            label: o.offering_name ?? o.offering_key ?? o.id,
        }));
    }
    const { data: planTemplatesData } = await supabase.from("service_plan_templates").select("id, plan_name, plan_key").order("plan_name", { ascending: true, nullsFirst: false });
    const matrix_plan_templates = (planTemplatesData ?? []).map((p: { id: string; plan_name?: string | null; plan_key?: string | null }) => ({
        id: p.id,
        label: p.plan_name ?? p.plan_key ?? p.id,
    }));
    const { data: dimValuesData } = await supabase.from("pricing_dimension_values").select("id, value_label, dimension_id, pricing_dimension_id");
    const dimValues = (dimValuesData ?? []) as { id: string; value_label?: string | null; dimension_id?: string | null; pricing_dimension_id?: string | null }[];
    const dimIdsForMatrix = [...new Set(dimValues.map((d) => d.dimension_id ?? d.pricing_dimension_id).filter(Boolean))] as string[];
    const { data: dimsData } = dimIdsForMatrix.length ? await supabase.from("pricing_dimensions").select("id, dimension_label, dimension_key, name").in("id", dimIdsForMatrix) : { data: [] };
    const dimLabelMap = new Map((dimsData ?? []).map((d: Record<string, unknown>) => [d.id as string, (d.dimension_label as string) ?? (d.dimension_key as string) ?? (d.name as string) ?? null]));
    const matrix_dimension_values = dimValues.map((d) => {
        const dimId = d.dimension_id ?? d.pricing_dimension_id ?? null;
        const dimLabel = dimId ? dimLabelMap.get(dimId) ?? null : null;
        const valueLabel = d.value_label ?? d.id;
        return { id: d.id, label: valueLabel, dimension_label: dimLabel };
    });

    return NextResponse.json({
        verticals,
        pricing_modes: modes,
        pricing_services,
        dimension_value_options,
        pricing_frequencies,
        matrix_service_offerings,
        matrix_plan_templates,
        matrix_dimension_values,
    });
}
