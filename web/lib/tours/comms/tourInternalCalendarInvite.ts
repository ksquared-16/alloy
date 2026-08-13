/**
 * Internal Tour calendar invite / ICS artifact for configured staff recipients.
 *
 * Provider-independent ICS (METHOD:REQUEST / CANCEL). Delivered as an email
 * attachment to configured internal users — not parent, and not external OAuth.
 * Recipients come from TourCommsConfig.internal_recipients (not a Tour Host model).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { readIcsSequence, withIcsSequence } from "@/lib/tours/bookings/tourBookingAttendance";
import { resolveTourStaffProfiles } from "@/lib/tours/bookings/tourStaffProfiles";
import {
    buildTourBookingIcs,
    tourBookingStatusKeyToIcsStatus,
    type TourBookingIcsMethod,
} from "@/lib/tours/comms/tourBookingIcs";
import type { TourCommsConfig } from "@/lib/tours/comms/tourCommsConfig";
import { loadTourCommsContext } from "@/lib/tours/comms/loadTourCommsContext";

export type TourInternalCalendarAction = "request" | "update" | "cancel";

export type TourInternalCalendarInviteResult = {
    ok: boolean;
    skippedReason?: string;
    icsSequence?: number;
    recipientEmails?: string[];
    communicationMessageIds?: string[];
};

function buildInternalSummary(ctx: {
    opportunityName?: string | null;
    locationName?: string | null;
}): string {
    const family = String(ctx.opportunityName ?? "").trim() || "Family";
    return `${family} — Tour`;
}

function buildInternalDescription(ctx: {
    parentName?: string | null;
    childName?: string | null;
    locationName?: string | null;
    locationAddress?: string | null;
    alloyDeepLink?: string | null;
}): string {
    const lines: string[] = [];
    const parent = String(ctx.parentName ?? "").trim();
    if (parent) lines.push(`Primary contact: ${parent}`);
    const children = String(ctx.childName ?? "").trim();
    if (children) lines.push(`Children: ${children}`);
    const loc = [ctx.locationName, ctx.locationAddress].map((s) => String(s ?? "").trim()).filter(Boolean);
    if (loc.length) lines.push(loc.join("\n"));
    const link = String(ctx.alloyDeepLink ?? "").trim();
    if (link) lines.push(`Open in Alloy: ${link}`);
    return lines.join("\n\n");
}

export async function sendTourInternalCalendarInvite(params: {
    supabase: SupabaseClient;
    orgId: string;
    booking: TourBookingRow;
    config: TourCommsConfig;
    action: TourInternalCalendarAction;
    actorUserId?: string | null;
    alloyDeepLink?: string | null;
}): Promise<TourInternalCalendarInviteResult> {
    if (!params.config.internal_recipients.enabled) {
        return { ok: true, skippedReason: "internal_recipients_disabled" };
    }

    const userIds = params.config.internal_recipients.user_ids
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
    if (userIds.length === 0) {
        return { ok: true, skippedReason: "no_internal_recipients" };
    }

    const staff = await resolveTourStaffProfiles(params.supabase, userIds);
    const emails = staff.map((s) => s.email).filter((e): e is string => Boolean(e?.trim()));
    if (emails.length === 0) {
        return { ok: true, skippedReason: "recipients_missing_email" };
    }

    const loaded = await loadTourCommsContext({
        supabase: params.supabase,
        orgId: params.orgId,
        bookingId: params.booking.id,
        booking: params.booking,
    });
    if (!loaded) {
        return { ok: false, skippedReason: "context_load_failed" };
    }

    const sequence = readIcsSequence(params.booking.metadata);
    const method: TourBookingIcsMethod = params.action === "cancel" ? "CANCEL" : "REQUEST";
    const status =
        params.action === "cancel" ? "cancelled" : tourBookingStatusKeyToIcsStatus(params.booking.status_key);

    const summary = buildInternalSummary({
        opportunityName: loaded.templateContext.opportunityName,
        locationName: loaded.templateContext.locationName,
    });
    const description = buildInternalDescription({
        parentName: loaded.templateContext.parentName,
        childName: loaded.templateContext.childName,
        locationName: loaded.templateContext.locationName,
        locationAddress: loaded.templateContext.locationAddress,
        alloyDeepLink: params.alloyDeepLink,
    });

    const ics = buildTourBookingIcs({
        bookingId: params.booking.id,
        orgId: params.orgId,
        opportunityId: params.booking.opportunity_id,
        locationId: params.booking.location_id,
        startAtIso: params.booking.start_at,
        endAtIso: params.booking.end_at,
        timezone: params.booking.timezone,
        summary,
        description,
        locationLabel: [loaded.templateContext.locationName, loaded.templateContext.locationAddress]
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
            .join(", "),
        organizerName: loaded.orgName,
        organizerEmail: emails[0],
        attendeeEmails: emails,
        status,
        sequence,
        method,
    });

    const icsBase64 = Buffer.from(ics, "utf8").toString("base64");
    const subjectPrefix =
        params.action === "cancel" ? "Canceled:" : params.action === "update" ? "Updated:" : "";
    const subject = `${subjectPrefix} ${summary}`.replace(/\s+/g, " ").trim();
    const bodyText = [
        summary,
        "",
        description,
        "",
        "A calendar invite (.ics) is attached. Open it to add or update this Tour on your calendar.",
    ].join("\n");

    const messageIds: string[] = [];
    for (const to of emails) {
        const enqueued = await enqueueCanonicalOutboundMessage({
            supabase: params.supabase,
            orgId: params.orgId,
            primaryEntityType: "opportunities",
            primaryEntityId: params.booking.opportunity_id,
            channelRaw: "email",
            toRaw: to,
            bodyRaw: bodyText,
            emailSubjectRaw: subject,
            audience: "internal",
            category: "transactional",
            callSite: "tourInternalCalendarInvite",
            authorizedByUserId: params.actorUserId ?? null,
            metadata: {
                source: "tour_scheduling",
                tour_booking_id: params.booking.id,
                tour_event_key: "tour_internal_calendar",
                internal_calendar_action: params.action,
                ics_sequence: sequence,
                calendar_invite: {
                    filename: "tour.ics",
                    content_type: "text/calendar; method=" + method,
                    content_base64: icsBase64,
                },
            },
        });
        if (enqueued.communicationMessageId) {
            messageIds.push(enqueued.communicationMessageId);
        }
    }

    if (messageIds.length > 0) {
        await triggerBackendMessagesQueue({ limit: 25 });
    }

    if (params.action !== "cancel") {
        const nextMeta = withIcsSequence(params.booking.metadata, sequence);
        await params.supabase
            .from("tour_bookings")
            .update({ metadata: nextMeta })
            .eq("org_id", params.orgId)
            .eq("id", params.booking.id);
    }

    return {
        ok: true,
        icsSequence: sequence,
        recipientEmails: emails,
        communicationMessageIds: messageIds,
        skippedReason: messageIds.length === 0 ? "enqueue_failed" : undefined,
    };
}

/** After a successful reschedule, send REQUEST update (SEQUENCE already bumped on booking). */
export async function sendTourInternalCalendarInviteForReschedule(params: {
    supabase: SupabaseClient;
    orgId: string;
    booking: TourBookingRow;
    config: TourCommsConfig;
    actorUserId?: string | null;
    alloyDeepLink?: string | null;
}): Promise<TourInternalCalendarInviteResult> {
    return sendTourInternalCalendarInvite({ ...params, action: "update" });
}
