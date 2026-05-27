import { getPublicAppOrigin } from "@/lib/publicAppUrl";

import type { TourCommsTemplateContext } from "@/lib/tours/comms/tourCommsTemplateContext";
import { formatIcsUtcDateTime } from "@/lib/tours/comms/tourBookingIcs";

export type TourAddToCalendarEventInput = {
    summary: string;
    description?: string | null;
    locationLabel?: string | null;
    startAtIso: string;
    endAtIso: string;
    timezone?: string | null;
};

export type TourIcsDownloadPathInput = {
    bookingId: string;
    /** When set, uses public token-scoped ICS path (route: Batch 4+). */
    publicAccessToken?: string | null;
};

export type TourAddToCalendarLinks = {
    /** Absolute or path-only ICS download URL. */
    icsDownloadUrl: string;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
};

/**
 * Relative ICS download path (API route implemented in a later batch).
 * - Admin: `/api/admin/tours/bookings/:bookingId/ics`
 * - Public token: `/api/public/tour-booking/:token/ics`
 */
export function buildTourIcsDownloadPath(input: TourIcsDownloadPathInput): string {
    const token = String(input.publicAccessToken ?? "").trim();
    const bookingId = String(input.bookingId ?? "").trim();
    if (token) {
        return `/api/public/tour-booking/${encodeURIComponent(token)}/ics`;
    }
    if (!bookingId) {
        throw new RangeError("buildTourIcsDownloadPath: bookingId or publicAccessToken required");
    }
    return `/api/admin/tours/bookings/${encodeURIComponent(bookingId)}/ics`;
}

/** Resolve path to absolute URL when {@link getPublicAppOrigin} is configured. */
export function resolveTourCalendarAbsoluteUrl(pathOrUrl: string): string {
    const raw = String(pathOrUrl ?? "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    const origin = getPublicAppOrigin();
    if (!origin) return raw;
    return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function encodeQuery(params: Record<string, string>): string {
    return Object.entries(params)
        .filter(([, v]) => v.trim() !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
}

function googleDatesParam(startAtIso: string, endAtIso: string): string {
    return `${formatIcsUtcDateTime(startAtIso)}/${formatIcsUtcDateTime(endAtIso)}`;
}

/** Google Calendar “create event” deeplink (UTC instants). */
export function buildGoogleCalendarUrl(input: TourAddToCalendarEventInput): string {
    const params: Record<string, string> = {
        action: "TEMPLATE",
        text: String(input.summary ?? "").trim(),
        dates: googleDatesParam(input.startAtIso, input.endAtIso),
    };
    const details = String(input.description ?? "").trim();
    if (details) params.details = details;
    const loc = String(input.locationLabel ?? "").trim();
    if (loc) params.location = loc;
    return `https://calendar.google.com/calendar/render?${encodeQuery(params)}`;
}

/** Outlook on the web compose deeplink (ISO8601 UTC). */
export function buildOutlookCalendarUrl(input: TourAddToCalendarEventInput): string {
    const start = new Date(input.startAtIso);
    const end = new Date(input.endAtIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new RangeError("buildOutlookCalendarUrl: invalid start/end");
    }
    const params: Record<string, string> = {
        path: "/calendar/action/compose",
        rru: "addevent",
        subject: String(input.summary ?? "").trim(),
        startdt: start.toISOString(),
        enddt: end.toISOString(),
    };
    const body = String(input.description ?? "").trim();
    if (body) params.body = body;
    const loc = String(input.locationLabel ?? "").trim();
    if (loc) params.location = loc;
    return `https://outlook.office.com/calendar/0/deeplink/compose?${encodeQuery(params)}`;
}

export function buildTourIcsDownloadUrl(input: TourIcsDownloadPathInput & { origin?: string | null }): string {
    const path = buildTourIcsDownloadPath(input);
    const origin = String(input.origin ?? "").trim() || getPublicAppOrigin();
    if (!origin) return path;
    return resolveTourCalendarAbsoluteUrl(path);
}

/** Build Google, Outlook, and ICS download links for a tour event. */
export function buildTourAddToCalendarLinks(input: {
    event: TourAddToCalendarEventInput;
    bookingId: string;
    publicAccessToken?: string | null;
    origin?: string | null;
}): TourAddToCalendarLinks {
    return {
        googleCalendarUrl: buildGoogleCalendarUrl(input.event),
        outlookCalendarUrl: buildOutlookCalendarUrl(input.event),
        icsDownloadUrl: buildTourIcsDownloadUrl({
            bookingId: input.bookingId,
            publicAccessToken: input.publicAccessToken,
            origin: input.origin,
        }),
    };
}

/**
 * Inject add-to-calendar URLs into template context (Batch 5 orchestrator).
 * Sets `addToCalendarUrl` to the ICS download URL by default.
 */
export function withTourAddToCalendarLinks(
    context: TourCommsTemplateContext,
    links: TourAddToCalendarLinks
): TourCommsTemplateContext {
    return {
        ...context,
        addToCalendarUrl: links.icsDownloadUrl || context.addToCalendarUrl,
        googleCalendarUrl: links.googleCalendarUrl,
        outlookCalendarUrl: links.outlookCalendarUrl,
    };
}

/** Convenience: event fields from comms template context. */
export function tourAddToCalendarEventFromContext(ctx: TourCommsTemplateContext, summary: string): TourAddToCalendarEventInput {
    const start = String(ctx.tourStartAt ?? "").trim();
    const end = String(ctx.tourEndAt ?? "").trim();
    if (!start || !end) {
        throw new RangeError("tourAddToCalendarEventFromContext: tourStartAt and tourEndAt required");
    }
    const siteLine = [ctx.locationName, ctx.locationAddress].filter(Boolean).join(" — ");
    return {
        summary,
        description: ctx.opportunityName ? `Tour for ${ctx.opportunityName}` : undefined,
        locationLabel: siteLine || ctx.locationName || undefined,
        startAtIso: start,
        endAtIso: end,
        timezone: ctx.timezone,
    };
}

export function buildTourAddToCalendarLinksFromContext(
    context: TourCommsTemplateContext,
    input: { bookingId: string; summary: string; publicAccessToken?: string | null; origin?: string | null }
): TourAddToCalendarLinks {
    const event = tourAddToCalendarEventFromContext(context, input.summary);
    return buildTourAddToCalendarLinks({
        event,
        bookingId: input.bookingId,
        publicAccessToken: input.publicAccessToken,
        origin: input.origin,
    });
}
