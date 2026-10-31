/**
 * PUBLIC TOUR CALENDAR — server resolution and the one slot source (S7).
 *
 * Every public read and write in the two-step journey resolves through
 * `resolvePublicTourCalendar`: token → link → org + location, never a request body. Slots
 * come only from `computeAvailableTourSlots` — the slot authority the operator picker,
 * invitations and every booking writer already share — so weekly schedules, multiple
 * windows, closures, modified hours (S5/S6) and current bookings all apply. There is no
 * marketing calendar engine.
 *
 * What reaches a browser is deliberately thin: a time interval and its timezone. Rule ids,
 * capacity, other bookings and any family data stay on the server.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePublicFormLinkByToken } from "@/lib/public/forms/resolvePublicFormLink";
import { isEmbedOriginAllowed } from "@/lib/public/forms/embedOrigin";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import { publicFormLinkLocationId } from "@/lib/branding/loadPublicBrand";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import { resolveTourLocationTimezone } from "@/lib/tours/availability/resolveTourLocationTimezone";
import { isTourStartAllowed } from "@/lib/tours/bookings/tourEarliestDate";
import { assertTourIntervalOperating } from "@/lib/operatingCalendar/operatingCalendarServer";
import { readTourCalendarLinkConfig } from "./tourCalendarLinkConfig";
import type { RequestedTourRescheduleReason } from "./requestedTour";

export type PublicTourCalendarContext = {
    linkId: string;
    orgId: string;
    locationId: string;
    locationLabel: string;
    locationAddress: string | null;
    /** The zone the location's tour schedule is authored in — the zone every time is shown in. */
    timezone: string;
    formDefinitionId: string;
    linkMetadata: Record<string, unknown>;
};

export type PublicTourCalendarFailureCode =
    | "NOT_FOUND"
    | "INACTIVE"
    | "EXPIRED"
    | "NO_PUBLISHED_VERSION"
    | "ORIGIN_FORBIDDEN"
    | "NOT_PUBLISHED"
    | "LOCATION_UNAVAILABLE";

/**
 * Public status per failure. A link that exists but does not publish a calendar answers
 * exactly like an unknown token — a probe learns nothing about which tokens are real.
 */
export const PUBLIC_TOUR_CALENDAR_FAILURE_STATUS: Record<PublicTourCalendarFailureCode, number> = {
    NOT_FOUND: 404,
    NOT_PUBLISHED: 404,
    LOCATION_UNAVAILABLE: 404,
    INACTIVE: 410,
    EXPIRED: 410,
    NO_PUBLISHED_VERSION: 404,
    ORIGIN_FORBIDDEN: 403,
};

/** The only sentence a family reads for any of the above. */
export const PUBLIC_TOUR_CALENDAR_UNAVAILABLE_MESSAGE = "This tour calendar isn't available right now.";

export type PublicTourCalendarResolution =
    | { ok: true; value: PublicTourCalendarContext }
    | { ok: false; code: PublicTourCalendarFailureCode };

function addressLine(row: Record<string, unknown>): string | null {
    const parts = [row.address1, row.city, row.state, row.postal_code]
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
}

export async function resolvePublicTourCalendar(
    supabase: SupabaseClient,
    plaintextToken: string,
    opts: { embedOrigin: string | null }
): Promise<PublicTourCalendarResolution> {
    if (!plaintextToken.trim()) return { ok: false, code: "NOT_FOUND" };
    const link = await resolvePublicFormLinkByToken(supabase, plaintextToken);
    if (!link.ok) return { ok: false, code: link.error.code };
    const v = link.value;

    if (!isEmbedOriginAllowed(opts.embedOrigin, v.allowedEmbedOrigins)) return { ok: false, code: "ORIGIN_FORBIDDEN" };

    // Published only by the explicit, tours-authorized flag on a location-scoped intake link.
    if (!readTourCalendarLinkConfig(v.linkMetadata).enabled) return { ok: false, code: "NOT_PUBLISHED" };
    const mode = typeof v.linkMetadata.form_context_mode === "string" ? v.linkMetadata.form_context_mode : "";
    if (mode === "packet" || mode === "existing_record") return { ok: false, code: "NOT_PUBLISHED" };
    // A tour request is only safe where acceptance exists: the link must open a Processing case.
    if (!linkRequiresLeadCapture(v.linkMetadata)) return { ok: false, code: "NOT_PUBLISHED" };
    const locationId = publicFormLinkLocationId(v.linkMetadata);
    if (!locationId) return { ok: false, code: "NOT_PUBLISHED" };

    const { data: loc, error: locErr } = await supabase
        .from("locations")
        .select("id, org_id, label, is_active, archived_at, address1, city, state, postal_code")
        .eq("org_id", v.orgId)
        .eq("id", locationId)
        .maybeSingle();
    if (locErr || !loc) return { ok: false, code: "LOCATION_UNAVAILABLE" };
    const l = loc as Record<string, unknown>;
    if (l.is_active === false || l.archived_at) return { ok: false, code: "LOCATION_UNAVAILABLE" };

    // A location with no active tour schedule OF ITS OWN has nothing to publish (legacy
    // organization-wide rules no longer offer new times — see computeAvailableTourSlots).
    const { count, error: ruleErr } = await supabase
        .from("tour_availability_rules")
        .select("id", { count: "exact", head: true })
        .eq("org_id", v.orgId)
        .eq("is_active", true)
        .eq("location_id", locationId);
    if (ruleErr || !count) return { ok: false, code: "LOCATION_UNAVAILABLE" };

    const timezone = await resolveTourLocationTimezone(supabase, v.orgId, locationId);

    return {
        ok: true,
        value: {
            linkId: v.linkId,
            orgId: v.orgId,
            locationId,
            locationLabel: typeof l.label === "string" && l.label.trim() ? l.label.trim() : "Our school",
            locationAddress: addressLine(l),
            timezone,
            formDefinitionId: v.formDefinitionId,
            linkMetadata: v.linkMetadata,
        },
    };
}

/** What a browser may see of one available time. */
export type PublicTourSlot = { start_at: string; end_at: string; timezone: string };

export function toPublicTourSlot(s: AvailableTourSlot): PublicTourSlot {
    return { start_at: new Date(s.startAt).toISOString(), end_at: new Date(s.endAt).toISOString(), timezone: s.timezone };
}

/** Bookable times in a window: the canonical slot set, from tomorrow onward in site-local time. */
export async function listPublicTourSlots(
    supabase: SupabaseClient,
    ctx: Pick<PublicTourCalendarContext, "orgId" | "locationId">,
    window: { from: Date; to: Date },
    now: Date = new Date()
): Promise<PublicTourSlot[]> {
    const slots = await computeAvailableTourSlots(supabase, {
        orgId: ctx.orgId,
        locationId: ctx.locationId,
        userId: null,
        from: window.from,
        to: window.to,
    });
    const seen = new Set<string>();
    const out: PublicTourSlot[] = [];
    for (const s of slots) {
        if (s.remainingCapacity <= 0) continue;
        if (!isTourStartAllowed(new Date(s.startAt), s.timezone, now)) continue;
        const p = toPublicTourSlot(s);
        const k = `${p.start_at}|${p.end_at}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(p);
    }
    return out.sort((a, b) => a.start_at.localeCompare(b.start_at));
}

/**
 * Is exactly this interval offered right now? The canonical slot set over a ±60 s window,
 * matched on both instants — the same live revalidation the invitation book route uses.
 */
export async function findOfferedTourSlot(
    supabase: SupabaseClient,
    params: { orgId: string; locationId: string; startAt: Date; endAt: Date; excludeBookingId?: string | null; now?: Date }
): Promise<AvailableTourSlot | null> {
    const live = await computeAvailableTourSlots(supabase, {
        orgId: params.orgId,
        locationId: params.locationId,
        userId: null,
        from: new Date(params.startAt.getTime() - 60_000),
        to: new Date(params.endAt.getTime() + 60_000),
        excludeBookingId: params.excludeBookingId ?? null,
    });
    const match = live.find(
        (s) =>
            new Date(s.startAt).getTime() === params.startAt.getTime() &&
            new Date(s.endAt).getTime() === params.endAt.getTime() &&
            s.remainingCapacity > 0
    );
    if (!match) return null;
    if (!isTourStartAllowed(params.startAt, match.timezone, params.now ?? new Date())) return null;
    return match;
}

/**
 * WHY a time is not offered — for the operator, never the family. Order matters: a past or
 * same-day time is "too soon" whatever else is true; a time the calendar closes is a
 * closure; anything else (capacity, a changed schedule) is plain unavailability.
 */
export async function classifyUnofferedTourTime(
    supabase: SupabaseClient,
    params: { orgId: string; locationId: string; startAt: Date; endAt: Date; timezone: string; now?: Date }
): Promise<Extract<RequestedTourRescheduleReason, "slot_unavailable" | "calendar_closed" | "too_soon">> {
    if (!isTourStartAllowed(params.startAt, params.timezone, params.now ?? new Date())) return "too_soon";
    try {
        await assertTourIntervalOperating(supabase, {
            orgId: params.orgId,
            locationId: params.locationId,
            startAt: params.startAt,
            endAt: params.endAt,
            timezone: params.timezone,
        });
    } catch {
        return "calendar_closed";
    }
    return "slot_unavailable";
}
