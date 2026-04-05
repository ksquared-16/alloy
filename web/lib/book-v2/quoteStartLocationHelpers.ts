import type { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { homeTypeInputToStableKey, parseBathroomsForCjd, parseBedsFromBody } from "@/lib/book-v2/bookingCanonicalMaps";

type Supabase = ReturnType<typeof createServiceRoleClient>;

export function quoteStartNativeLocationPatch(
    body: Record<string, unknown>,
    squareFootageTierKey: string
): Record<string, unknown> {
    const patch: Record<string, unknown> = {
        square_footage_tier_key: squareFootageTierKey,
        updated_at: new Date().toISOString(),
    };
    const beds = parseBedsFromBody(body.beds ?? body.bedrooms);
    const baths = parseBathroomsForCjd(body.baths ?? body.bathrooms).baths;
    const hk = homeTypeInputToStableKey(body.home_type);
    if (beds != null) patch.beds = beds;
    if (baths != null) patch.baths = baths;
    if (hk) patch.home_type_key = hk;
    return patch;
}

/** Default label for quote-created locations: "{Person Name} — {ZIP}" or "{Person Name} — Location". */
export function quoteLocationLabel(
    personDisplayName: string | null | undefined,
    postalCode: string | null | undefined
): string {
    const name = personDisplayName?.trim() || "";
    const zip = postalCode?.trim() || "";
    if (name && zip) return `${name} — ${zip}`;
    if (name) return `${name} — Location`;
    if (zip) return zip;
    return "Quote location";
}

/** Lightweight quote-stage location (customer_id null until booking). */
export async function createQuoteLocation(
    supabase: Supabase,
    orgId: string,
    postalCode: string | null,
    personDisplayName?: string | null
): Promise<string | null> {
    const label = quoteLocationLabel(personDisplayName ?? null, postalCode);
    const { data: created, error } = await supabase
        .from("locations")
        .insert({
            org_id: orgId,
            customer_id: null,
            vendor_id: null,
            label,
            location_type: "address",
            is_primary: false,
            is_active: true,
            postal_code: postalCode?.trim() || null,
            metadata: {},
        })
        .select("id")
        .single();
    if (error || !created) {
        console.warn("[QUOTE_LOCATION] Location insert failed:", error?.message);
        return null;
    }
    return (created as { id: string }).id;
}

export async function upsertPersonLocationForQuote(
    supabase: Supabase,
    orgId: string,
    personId: string,
    locationId: string
): Promise<void> {
    await supabase
        .from("person_locations")
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq("person_id", personId)
        .eq("org_id", orgId);
    const { data: existing } = await supabase
        .from("person_locations")
        .select("id")
        .eq("person_id", personId)
        .eq("location_id", locationId)
        .maybeSingle();
    const now = new Date().toISOString();
    if (existing?.id) {
        await supabase
            .from("person_locations")
            .update({
                is_primary: true,
                relationship_type: "associated",
                updated_at: now,
            })
            .eq("id", (existing as { id: string }).id);
    } else {
        const { error } = await supabase.from("person_locations").insert({
            org_id: orgId,
            person_id: personId,
            location_id: locationId,
            relationship_type: "associated",
            is_primary: true,
            metadata: {},
        });
        if (error) {
            console.error("[QUOTE_LOCATION] person_locations insert failed:", error.message);
        }
    }
}
