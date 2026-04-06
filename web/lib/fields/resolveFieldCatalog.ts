import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldOption } from "@/lib/fields/fieldDefinitionConfig";
import type { CatalogKey } from "@/lib/fields/fieldDefinitionConfig";
import { CANONICAL_SQFT_TIER_OPTIONS } from "@/lib/book-v2/loadCleaningPricingCatalog";
import { resolveOptionSetOptions } from "@/lib/fields/resolveOptionSetOptions";

/**
 * Resolve config.catalog_key into select options (read-only).
 * Prefer org option_sets when orgId is provided (single source of truth).
 */
export async function resolveCatalogOptions(
    supabase: SupabaseClient,
    catalogKey: CatalogKey,
    params?: { verticalSlug?: string | null; orgId?: string | null }
): Promise<FieldOption[]> {
    const orgId = params?.orgId?.trim() || null;

    if (catalogKey === "home_types") {
        if (orgId) {
            const opts = await resolveOptionSetOptions(supabase, orgId, "home_type");
            if (opts.length) return opts;
        }
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
            value: String(r.key).trim(),
            label: (r.label && String(r.label).trim()) || String(r.key).trim(),
        }));
    }

    if (catalogKey === "pricing_sqft_tiers") {
        if (orgId) {
            const opts = await resolveOptionSetOptions(supabase, orgId, "square_footage_tier");
            if (opts.length) return opts;
        }
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
            return [...CANONICAL_SQFT_TIER_OPTIONS];
        }
        const { data, error } = await supabase
            .from("pricing_square_footage_tiers")
            .select("tier_key, sort_order")
            .eq("vertical_id", verticalId)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });
        if (error || !data?.length) {
            return [...CANONICAL_SQFT_TIER_OPTIONS];
        }
        return (data as { tier_key: string }[]).map((r) => ({
            value: String(r.tier_key).trim(),
            label: String(r.tier_key).trim(),
        }));
    }

    return [];
}
