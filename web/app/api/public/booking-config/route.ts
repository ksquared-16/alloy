import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import {
    BOOK_V2_BATHROOM_OPTIONS,
    BOOK_V2_BEDROOM_OPTIONS,
    FALLBACK_SQFT_TIERS,
    loadActiveHomeTypes,
    loadCleaningAddonsFromDb,
    loadPricingFrequenciesForVertical,
    loadSqftTiersForVertical,
    resolveCleaningVerticalId,
} from "@/lib/book-v2/loadCleaningPricingCatalog";
import { filterExcludedCustomerAddonKeys } from "@/lib/book-v2/customerAddonPolicy";

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
        const verticalId = await resolveCleaningVerticalId(supabase, "cleaning");
        if (!verticalId) {
            return NextResponse.json({ ok: false, message: "Cleaning vertical not found" }, { status: 500 });
        }

        const [tiersRaw, homeTypes, freqRows, addonBundle] = await Promise.all([
            loadSqftTiersForVertical(supabase, verticalId),
            loadActiveHomeTypes(supabase),
            loadPricingFrequenciesForVertical(supabase, verticalId),
            loadCleaningAddonsFromDb(supabase, verticalId),
        ]);

        const square_footage_tiers = (tiersRaw.length ? tiersRaw : FALLBACK_SQFT_TIERS).map((t) => ({
            sqft_key: t.sqft_key,
            sqft_label: t.sqft_label ?? t.sqft_key,
            sort_order: t.sort_order,
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
            home_types: homeTypes.map((h) => ({
                key: h.key,
                label: h.label,
                position: h.position,
            })),
            bedroom_options: BOOK_V2_BEDROOM_OPTIONS,
            bathroom_options: BOOK_V2_BATHROOM_OPTIONS,
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
