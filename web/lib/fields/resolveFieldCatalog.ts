import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldOption } from "@/lib/fields/fieldDefinitionConfig";
import type { CatalogKey } from "@/lib/fields/fieldDefinitionConfig";
import { FALLBACK_SQFT_TIERS } from "@/lib/book-v2/loadCleaningPricingCatalog";

/**
 * Resolve config.catalog_key into select options for public/admin display (read-only).
 */
export async function resolveCatalogOptions(
    supabase: SupabaseClient,
    catalogKey: CatalogKey,
    params?: { verticalSlug?: string | null }
): Promise<FieldOption[]> {
    if (catalogKey === "home_types") {
        const { data, error } = await supabase
            .from("home_types")
            .select("key, label, position")
            .eq("is_active", true)
            .order("position", { ascending: true });
        if (error) {
            console.warn("[resolveFieldCatalog] home_types", error.message);
            return [];
        }
        return ((data ?? []) as { key: string; label: string }[]).map((r) => ({
            value: r.label.trim(),
            label: r.label.trim(),
        }));
    }

    if (catalogKey === "pricing_sqft_tiers") {
        const slug = params?.verticalSlug?.trim() || "cleaning";
        const { data: vert } = await supabase
            .from("verticals")
            .select("id")
            .eq("slug", slug)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
        const verticalId = (vert as { id?: string } | null)?.id;
        if (!verticalId) {
            return FALLBACK_SQFT_TIERS.map((t) => ({
                value: t.sqft_key,
                label: t.sqft_label ?? t.sqft_key,
            }));
        }
        const { data, error } = await supabase
            .from("pricing_square_footage_tiers")
            .select("sqft_key, sqft_label, sort_order")
            .eq("vertical_id", verticalId)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });
        if (error || !data?.length) {
            return FALLBACK_SQFT_TIERS.map((t) => ({
                value: t.sqft_key,
                label: t.sqft_label ?? t.sqft_key,
            }));
        }
        return (data as { sqft_key: string; sqft_label: string | null }[]).map((r) => ({
            value: r.sqft_key,
            label: (r.sqft_label ?? r.sqft_key).trim(),
        }));
    }

    return [];
}
