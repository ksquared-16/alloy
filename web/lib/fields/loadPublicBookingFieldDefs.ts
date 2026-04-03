import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicBookingDefRow = { id: string; field_key: string; field_type: string };

/** Location keys stored on native columns / option keys — not field_values */
export const NATIVE_LOCATION_PUBLIC_FIELD_KEYS = new Set([
    "beds",
    "baths",
    "home_type",
    "access_method",
    "square_footage_tier",
]);

export async function loadPublicBookingFieldDefRows(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string
): Promise<PublicBookingDefRow[]> {
    const { data, error } = await supabase
        .from("field_definitions")
        .select("id, field_key, field_type")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .eq("is_visible_in_public_booking", true);
    if (error) {
        console.error("[PUBLIC_BOOKING_DEFS]", entityType, error.message);
        return [];
    }
    const rows = (data ?? []) as PublicBookingDefRow[];
    if (entityType !== "location") return rows;
    return rows.filter((r) => !NATIVE_LOCATION_PUBLIC_FIELD_KEYS.has(r.field_key));
}
