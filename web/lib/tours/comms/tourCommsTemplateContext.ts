import { formatInTimeZone } from "date-fns-tz";
import { formatTourCommsTimezoneLabel } from "@/lib/tours/comms/formatTourCommsTimezoneLabel";

import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";
import { deriveTourMetadataMirrorFromBooking } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";

/**
 * Merge-field source for tour comms templates (Batch 2).
 * Assembled from canonical records in later batches — not from queue rows.
 */
export type TourCommsTemplateContext = {
    orgName?: string | null;
    locationName?: string | null;
    locationAddress?: string | null;
    /** ISO instant — scheduling SoT wall time derives from this + timezone. */
    tourStartAt?: string | null;
    tourEndAt?: string | null;
    timezone?: string | null;
    parentName?: string | null;
    childName?: string | null;
    opportunityName?: string | null;
    hostName?: string | null;
    hostEmail?: string | null;
    rescheduleUrl?: string | null;
    cancelUrl?: string | null;
    addToCalendarUrl?: string | null;
    googleCalendarUrl?: string | null;
    outlookCalendarUrl?: string | null;
    publicBookingUrl?: string | null;
    ctaText?: string | null;
    ctaUrl?: string | null;
    /** Pre-rendered list of offered tour times, one line per option, each with its own secure link. */
    tourOptionsBlock?: string | null;
    /** No-login fallback URL for the invitation as a whole. */
    invitationActionUrl?: string | null;
    /** Single-use decline link. */
    declineUrl?: string | null;
    /** Attendance affirmation ("Confirm I'm coming") — reminder CTA. */
    confirmAttendanceUrl?: string | null;
    /**
     * Optional SMS fragment when ask_parent_confirm_attendance is ON.
     * Empty when confirmation is disabled (informational reminder only).
     */
    confirmReplyInstruction?: string | null;
    /** Pre-formatted labels (optional); computed via {@link formatTourCommsDateTimeLabels} when omitted. */
    tourDateLabel?: string | null;
    tourTimeLabel?: string | null;
    tourDisplayLabel?: string | null;
};

export type TourCommsFormattedDateTimeLabels = {
    tourDateLabel: string;
    tourTimeLabel: string;
    tourDisplayLabel: string;
};

function resolveIana(timezone: string | null | undefined): string {
    const t = String(timezone ?? "").trim();
    return t && isValidIanaTimeZone(t) ? t : UTC_FALLBACK_IANA;
}

function firstName(raw: string | null | undefined): string {
    const t = String(raw ?? "").trim();
    if (!t) return "there";
    return t.split(/\s+/)[0] || "there";
}

/**
 * Derive parent-facing date/time labels from booking instant + IANA timezone.
 */
export function formatTourCommsDateTimeLabels(input: {
    tourStartAt: string | null | undefined;
    timezone: string | null | undefined;
}): TourCommsFormattedDateTimeLabels {
    const start = String(input.tourStartAt ?? "").trim();
    const tz = resolveIana(input.timezone);
    if (!start) {
        return { tourDateLabel: "", tourTimeLabel: "", tourDisplayLabel: "" };
    }
    try {
        // Format the INSTANT directly in the tour's timezone.
        //
        // This used to derive a wall-clock mirror (`2026-08-05` + `11:00`) and hand it
        // back to `formatTourDateTime`, which packs those fields with `Date.UTC` and
        // re-interprets them — correct only when the SERVER process runs in UTC. On a
        // Pacific host an 11:00 AM Pacific tour rendered as "4:00 AM" in the parent's
        // confirmation: the local wall time was converted a second time.
        //
        // The instant and the zone are both already here, so no round trip is needed
        // and no server-local state can influence the result.
        const at = new Date(start);
        if (Number.isNaN(at.getTime())) {
            return { tourDateLabel: "", tourTimeLabel: "", tourDisplayLabel: "" };
        }
        const tourDateLabel = formatInTimeZone(at, tz, "MM/dd/yyyy");
        const tourTimeLabel = formatInTimeZone(at, tz, "h:mm a");
        return {
            tourDateLabel,
            tourTimeLabel,
            tourDisplayLabel: `${tourDateLabel}, ${tourTimeLabel}`,
        };
    } catch {
        return { tourDateLabel: "", tourTimeLabel: "", tourDisplayLabel: "" };
    }
}

/** Flatten context to snake_case merge map for `{{placeholder}}` substitution. */
export function buildTourCommsMergeFields(ctx: TourCommsTemplateContext): Record<string, string> {
    const dt =
        ctx.tourDateLabel != null && ctx.tourDisplayLabel != null
            ? {
                  tourDateLabel: String(ctx.tourDateLabel ?? "").trim(),
                  tourTimeLabel: String(ctx.tourTimeLabel ?? "").trim(),
                  tourDisplayLabel: String(ctx.tourDisplayLabel ?? "").trim(),
              }
            : formatTourCommsDateTimeLabels({ tourStartAt: ctx.tourStartAt, timezone: ctx.timezone });

    const tz = resolveIana(ctx.timezone);
    const timezoneFriendly = formatTourCommsTimezoneLabel(tz);
    const parent = firstName(ctx.parentName);
    const locationName = String(ctx.locationName ?? "").trim();
    const locationAddress = String(ctx.locationAddress ?? "").trim();
    const siteLine = [locationName, locationAddress].filter(Boolean).join(" — ");

    return {
        org_name: String(ctx.orgName ?? "").trim(),
        organization_name: String(ctx.orgName ?? "").trim(),
        location_name: locationName,
        location_address: locationAddress,
        site_line: siteLine,
        tour_start_at: String(ctx.tourStartAt ?? "").trim(),
        tour_end_at: String(ctx.tourEndAt ?? "").trim(),
        timezone: tz,
        timezone_friendly_label: timezoneFriendly,
        tour_date_label: dt.tourDateLabel,
        tour_time_label: dt.tourTimeLabel,
        tour_display_label: dt.tourDisplayLabel,
        parent_name: parent,
        child_name: String(ctx.childName ?? "").trim(),
        opportunity_name: String(ctx.opportunityName ?? "").trim(),
        host_name: String(ctx.hostName ?? "").trim(),
        host_email: String(ctx.hostEmail ?? "").trim(),
        reschedule_url: String(ctx.rescheduleUrl ?? "").trim(),
        cancel_url: String(ctx.cancelUrl ?? "").trim(),
        add_to_calendar_url: String(ctx.addToCalendarUrl ?? "").trim(),
        google_calendar_url: String(ctx.googleCalendarUrl ?? "").trim(),
        outlook_calendar_url: String(ctx.outlookCalendarUrl ?? "").trim(),
        public_booking_url: String(ctx.publicBookingUrl ?? "").trim(),
        cta_text: String(ctx.ctaText ?? "").trim(),
        cta_url: String(ctx.ctaUrl ?? "").trim(),
        // Invitation-only tokens. Empty for every post-booking event key, which is why
        // the invitation templates are the only ones that reference them.
        tour_options_block: String(ctx.tourOptionsBlock ?? "").trim(),
        invitation_action_url: String(ctx.invitationActionUrl ?? "").trim(),
        decline_url: String(ctx.declineUrl ?? "").trim(),
        confirm_attendance_url: String(ctx.confirmAttendanceUrl ?? "").trim(),
        confirm_reply_instruction: String(ctx.confirmReplyInstruction ?? "").trim(),
    };
}
