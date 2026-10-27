import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOperationalTimezoneForOrg, isValidIanaTimeZone } from "@/lib/admin/timezoneContract";
import { resolveLocationTimezone } from "@/lib/location/timezoneResolution";
import { resolveTourLocationTimezone } from "@/lib/tours/availability/resolveTourLocationTimezone";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The scope an authoring request names: a location id, or organization-wide.
 * `null` location (or the literal `org`) = organization scope. Anything else malformed is refused.
 */
export function readTourScheduleScopeLocation(raw: unknown): { ok: true; locationId: string | null } | { ok: false } {
    if (raw === undefined || raw === null || raw === "" || raw === "org") return { ok: true, locationId: null };
    if (typeof raw === "string" && UUID_RE.test(raw.trim())) return { ok: true, locationId: raw.trim() };
    return { ok: false };
}

export type TourScheduleTimezoneDefault = {
    timezone: string | null;
    source: "location" | "organization" | "existing_tour_rules" | "unresolved";
};

/**
 * The zone a NEW schedule should default to: the location's authoritative zone (location → org,
 * `resolveLocationTimezone`), else the zone existing tour rules already use, else unresolved — the
 * editor then asks. Never the browser's zone, and never a silent UTC.
 */
export async function resolveTourScheduleDefaultTimezone(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string | null
): Promise<TourScheduleTimezoneDefault> {
    if (locationId) {
        const r = await resolveLocationTimezone(supabase, orgId, locationId);
        if (r.status === "resolved" && r.timezone) {
            return { timezone: r.timezone, source: r.source === "location_metadata" ? "location" : "organization" };
        }
        const fromRules = await resolveTourLocationTimezone(supabase, orgId, locationId);
        if (fromRules && fromRules !== "UTC") return { timezone: fromRules, source: "existing_tour_rules" };
        return { timezone: null, source: "unresolved" };
    }
    const org = await fetchOperationalTimezoneForOrg(supabase, orgId);
    if (org.source !== "utc_fallback" && isValidIanaTimeZone(org.iana)) return { timezone: org.iana, source: "organization" };
    return { timezone: null, source: "unresolved" };
}
