/**
 * Structured authored content for tour invitations — Slice A.
 *
 * DELIBERATELY NOT a generalized rich-message platform. This models exactly
 * what the Interactive Tour Invitation vertical needs and nothing more.
 *
 * THE LOAD-BEARING RULE: the message carries an invitation SNAPSHOT and action
 * REFERENCES. It never carries mutable availability as authority. A slot shown
 * in an email sent on Monday proves only what was offered on Monday —
 * availability is always revalidated when the parent acts.
 *
 * That separation is why the snapshot can be immutable for audit while the
 * booking stays correct.
 */

/** The four actions this vertical supports. There is no general executor. */
export const TOUR_ACTION_KINDS = [
    "select_tour_slot",
    "view_more_tour_slots",
    "decline_tour",
    "reschedule_tour",
] as const;

export type TourActionKind = (typeof TOUR_ACTION_KINDS)[number];

/**
 * Reuse semantics per action, per the approved model.
 *
 * `single_use` is the security property for the two consequential actions:
 * a replayed booking must return the existing result, never create a second.
 */
export const TOUR_ACTION_REUSE: Record<TourActionKind, "single_use" | "reusable_until_expiry"> = {
    select_tour_slot: "single_use",
    decline_tour: "single_use",
    view_more_tour_slots: "reusable_until_expiry",
    // Issued fresh AFTER a booking exists, and scoped to that booking.
    reschedule_tour: "single_use",
};

/**
 * One offered slot, as presented in the sent message.
 *
 * `availabilityRef` points at the availability computation that produced it —
 * it is evidence of provenance, not permission. Booking revalidates.
 */
export type TourOption = {
    optionId: string;
    /** Local date in the location's timezone, ISO yyyy-mm-dd. */
    date: string;
    /** Local start time, HH:mm 24h. */
    startTime: string;
    timezone: string;
    locationId: string;
    locationLabel: string;
    /** Present only where the tour is bound to a specific host. */
    staffUserId?: string | null;
    availabilityRef: string;
    /** What the parent reads, e.g. "Monday, August 10 · 9:00 AM". */
    presentationLabel: string;
    /** Which action this option invokes. Always select_tour_slot. */
    actionKind: Extract<TourActionKind, "select_tour_slot">;
};

export type TourAction = {
    kind: TourActionKind;
    label: string;
    /** Opaque reference resolved to a scoped credential at render time. */
    actionRef: string;
};

/**
 * Authored content for a tour invitation. This is what an operator composes,
 * before rendering and before any transport decision.
 */
export type TourInvitationContent = {
    kind: "tour_invitation";
    /** Operator prose above the options. May be empty. */
    text: string;
    options: TourOption[];
    primaryAction: TourAction;
    secondaryAction?: TourAction | null;
    /** Universal no-login surface. Every transport can fall back to this. */
    fallbackActionUrl: string;
    /** Stated to the parent where applicable. */
    expiresAt?: string | null;
};

export type TourContentViolation = { code: string; message: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate authored content before it is rendered or sent.
 *
 * An invitation with no options is refused: sending "here are your times" with
 * no times is an operator-visible failure, not something to render emptily.
 */
export function validateTourInvitationContent(content: TourInvitationContent): TourContentViolation | null {
    if (content.kind !== "tour_invitation") {
        return { code: "wrong_kind", message: "Content is not a tour invitation." };
    }
    if (!Array.isArray(content.options) || content.options.length === 0) {
        return {
            code: "no_options",
            message: "There are no available tour times to offer. Check the location's tour availability before sending.",
        };
    }
    const seen = new Set<string>();
    for (const o of content.options) {
        if (!o.optionId) return { code: "option_missing_id", message: "Every tour option needs an identifier." };
        if (seen.has(o.optionId)) {
            return { code: "duplicate_option", message: "The same tour option was offered twice." };
        }
        seen.add(o.optionId);
        if (!DATE_RE.test(o.date)) return { code: "bad_date", message: `Invalid tour date on option ${o.optionId}.` };
        if (!TIME_RE.test(o.startTime)) {
            return { code: "bad_time", message: `Invalid tour start time on option ${o.optionId}.` };
        }
        if (!o.timezone) return { code: "missing_timezone", message: "Every tour option must state a timezone." };
        if (!o.locationId || !o.locationLabel) {
            return { code: "missing_location", message: "Every tour option must state its location." };
        }
        if (!o.availabilityRef) {
            return { code: "missing_availability_ref", message: "Every option must reference its availability source." };
        }
        if (o.actionKind !== "select_tour_slot") {
            return { code: "bad_option_action", message: "A tour option may only invoke select_tour_slot." };
        }
    }
    // All options must belong to ONE location: a single invitation is for one
    // tour context, and mixing locations would make "your tour" ambiguous.
    const locations = new Set(content.options.map((o) => o.locationId));
    if (locations.size > 1) {
        return { code: "mixed_locations", message: "A tour invitation may only offer times at one location." };
    }
    if (!content.fallbackActionUrl) {
        return {
            code: "missing_fallback",
            message: "A tour invitation requires a no-login fallback action URL.",
        };
    }
    if (content.primaryAction.kind !== "select_tour_slot") {
        return { code: "bad_primary_action", message: "The primary action must be select_tour_slot." };
    }
    return null;
}

/**
 * The immutable record of what was actually offered.
 *
 * Preserved verbatim on the message even after availability changes, so an
 * audit can answer "what did we show this family?" — which the live
 * availability tables can never answer retrospectively.
 */
export type TourInvitationSnapshot = {
    invitationId: string;
    capturedAt: string;
    locationId: string;
    timezone: string;
    options: TourOption[];
    expiresAt: string | null;
};

export function buildTourInvitationSnapshot(args: {
    invitationId: string;
    capturedAt: string;
    content: TourInvitationContent;
}): TourInvitationSnapshot {
    const { invitationId, capturedAt, content } = args;
    return {
        invitationId,
        capturedAt,
        locationId: content.options[0]!.locationId,
        timezone: content.options[0]!.timezone,
        // Copied, not referenced — the snapshot must not drift with the draft.
        options: content.options.map((o) => ({ ...o })),
        expiresAt: content.expiresAt ?? null,
    };
}

/**
 * Plain-text rendering. Required as an email fallback and reused for SMS
 * framing, where only the fallback URL is offered rather than a slot list.
 */
export function renderTourInvitationText(content: TourInvitationContent): string {
    const lines: string[] = [];
    if (content.text.trim()) {
        lines.push(content.text.trim(), "");
    }
    lines.push("Available tour times", "");
    for (const o of content.options) {
        lines.push(o.presentationLabel);
    }
    lines.push("", `${content.primaryAction.label}: ${content.fallbackActionUrl}`);
    if (content.secondaryAction) {
        lines.push(`${content.secondaryAction.label}: ${content.fallbackActionUrl}`);
    }
    if (content.expiresAt) {
        lines.push("", "These times are held only while they remain available.");
    }
    return lines.join("\n");
}

/**
 * SMS body. Deliberately does NOT list slots — a long option list is unreadable
 * on SMS and would go stale faster than it can be read. One secure link opens
 * the live set.
 */
export function renderTourInvitationSms(args: {
    recipientFirstName?: string | null;
    locationLabel: string;
    actionUrl: string;
}): string {
    const greeting = args.recipientFirstName?.trim() ? `Hi ${args.recipientFirstName.trim()} — ` : "";
    return `${greeting}choose a time for your tour at ${args.locationLabel}:\n\n${args.actionUrl}`;
}
