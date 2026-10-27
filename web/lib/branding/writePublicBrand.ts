import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_BRAND_METADATA_KEY, type PublicBrandValues } from "@/lib/branding/publicBrand";

/**
 * Writes the organization / location brand layer. Only `public_brand_v1` changes; every other
 * metadata key is carried over. All-empty removes the key (= inherit everything).
 */
function mergeBrand(metadata: unknown, values: PublicBrandValues): Record<string, unknown> {
    const current =
        metadata != null && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
    if (!values.display_name && !values.accent_color && !values.logo_url) {
        delete current[PUBLIC_BRAND_METADATA_KEY];
    } else {
        current[PUBLIC_BRAND_METADATA_KEY] = values;
    }
    return current;
}

export async function writeOrganizationPublicBrand(
    supabase: SupabaseClient,
    orgId: string,
    values: PublicBrandValues
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error) return { ok: false, error: error.message };
    const metadata = mergeBrand((data as { metadata?: unknown } | null)?.metadata, values);
    const { error: upsertErr } = await supabase.from("org_settings").upsert({ org_id: orgId, metadata }, { onConflict: "org_id" });
    return upsertErr ? { ok: false, error: upsertErr.message } : { ok: true };
}

export async function writeLocationPublicBrand(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string,
    values: PublicBrandValues
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const { data, error } = await supabase.from("locations").select("id, metadata").eq("id", locationId).eq("org_id", orgId).maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!data) return { ok: false, status: 404, error: "Location not found" };
    const metadata = mergeBrand((data as { metadata?: unknown }).metadata, values);
    const { error: updErr } = await supabase.from("locations").update({ metadata }).eq("id", locationId).eq("org_id", orgId);
    return updErr ? { ok: false, status: 400, error: updErr.message } : { ok: true };
}
