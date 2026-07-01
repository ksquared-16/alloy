import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_DURATION_MINUTES = 60;

/**
 * Default slot duration for manual admin bookings — first active rule for location, else org-wide rule.
 */
export async function resolveTourLocationSlotDurationMinutes(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string
): Promise<number> {
    const oid = String(orgId ?? "").trim();
    const lid = String(locationId ?? "").trim();
    if (!oid || !lid) return DEFAULT_DURATION_MINUTES;

    const { data, error } = await supabase
        .from("tour_availability_rules")
        .select("location_id, slot_duration_minutes, created_at")
        .eq("org_id", oid)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

    if (error) {
        throw new Error(`resolveTourLocationSlotDurationMinutes: ${error.message}`);
    }

    const rows = (data ?? []) as { location_id?: string | null; slot_duration_minutes?: number | null }[];
    let orgWide: number | null = null;
    for (const row of rows) {
        const mins = Number(row.slot_duration_minutes);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        const rowLoc = row.location_id != null ? String(row.location_id).trim() : "";
        if (rowLoc === lid) return Math.floor(mins);
        if (!rowLoc && orgWide == null) orgWide = Math.floor(mins);
    }
    return orgWide ?? DEFAULT_DURATION_MINUTES;
}
