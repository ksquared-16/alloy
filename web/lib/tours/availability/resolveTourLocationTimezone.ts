import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

/**
 * Resolve IANA timezone for tour booking at a location from active availability rules.
 * Prefers location-specific rules, then org-wide (null location_id) rules.
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
        .order("created_at", { ascending: true });

    if (error) {
        throw new Error(`resolveTourLocationTimezone: ${error.message}`);
    }

    const rows = (data ?? []) as { location_id?: string | null; timezone?: string | null }[];
    let orgWide: string | null = null;
    for (const row of rows) {
        const tz = String(row.timezone ?? "").trim();
        if (!tz || !isValidIanaTimeZone(tz)) continue;
        const rowLoc = row.location_id != null ? String(row.location_id).trim() : "";
        if (rowLoc === lid) return tz;
        if (!rowLoc && !orgWide) orgWide = tz;
    }
    return orgWide ?? UTC_FALLBACK_IANA;
}
