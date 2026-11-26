/**
 * TOUR CALENDAR READINESS — is a published tour calendar actually bookable? (Tours review 2026-11-02)
 *
 * "Published" is configuration: the link carries `tour_calendar_v1.enabled`. Whether a family who opens
 * the link can book is a different question, and the admin screen used to answer the first one as if
 * it were the second ("Tour calendar is live" next to "no active schedule"). This measures the second
 * with the PUBLIC page's own resolver (`resolvePublicTourCalendar`), so the admin answer cannot drift
 * from what `/tours/<token>` serves: an active link, a published form version, a lead-capture link, an
 * active location, and at least one active schedule of the location's own.
 *
 * A link that names allowed websites is also measured as a visit from one of them (so every other check
 * still runs), and reported as reachable only from those sites: a direct visit — typing the address, or
 * opening it from this screen — is refused by the embed-origin rule, which is unchanged here.
 *
 * Read-only. No booking, no slot hold, no write.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmbedAllowlistEntry } from "@/lib/public/forms/embedOrigin";
import { resolvePublicTourCalendar } from "./publicTourCalendarServer";
import type { TourCalendarReadiness, TourCalendarShareLink } from "./tourCalendarShare";

/** `/tours/<token>` → `<token>`. */
function tokenFromCalendarPath(path: string | null): string | null {
    const m = typeof path === "string" ? /^\/tours\/([^/?#]+)$/.exec(path.trim()) : null;
    if (!m) return null;
    try {
        return decodeURIComponent(m[1]!);
    } catch {
        return m[1]!;
    }
}

export async function measureTourCalendarReadiness(
    supabase: SupabaseClient,
    params: { orgId: string; locationId: string; link: TourCalendarShareLink }
): Promise<TourCalendarReadiness> {
    const { link } = params;
    const restrictedTo = link.allowedEmbedOrigins.map(normalizeEmbedAllowlistEntry).filter(Boolean);
    const token = tokenFromCalendarPath(link.calendarPath);
    if (!token) return { state: "not_bookable", code: "NOT_FOUND", restrictedToOrigins: restrictedTo };

    const resolved = await resolvePublicTourCalendar(supabase, token, { embedOrigin: restrictedTo[0] ?? null });
    if (resolved.ok) {
        return restrictedTo.length
            ? { state: "restricted", code: null, restrictedToOrigins: restrictedTo }
            : { state: "bookable", code: null, restrictedToOrigins: [] };
    }
    if (resolved.code === "LOCATION_UNAVAILABLE") {
        // The resolver folds two causes into one public answer; the school needs to know which.
        const { count } = await supabase
            .from("tour_availability_rules")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .eq("location_id", params.locationId)
            .eq("is_active", true);
        if (!count) return { state: "not_bookable", code: "NO_ACTIVE_SCHEDULE", restrictedToOrigins: restrictedTo };
    }
    return { state: "not_bookable", code: resolved.code, restrictedToOrigins: restrictedTo };
}
