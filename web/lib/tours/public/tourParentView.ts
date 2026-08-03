/**
 * The parent-facing view of an invitation.
 *
 * This is the ONE place internal state becomes parent language. Nothing downstream
 * of it may render an invitation status, a booking `status_key`, an action kind, an
 * id, or a raw server error — so the page has nothing to leak.
 *
 * It is pure: state in, meaning out. That is what makes every terminal state
 * testable without a database.
 */

import type { TourActionKind } from "@/lib/tours/public/authorizeTourAction";

/** What the parent is looking at. Never sent to the browser as an internal value. */
export type TourParentState =
    | "choose"
    | "booked_pending"
    | "booked_confirmed"
    | "declined"
    | "cancelled"
    | "expired"
    | "finished";

/**
 * What the button does, in neutral words.
 *
 * Deliberately NOT the `TourActionKind`. The action vocabulary is internal
 * authorization material, and putting it in a public payload would leak it to
 * anyone who opened dev tools — so the wire carries an intent and the page maps
 * that to a route.
 */
export type TourParentIntent = "book" | "decline" | "confirm" | "reschedule" | "cancel";

export type TourParentAction = {
    intent: TourParentIntent;
    label: string;
    tone: "primary" | "secondary" | "quiet";
};

export type TourParentView = {
    headline: string;
    /** "For Rowan Reyes" — omitted when the record has no usable name. */
    childLine: string | null;
    locationLine: string;
    /** Why the parent is here, in one sentence. */
    bodyLine: string;
    state: TourParentState;
    /** "Monday, August 10 · 9:00 AM" when a tour exists. */
    bookingLabel: string | null;
    /** True when the page should list offered times. */
    showsOptions: boolean;
    actions: TourParentAction[];
    /** Recovery guidance when the parent cannot continue. */
    notice: string | null;
};

/** Human time, in the tour's own timezone — never the viewer's. */
export function formatParentTourTime(startAt: string | null, timezone: string | null): string | null {
    if (!startAt) return null;
    const d = new Date(startAt);
    if (Number.isNaN(d.getTime())) return null;
    const tz = timezone || "UTC";
    try {
        const day = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: tz,
        }).format(d);
        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: tz,
        }).format(d);
        return `${day} · ${time}`;
    } catch {
        return null;
    }
}

function childLineFor(opportunityLabel: string): string | null {
    const v = opportunityLabel.trim();
    // "Tour" is the loader's placeholder when the record has no name — saying
    // "For Tour" would be worse than saying nothing.
    if (!v || v.toLowerCase() === "tour") return null;
    return `For ${v}`;
}

export function buildTourParentView(input: {
    opportunityLabel: string;
    locationLabel: string;
    /** Invitation status — one of draft/active/booked/declined/expired/revoked/superseded. */
    invitationStatus: string;
    /** Booking status_key when a booking exists. */
    bookingStatusKey?: string | null;
    bookingStartAt?: string | null;
    bookingTimezone?: string | null;
    /** Whether the invitation's own expiry has passed. */
    expired?: boolean;
    /** Action kinds this credential actually permits. */
    availableActions: readonly TourActionKind[];
    /** True when the credential has already been spent. */
    consumed?: boolean;
}): TourParentView {
    const location = input.locationLabel.trim() || "our center";
    const childLine = childLineFor(input.opportunityLabel);
    const bookingLabel = formatParentTourTime(input.bookingStartAt ?? null, input.bookingTimezone ?? null);
    const can = (k: TourActionKind) => input.availableActions.includes(k);

    const base = { childLine, locationLine: location, bookingLabel };

    // Terminal states first — they outrank whatever the credential permits.
    if (input.invitationStatus === "declined") {
        return {
            ...base,
            headline: "Thanks for letting us know",
            bodyLine: `We won't hold a tour time at ${location}. If things change, just reply to our message and we'll find a time.`,
            state: "declined",
            showsOptions: false,
            actions: [],
            notice: null,
        };
    }

    if (input.bookingStatusKey === "cancelled" || input.bookingStatusKey === "canceled") {
        return {
            ...base,
            headline: "Your visit is cancelled",
            bodyLine: `Your tour at ${location} has been cancelled. Reply to our message and we'll find another time.`,
            state: "cancelled",
            showsOptions: false,
            actions: [],
            notice: null,
        };
    }

    if (input.invitationStatus === "expired" || input.expired) {
        return {
            ...base,
            headline: "This invitation has expired",
            bodyLine: `The times we offered for ${location} are no longer held.`,
            state: "expired",
            showsOptions: false,
            actions: [],
            notice: "Reply to our message and we'll send you new times.",
        };
    }

    if (input.invitationStatus === "revoked" || input.invitationStatus === "superseded") {
        return {
            ...base,
            headline: "This link is out of date",
            bodyLine: `We sent a newer set of times for ${location}.`,
            state: "expired",
            showsOptions: false,
            actions: [],
            notice: "Please use the most recent message we sent you.",
        };
    }

    // A tour exists.
    if (input.bookingStatusKey) {
        const confirmed = input.bookingStatusKey === "confirmed";
        const actions: TourParentAction[] = [];
        if (!confirmed && can("confirm_tour")) {
            actions.push({ intent: "confirm", label: "Yes, I'll be there", tone: "primary" });
        }
        if (can("reschedule_tour")) {
            actions.push({ intent: "reschedule", label: "Choose a different time", tone: "secondary" });
        }
        if (can("cancel_tour")) {
            actions.push({ intent: "cancel", label: "Cancel my visit", tone: "quiet" });
        }
        return {
            ...base,
            headline: confirmed ? "You're all set" : "Your visit is booked",
            bodyLine: bookingLabel
                ? `We'll see you at ${location} on ${bookingLabel}.`
                : `We'll see you at ${location}.`,
            state: confirmed ? "booked_confirmed" : "booked_pending",
            showsOptions: false,
            actions,
            notice: confirmed ? null : "Let us know you're coming so we can have someone ready for you.",
        };
    }

    // A spent selection credential with no booking to show — the parent already acted,
    // and re-opening must not invite them to act again.
    if (input.consumed) {
        return {
            ...base,
            headline: "You've already replied",
            bodyLine: `Thanks — we have your answer for ${location}.`,
            state: "finished",
            showsOptions: false,
            actions: [],
            notice: "If this doesn't look right, reply to our message and we'll sort it out.",
        };
    }

    // The live invitation: choose a time.
    const actions: TourParentAction[] = [];
    if (can("select_tour_slot")) {
        actions.push({ intent: "book", label: "Book this time", tone: "primary" });
    }
    if (can("decline_tour")) {
        actions.push({ intent: "decline", label: "Not right now", tone: "quiet" });
    }
    return {
        ...base,
        headline: "Choose a time to visit",
        bodyLine: `We'd love to show you around ${location}. Pick whichever time suits you.`,
        state: "choose",
        showsOptions: can("select_tour_slot") || can("view_tour_slots"),
        actions,
        notice: null,
    };
}
