import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import {
    loadActiveHomeTypes,
    loadCleaningAddonsFromDb,
    loadPricingFrequenciesForVertical,
    loadSqftTiersForVertical,
    resolveCleaningVerticalId,
    resolveSqftTierDisplayLabels,
} from "@/lib/book-v2/loadCleaningPricingCatalog";
import { filterExcludedCustomerAddonKeys } from "@/lib/book-v2/customerAddonPolicy";
import { BOOK_V2_ACCESS_METHOD_STABLE_TO_UI } from "@/lib/book-v2/bookingCanonicalMaps";
import { resolveOptionSetOptions, resolveOptionSetOptionsWithMetadata } from "@/lib/fields/resolveOptionSetOptions";
import { fetchOperationalTimezoneForOrg, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

/**
 * GET /api/public/booking-config
 * DB-backed catalogs for public booking UIs (cleaning vertical). Service role; no secrets in response.
 */
export async function GET() {
    try {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ ok: false, message: "Server misconfiguration" }, { status: 500 });
        }
        const supabase = createServiceRoleClient();
        const orgId = process.env.ALLOY_PUBLIC_ORG_ID?.trim() || null;
        let operational_timezone_iana = UTC_FALLBACK_IANA;
        if (orgId) {
            const { iana } = await fetchOperationalTimezoneForOrg(supabase, orgId);
            operational_timezone_iana = iana;
        }
        const verticalId = await resolveCleaningVerticalId(supabase, "cleaning");
        if (!verticalId) {
            return NextResponse.json({ ok: false, message: "Cleaning vertical not found" }, { status: 500 });
        }

        const [
            tiersRaw,
            homeTypesFromSet,
            homeTypesLegacy,
            freqRows,
            addonBundle,
            bedroomOptions,
            bathroomOptions,
            cleaningTypeOptions,
            specialtyCleaningTypeOptions,
            accessMethodStableOptions,
        ] = await Promise.all([
            loadSqftTiersForVertical(supabase, verticalId),
            orgId ? resolveOptionSetOptions(supabase, orgId, "home_type") : Promise.resolve([]),
            loadActiveHomeTypes(supabase),
            loadPricingFrequenciesForVertical(supabase, verticalId),
            loadCleaningAddonsFromDb(supabase, verticalId),
            orgId ? resolveOptionSetOptions(supabase, orgId, "bedrooms_booking") : Promise.resolve([]),
            orgId ? resolveOptionSetOptions(supabase, orgId, "bathrooms_booking") : Promise.resolve([]),
            orgId ? resolveOptionSetOptionsWithMetadata(supabase, orgId, "cleaning_type") : Promise.resolve([]),
            orgId ? resolveOptionSetOptionsWithMetadata(supabase, orgId, "specialty_cleaning_type") : Promise.resolve([]),
            orgId ? resolveOptionSetOptions(supabase, orgId, "access_method") : Promise.resolve([]),
        ]);

        const access_method_booking_ui = accessMethodStableOptions.map((o) => {
            const stable = String(o.value).trim();
            const ui = BOOK_V2_ACCESS_METHOD_STABLE_TO_UI[stable] ?? stable;
            return {
                value: ui,
                label: (o.label && String(o.label).trim()) || ui,
            };
        });

        const tierRows =
            tiersRaw.length > 0 ? await resolveSqftTierDisplayLabels(supabase, orgId, tiersRaw) : [];

        const square_footage_tiers = tierRows.map((t) => {
            const tier_key = t.tier_key.trim();
            const label = (t.tier_label && String(t.tier_label).trim()) || tier_key;
            return {
                tier_key,
                label,
                sort_order: t.sort_order,
                sqft_key: tier_key,
                sqft_label: label,
            };
        });

        const home_types =
            homeTypesFromSet.length > 0
                ? homeTypesFromSet.map((h, i) => ({
                      key: h.value,
                      label: h.label,
                      position: i,
                  }))
                : homeTypesLegacy.map((h) => ({
                      key: h.key,
                      label: h.label,
                      position: h.position,
                  }));

        const addons = filterExcludedCustomerAddonKeys(addonBundle.available_addons.map((a) => a.key)).map((key) => {
            const row = addonBundle.available_addons.find((x) => x.key === key);
            return {
                id: key,
                label: row?.label ?? key,
                price: row?.price ?? 0,
            };
        });

        return NextResponse.json({
            ok: true,
            vertical_id: verticalId,
            /** Org operational calendar timezone for slot selection (metadata.timezone → time_zone → UTC). */
            operational_timezone_iana,
            square_footage_tiers,
            home_types,
            bedroom_options: bedroomOptions,
            bathroom_options: bathroomOptions,
            /** Canonical: unified cleaning type options (standard + specialty), with metadata (e.g. is_specialty). */
            cleaning_type_options: cleaningTypeOptions,
            /** Deprecated legacy key (kept for older clients; will be removed after migration). */
            specialty_cleaning_type_options: specialtyCleaningTypeOptions,
            access_method_booking_ui,
            beds_input: { min: 0, max: 20, step: 1 },
            baths_input: { min: 0, max: 15, step: 0.5 },
            pricing_frequencies: freqRows,
            addons,
        });
    } catch (e) {
        console.error("[PUBLIC_BOOKING_CONFIG]", e);
        return NextResponse.json(
            { ok: false, message: e instanceof Error ? e.message : "booking-config failed" },
            { status: 500 }
        );
    }
}
