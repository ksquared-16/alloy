/**
 * Tour lifecycle + invitation workflow_events that belong on an opportunity Activity
 * timeline via `payload.opportunity_id` (entity_type is tour_invitation / tour_bookings).
 */

import { TOUR_EVENTS } from "@/lib/tours/events/recordTourEvent";
import { TOUR_LIFECYCLE_EVENT_TYPES } from "@/lib/tours/constants";

/** Invitation-scoped tour audit events (`recordTourEvent`). */
export const OPPORTUNITY_RELATED_TOUR_INVITATION_ACTIVITY_EVENT_TYPES = [
    "tour_invitation_activated",
    "tour_booked",
    "tour_invitation_declined",
    "tour_slot_selected",
    "tour_rescheduled",
    "tour_cancelled",
    "tour_confirmed",
] as const satisfies ReadonlyArray<(typeof TOUR_EVENTS)[number]>;

/** Booking-entity tour lifecycle events (`emitTourBookingLifecycleEvent`). */
export const OPPORTUNITY_RELATED_TOUR_BOOKING_ACTIVITY_EVENT_TYPES = [
    ...TOUR_LIFECYCLE_EVENT_TYPES,
] as const;

export const OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES = [
    ...OPPORTUNITY_RELATED_TOUR_INVITATION_ACTIVITY_EVENT_TYPES,
    ...OPPORTUNITY_RELATED_TOUR_BOOKING_ACTIVITY_EVENT_TYPES,
] as const;

/** Operator-facing titles for tour activity (never raw event keys). */
export const OPPORTUNITY_TOUR_ACTIVITY_EVENT_LABELS: Record<string, string> = {
    tour_invitation_activated: "Tour invitation sent",
    tour_invitation_created: "Tour invitation prepared",
    tour_booked: "Tour scheduled",
    tour_confirmed: "Tour scheduled",
    tour_booking_pending: "Tour scheduled",
    tour_requested: "Tour requested",
    tour_slot_selected: "Tour time selected",
    tour_rescheduled: "Tour rescheduled",
    tour_canceled: "Tour cancelled",
    tour_cancelled: "Tour cancelled",
    tour_invitation_declined: "Tour invitation declined",
    tour_completed: "Tour completed",
    tour_no_show: "Tour marked no-show",
    tour_attendance_confirmed: "Parent confirmed attendance",
    tour_reminder_sent: "Tour reminder sent",
};

type CollapseRow = {
    event_type?: string | null;
    occurred_at?: string | null;
    payload?: Record<string, unknown> | null;
};

function actionKey(row: CollapseRow): string {
    const p = row.payload && typeof row.payload === "object" ? row.payload : {};
    const raw = p.action_key ?? p.actionKey ?? p.work_template_key;
    return raw != null ? String(raw).trim().toLowerCase() : "";
}

/**
 * Collapse duplicate operator-visible facts from one Tour send/book / contact flow.
 * Prefer richer tour-domain titles over work-template names and technical message_* rows.
 */
export function collapseTourActivityDuplicates<T extends CollapseRow>(rows: T[]): T[] {
    const hasInvitationSent = rows.some(
        (r) => String(r.event_type ?? "").toLowerCase() === "tour_invitation_activated",
    );
    const hasTourScheduled = rows.some((r) => {
        const t = String(r.event_type ?? "").toLowerCase();
        return t === "tour_booked" || t === "tour_confirmed" || t === "tour_booking_pending";
    });
    const hasMessageSent = rows.some((r) => {
        const t = String(r.event_type ?? "").toLowerCase();
        return t === "message_sent" || t === "message_delivered";
    });

    // Near-duplicate invitation fan-out (email+SMS / double-activate within a few seconds).
    const invitationSeen = new Map<string, number>();

    return rows.filter((row) => {
        const t = String(row.event_type ?? "").toLowerCase();
        const key = actionKey(row);
        const occurredMs = Date.parse(String(row.occurred_at ?? ""));
        const invitationId = (() => {
            const p = row.payload && typeof row.payload === "object" ? row.payload : {};
            const raw = p.invitation_id ?? p.tour_invitation_id;
            return raw != null ? String(raw).trim() : "";
        })();

        if (t === "tour_invitation_activated") {
            const dedupeKey = invitationId || "_bare";
            const prev = invitationSeen.get(dedupeKey);
            if (prev != null && Number.isFinite(occurredMs) && Math.abs(occurredMs - prev) <= 5_000) {
                return false;
            }
            if (Number.isFinite(occurredMs)) invitationSeen.set(dedupeKey, occurredMs);
            else if (prev != null) return false;
            else invitationSeen.set(dedupeKey, Number.NaN);
        }

        if (hasInvitationSent) {
            // Same send: drop technical message lifecycle + work-template action rows.
            if (t === "message_queued" || t === "message_sent" || t === "message_delivered") {
                return false;
            }
            if (
                t === "action_executed"
                && (key === "send_tour_invitation" || key === "contact_family" || key === "contact_family_work")
            ) {
                return false;
            }
        }

        // Generic message: prefer message_sent over queued / duplicate delivered.
        if (!hasInvitationSent && hasMessageSent) {
            if (t === "message_queued") return false;
            if (t === "message_delivered" && rows.some((r) => String(r.event_type ?? "").toLowerCase() === "message_sent")) {
                return false;
            }
            // Work-template "Contact Family" must not overshadow Message sent.
            if (t === "action_executed" && (key === "contact_family" || key === "contact_family_work")) {
                return false;
            }
        }

        // Prefer tour_booked / tour_confirmed over the intermediate slot-selected click.
        if (hasTourScheduled && t === "tour_slot_selected") return false;
        // Prefer booking lifecycle confirmed over invitation-scoped tour_booked when both exist.
        if (t === "tour_booked" && rows.some((r) => String(r.event_type ?? "").toLowerCase() === "tour_confirmed")) {
            return false;
        }
        return true;
    });
}

/**
 * Compact Recent Activity window: keep chronological order but ensure a Tour scheduled
 * fact is not starved by repeated invitation-send rows after booking.
 */
export function preferTourScheduledInActivityWindow<T extends CollapseRow>(
    rows: T[],
    limit: number,
): T[] {
    if (limit <= 0 || rows.length <= limit) return rows.slice(0, Math.max(0, limit));
    const head = rows.slice(0, limit);
    const hasScheduledInHead = head.some((r) => {
        const t = String(r.event_type ?? "").toLowerCase();
        return t === "tour_booked" || t === "tour_confirmed" || t === "tour_booking_pending";
    });
    if (hasScheduledInHead) return head;
    const scheduledIdx = rows.findIndex((r) => {
        const t = String(r.event_type ?? "").toLowerCase();
        return t === "tour_booked" || t === "tour_confirmed" || t === "tour_booking_pending";
    });
    if (scheduledIdx < 0) return head;
    // Replace the oldest invitation-spam slot in the window with the scheduled fact.
    const out = [...head];
    let replaceAt = out.length - 1;
    for (let i = out.length - 1; i >= 0; i -= 1) {
        if (String(out[i]?.event_type ?? "").toLowerCase() === "tour_invitation_activated") {
            replaceAt = i;
            break;
        }
    }
    out[replaceAt] = rows[scheduledIdx]!;
    return out;
}

export function formatTourActivityDetail(payload: Record<string, unknown>): string | null {
    const startAt = payload.start_at != null ? String(payload.start_at) : "";
    const timezone = payload.timezone != null ? String(payload.timezone) : "";
    if (!startAt) return null;
    try {
        const d = new Date(startAt);
        if (Number.isNaN(d.getTime())) return null;
        const day = new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: timezone || undefined,
        }).format(d);
        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: timezone || undefined,
        }).format(d);
        const when = `${day} · ${time}`;
        const location =
            firstString(
                payload.location_label,
                payload.location_name,
                payload.site_label,
                payload.site_name,
            );
        return location ? `${when}\n${location}` : when;
    } catch {
        return null;
    }
}

/** Channel + recipient line for Tour invitation / message Activity detail. */
export function formatCommunicationActivityDetail(payload: Record<string, unknown>): string | null {
    const channelRaw = firstString(payload.channel, payload.contact_channel);
    const channelLabel = channelActivityNoun(channelRaw);
    const recipient = firstString(
        payload.recipient_display_name,
        payload.recipient_name,
        payload.to_display_name,
        payload.contact_display_name,
        payload.parent_name,
        payload.person_display_name,
    );
    // Compose mark_sent may store channel as "compose" — treat as Message when no email/sms noun.
    const effectiveChannel =
        channelLabel ?? (channelRaw && channelRaw.toLowerCase() === "compose" ? "Message" : null);
    if (effectiveChannel && recipient) return `${effectiveChannel} to ${recipient}`;
    if (effectiveChannel) return effectiveChannel;
    if (recipient) return recipient;
    return null;
}

function channelActivityNoun(channelRaw: string | null): string | null {
    if (!channelRaw) return null;
    // tour_invitation_activated may store "email" or "email,sms"
    const parts = channelRaw
        .split(/[,|/]/)
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
    if (parts.includes("email") && parts.includes("sms")) return "Email · SMS";
    if (parts.includes("email")) return "Email";
    if (parts.includes("sms")) return "SMS";
    if (parts.includes("in_app")) return "Message";
    return null;
}

function firstString(...vals: unknown[]): string | null {
    for (const v of vals) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s) return s;
    }
    return null;
}
