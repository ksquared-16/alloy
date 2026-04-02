import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicBookingDefRow = { id: string; field_key: string; field_type: string };

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
        .eq("is_system", false)
        .eq("is_visible_in_public_booking", true);
    if (error) {
        console.error("[PUBLIC_BOOKING_DEFS]", entityType, error.message);
        return [];
    }
    return (data ?? []) as PublicBookingDefRow[];
}
