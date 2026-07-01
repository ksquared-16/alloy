import type { SupabaseClient } from "@supabase/supabase-js";
import {
    loadCleaningAddonsFromDb,
    loadPricingFrequenciesForVertical,
    loadSqftTiersForVertical,
    resolveCleaningVerticalId,
    resolveSqftTierDisplayLabels,
} from "@/lib/book-v2/loadCleaningPricingCatalog";
import { filterExcludedCustomerAddonKeys } from "@/lib/book-v2/customerAddonPolicy";
import { resolveOptionSetOptions, resolveOptionSetOptionsWithMetadata } from "@/lib/fields/resolveOptionSetOptions";
import type { PricingFrequencyRow } from "@/lib/book-v2/loadCleaningPricingCatalog";

export type CleaningQuoteCatalogBlob = {
    vertical_id: string;
    square_footage_tiers: { tier_key: string; label: string; sqft_key: string; sqft_label: string }[];
    pricing_frequencies: PricingFrequencyRow[];
    /** Addon keys + display + unit price (first visit; pricing engine uses DB rules). */
    addons: { id: string; label: string; price: number }[];
    option_sets: {
        bedrooms_booking: { value: string; label: string }[];
        bathrooms_booking: { value: string; label: string }[];
        cleaning_type: { value: string; label: string; metadata?: Record<string, unknown> }[];
        /** Back-compat: older orgs may still only have specialty_cleaning_type. */
        specialty_cleaning_type: { value: string; label: string; metadata?: Record<string, unknown> }[];
    };
};

/**
 * Same sources as GET /api/public/booking-config, but scoped to the **admin org**
 * (option_sets + tier labels resolve per org).
 */
export async function loadCleaningQuoteCatalogForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<CleaningQuoteCatalogBlob | null> {
    const verticalId = await resolveCleaningVerticalId(supabase, "cleaning");
    if (!verticalId) return null;

    const [tiersRaw, freqRows, addonBundle, bedroomOptions, bathroomOptions, specialtyCleaningTypeOptions] =
        await Promise.all([
            loadSqftTiersForVertical(supabase, verticalId),
            loadPricingFrequenciesForVertical(supabase, verticalId),
            loadCleaningAddonsFromDb(supabase, verticalId),
            resolveOptionSetOptions(supabase, orgId, "bedrooms_booking"),
            resolveOptionSetOptions(supabase, orgId, "bathrooms_booking"),
            resolveOptionSetOptionsWithMetadata(supabase, orgId, "specialty_cleaning_type"),
        ]);
    const cleaningTypeOptions = await resolveOptionSetOptionsWithMetadata(supabase, orgId, "cleaning_type");

    const tierRows = tiersRaw.length > 0 ? await resolveSqftTierDisplayLabels(supabase, orgId, tiersRaw) : [];

    const square_footage_tiers = tierRows.map((t) => {
        const tier_key = t.tier_key.trim();
        const label = (t.tier_label && String(t.tier_label).trim()) || tier_key;
        return {
            tier_key,
            label,
            sqft_key: tier_key,
            sqft_label: label,
        };
    });

    const addons = filterExcludedCustomerAddonKeys(addonBundle.available_addons.map((a) => a.key)).map((key) => {
        const row = addonBundle.available_addons.find((x) => x.key === key);
        return {
            id: key,
            label: row?.label ?? key,
            price: row?.price ?? 0,
        };
    });

    return {
        vertical_id: verticalId,
        square_footage_tiers,
        pricing_frequencies: freqRows,
        addons,
        option_sets: {
            bedrooms_booking: bedroomOptions.map((o) => ({ value: o.value, label: o.label })),
            bathrooms_booking: bathroomOptions.map((o) => ({ value: o.value, label: o.label })),
            cleaning_type: cleaningTypeOptions.map((o) => ({ value: o.value, label: o.label, metadata: o.metadata })),
            specialty_cleaning_type: specialtyCleaningTypeOptions.map((o) => ({ value: o.value, label: o.label, metadata: o.metadata })),
        },
    };
}
