import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import {
    CANONICAL_SQFT_TIER_OPTIONS,
    FALLBACK_SQFT_TIERS,
    loadActiveHomeTypes,
    loadCleaningAddonsFromDb,
    loadPricingFrequenciesForVertical,
    loadSqftTiersForVertical,
    resolveCleaningVerticalId,
} from "@/lib/book-v2/loadCleaningPricingCatalog";
import { filterExcludedCustomerAddonKeys } from "@/lib/book-v2/customerAddonPolicy";
import { resolveOptionSetOptions } from "@/lib/fields/resolveOptionSetOptions";

const TIER_LABEL_BY_KEY = Object.fromEntries(CANONICAL_SQFT_TIER_OPTIONS.map((o) => [o.value, o.label]));

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
        const verticalId = await resolveCleaningVerticalId(supabase, "cleaning");
        if (!verticalId) {
            return NextResponse.json({ ok: false, message: "Cleaning vertical not found" }, { status: 500 });
        }

        const [tiersRaw, homeTypesFromSet, homeTypesLegacy, freqRows, addonBundle] = await Promise.all([
            loadSqftTiersForVertical(supabase, verticalId),
            orgId ? resolveOptionSetOptions(supabase, orgId, "home_type") : Promise.resolve([]),
            loadActiveHomeTypes(supabase),
            loadPricingFrequenciesForVertical(supabase, verticalId),
            loadCleaningAddonsFromDb(supabase, verticalId),
        ]);

        const tierRows = tiersRaw.length
            ? tiersRaw
            : FALLBACK_SQFT_TIERS.map((t, i) => ({
                  tier_key: t.sqft_key,
                  tier_label: t.sqft_label,
                  sort_order: typeof t.sort_order === "number" ? t.sort_order : i,
              }));

        const square_footage_tiers = tierRows.map((t) => {
            const tier_key = t.tier_key.trim();
            const label = (t.tier_label && String(t.tier_label).trim()) || TIER_LABEL_BY_KEY[tier_key] || tier_key;
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
            square_footage_tiers,
            home_types,
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
