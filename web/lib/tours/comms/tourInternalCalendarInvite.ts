/**
 * Internal Tour calendar invite / ICS artifact for configured staff recipients.
 *
 * Provider-independent ICS (METHOD:REQUEST / CANCEL). Delivered as an email
 * attachment to configured staff — not parent, and not external OAuth.
 * Recipients come from TourCommsConfig.internal_recipients (not a Tour Host model); each is resolved and
 * authorized by Communications (member, `tours.book`, site scope over the tour's location, an email) and
 * sent as an external transactional email to a typed staff recipient through the canonical enqueue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { readIcsSequence, withIcsSequence } from "@/lib/tours/bookings/tourBookingAttendance";
import {
    buildTourBookingIcs,
    tourBookingStatusKeyToIcsStatus,
    type TourBookingIcsMethod,
} from "@/lib/tours/comms/tourBookingIcs";
import type { TourCommsConfig } from "@/lib/tours/comms/tourCommsConfig";
import { loadTourCommsContext } from "@/lib/tours/comms/loadTourCommsContext";
import { isTourBookingApprovedForComms } from "@/lib/tours/comms/tourCommsEligibility";
import { resolveAuthorizedStaffRecipient } from "@/lib/communications/recipients/staffRecipient";
import { TOURS_BOOK } from "@/lib/access/toursAuthority";

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

/** Stable per (booking, action, time, recipient): a replayed confirmation queues nothing twice; a reschedule is new. */
export function tourInternalCalendarKey(booking: Pick<TourBookingRow, "id" | "start_at" | "end_at">, action: TourInternalCalendarAction, userId: string): string {
    return `tour_internal_calendar:${booking.id}:${action}:${booking.start_at}:${booking.end_at}:${userId}`;
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
    // Every outcome — sent, duplicate, refused or skipped — is recorded on the booking, so a non-send is
    // auditable where the tour lives, not only in a log line.
    const record = async (result: TourInternalCalendarInviteResult, extra: Record<string, unknown> = {}, sequence?: number) => {
        const { data: fresh } = await params.supabase.from("tour_bookings").select("metadata").eq("org_id", params.orgId).eq("id", params.booking.id).maybeSingle();
        const base = ((fresh as { metadata?: Record<string, unknown> | null } | null)?.metadata ?? params.booking.metadata ?? {}) as Record<string, unknown>;
        const withSeq = sequence != null ? (withIcsSequence(base, sequence) as Record<string, unknown>) : base;
        await params.supabase
            .from("tour_bookings")
            .update({
                metadata: {
                    ...withSeq,
                    internal_calendar_last: {
                        action: params.action,
                        at: new Date().toISOString(),
                        outcome: result.skippedReason ?? "queued",
                        message_ids: result.communicationMessageIds ?? [],
                        ...extra,
                    },
                },
            })
            .eq("org_id", params.orgId)
            .eq("id", params.booking.id);
        return result;
    };

    if (!params.config.internal_recipients.enabled) {
        return record({ ok: true, skippedReason: "internal_recipients_disabled" });
    }
    const userIds = [...new Set(params.config.internal_recipients.user_ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
    if (userIds.length === 0) {
        return record({ ok: true, skippedReason: "no_internal_recipients" });
    }

    // Tours eligibility, from the booking as it is now (the orchestrator decides this too; a direct caller
    // must not be able to skip it): a request/update needs an approved booking; a cancellation is only
    // news to staff who were invited.
    const { data: freshRow } = await params.supabase.from("tour_bookings").select("status_key, start_at, end_at").eq("org_id", params.orgId).eq("id", params.booking.id).maybeSingle();
    const freshStatus = (freshRow as { status_key?: string } | null)?.status_key ?? params.booking.status_key;
    if (params.action !== "cancel" && !isTourBookingApprovedForComms(freshStatus)) {
        return record({ ok: true, skippedReason: `booking_not_approved:${freshStatus}` });
    }
    if (params.action === "cancel") {
        const { data: priorInvites } = await params.supabase
            .from("communication_messages")
            .select("id")
            .eq("org_id", params.orgId)
            .filter("metadata->>tour_booking_id", "eq", params.booking.id)
            .filter("metadata->>tour_event_key", "eq", "tour_internal_calendar")
            .neq("status", "blocked")
            .limit(1);
        if (!(priorInvites ?? []).length) return record({ ok: true, skippedReason: "never_invited" });
    }

    const loaded = await loadTourCommsContext({
        supabase: params.supabase,
        orgId: params.orgId,
        bookingId: params.booking.id,
        booking: params.booking,
    });
    if (!loaded) {
        return record({ ok: false, skippedReason: "context_load_failed" });
    }

    // Who may receive it: Communications' resolver (the enqueue re-verifies each one and owns the address).
    const capability = TOURS_BOOK;
    const resolutions = await Promise.all(
        userIds.map((userId) => resolveAuthorizedStaffRecipient(params.supabase, params.orgId, { userId, locationId: params.booking.location_id, capability }))
    );
    const emails = resolutions.flatMap((r) => (r.ok ? [r.email] : []));

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
        organizerEmail: emails[0] ?? null,
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
    const duplicates: string[] = [];
    const refused: Array<{ user_id: string; reason: string }> = [];
    for (const userId of userIds) {
        const key = tourInternalCalendarKey(params.booking, params.action, userId);
        const { data: existing } = await params.supabase
            .from("communication_messages")
            .select("id")
            .eq("org_id", params.orgId)
            .filter("metadata->>internal_calendar_key", "eq", key)
            .neq("status", "blocked")
            .limit(1);
        if ((existing ?? []).length) {
            duplicates.push(userId);
            continue;
        }
        // A staff notification is an EXTERNAL email (it leaves through a provider) of a TRANSACTIONAL class,
        // to a typed staff recipient the canonical enqueue resolves and authorizes — not an internal-audience
        // note, which may never reach a provider.
        const enqueued = await enqueueCanonicalOutboundMessage({
            supabase: params.supabase,
            orgId: params.orgId,
            primaryEntityType: "opportunities",
            primaryEntityId: params.booking.opportunity_id,
            channelRaw: "email",
            toRaw: "",
            bodyRaw: bodyText,
            emailSubjectRaw: subject,
            audience: "external",
            category: "transactional",
            purpose: "tour_coordination",
            staffRecipient: { userId, locationId: params.booking.location_id, capability },
            contextLocationId: params.booking.location_id,
            callSite: "tourInternalCalendarInvite",
            authorizedByUserId: params.actorUserId ?? null,
            metadata: {
                source: "tour_scheduling",
                tour_booking_id: params.booking.id,
                tour_event_key: "tour_internal_calendar",
                internal_calendar_action: params.action,
                internal_calendar_key: key,
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
        } else {
            const r = resolutions.find((x) => x.userId === userId);
            refused.push({ user_id: userId, reason: r && !r.ok ? r.reason : enqueued.skippedReason ?? "enqueue_refused" });
        }
    }

    if (messageIds.length > 0) {
        await triggerBackendMessagesQueue({ limit: 25 });
    }

    const result: TourInternalCalendarInviteResult = {
        ok: true,
        icsSequence: sequence,
        recipientEmails: emails,
        communicationMessageIds: messageIds,
        skippedReason:
            messageIds.length > 0 ? undefined : duplicates.length > 0 && refused.length === 0 ? "duplicate" : "no_authorized_recipient",
    };
    return record(result, { duplicates, refused }, params.action !== "cancel" && messageIds.length > 0 ? sequence : undefined);
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
