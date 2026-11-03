import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import { resolveLocationTimezone } from "@/lib/location/timezoneResolution";

/**
 * Resolve IANA timezone for tour booking at a location: the zone the location's own active
 * availability rules use, else the location's configured zone (location → organization,
 * `resolveLocationTimezone`), else UTC. Legacy organization-wide rules are not consulted.
 */
export async function resolveTourLocationTimezone(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string
): Promise<string> {
    const oid = String(orgId ?? "").trim();
    const lid = String(locationId ?? "").trim();
    if (!oid || !lid) return UTC_FALLBACK_IANA;

    const { data, error } = await supabase
        .from("tour_availability_rules")
        .select("location_id, timezone, created_at")
        .eq("org_id", oid)
        .eq("is_active", true)
        .eq("location_id", lid)
        .order("created_at", { ascending: true });

    if (error) {
        throw new Error(`resolveTourLocationTimezone: ${error.message}`);
    }

    const rows = (data ?? []) as { location_id?: string | null; timezone?: string | null }[];
    for (const row of rows) {
        const tz = String(row.timezone ?? "").trim();
        if (!tz || !isValidIanaTimeZone(tz)) continue;
        const rowLoc = row.location_id != null ? String(row.location_id).trim() : "";
        if (rowLoc === lid) return tz;
    }
    const configured = await resolveLocationTimezone(supabase, oid, lid);
    if (configured.status === "resolved" && configured.timezone && isValidIanaTimeZone(configured.timezone)) return configured.timezone;
    return UTC_FALLBACK_IANA;
}
