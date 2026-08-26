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
    | "attendance_confirmed"
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
export type TourParentIntent =
    | "book"
    | "decline"
    | "confirm"
    | "reschedule"
    /** Opens the bounded cancellation flow. Does NOT cancel. */
    | "cancel"
    /** Attendance affirmation — does not gate booking validity. */
    | "confirm_attendance";

export type TourParentAction = {
    intent: TourParentIntent;
    label: string;
    tone: "primary" | "secondary" | "quiet";
};

export type TourParentView = {
    headline: string;
    /**
     * Retained in the model but NOT rendered on the parent surface: the record's
     * internal label ("Inquiry 0010 — Test Family 0010") is our vocabulary, not a
     * parent's. The surface shows the campus, its address, and the time.
     */
    childLine: string | null;
    locationLine: string;
    /** Street address of the campus, so the parent knows where to go. */
    locationAddress: string | null;
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
    /**
     * When set, the client should invoke this intent automatically (e.g. opening
     * a Confirm I'm coming email link).
     */
    autoIntent?: TourParentIntent | null;
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
    locationAddress?: string | null;
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
    /** Parent already affirmed attendance — show terminal success without re-posting. */
    attendanceAlreadyConfirmed?: boolean;
}): TourParentView {
    const location = input.locationLabel.trim() || "our center";
    const childLine = childLineFor(input.opportunityLabel);
    const bookingLabel = formatParentTourTime(input.bookingStartAt ?? null, input.bookingTimezone ?? null);
    const can = (k: TourActionKind) => input.availableActions.includes(k);

    const base = {
        childLine,
        locationLine: location,
        locationAddress: (input.locationAddress ?? "").trim() || null,
        bookingLabel,
    };

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
        const confirmed = input.bookingStatusKey === "confirmed" || input.bookingStatusKey === "rescheduled";

        // Confirm I'm coming link — auto-affirm attendance, then show terminal success.
        if (can("confirm_attendance") && confirmed) {
            return {
                ...base,
                headline: "You're confirmed",
                bodyLine: bookingLabel
                    ? `We look forward to seeing you ${bookingLabel} at ${location}.`
                    : `We look forward to seeing you at ${location}.`,
                state: "attendance_confirmed",
                showsOptions: false,
                actions: [],
                notice: null,
                autoIntent: input.attendanceAlreadyConfirmed ? null : "confirm_attendance",
            };
        }

        const actions: TourParentAction[] = [];
        if (!confirmed && can("confirm_tour")) {
            actions.push({ intent: "confirm", label: "Yes, I'll be there", tone: "primary" });
        }
        if (can("reschedule_tour")) {
            actions.push({ intent: "reschedule", label: "Choose a different time", tone: "secondary" });
        }
        // The Manage credential opens the bounded cancellation flow. A `cancel_tour`
        // credential also lands here — that is the parent returning to the final
        // confirmation step with the credential the intent route minted.
        if (can("view_tour_details") || can("cancel_tour")) {
            actions.push({ intent: "cancel", label: "Cancel tour", tone: "quiet" });
        }
        return {
            ...base,
            headline: confirmed ? "Tour confirmed" : "Your visit is booked",
            bodyLine: bookingLabel
                ? `We'll see you at ${location} on ${bookingLabel}.`
                : `We'll see you at ${location}.`,
            state: confirmed ? "booked_confirmed" : "booked_pending",
            showsOptions: false,
            actions,
            notice: confirmed ? "We look forward to seeing you." : "Let us know you're coming so we can have someone ready for you.",
            autoIntent: null,
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
        actions.push({ intent: "book", label: "Confirm Tour", tone: "primary" });
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

/**
 * Calendar helpers. Pure, and expressed in the TOUR's timezone — a parent choosing a
 * visit must see the centre's day and time, never their own device's.
 */

/** `2026-08-05` in the tour's timezone — the grouping key for a calendar day. */
export function tourSlotDayKey(startAt: string, timezone: string | null): string | null {
    const d = new Date(startAt);
    if (Number.isNaN(d.getTime())) return null;
    try {
        // en-CA yields ISO-ordered y-m-d, which sorts correctly as a string.
        return new Intl.DateTimeFormat("en-CA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: timezone || "UTC",
        }).format(d);
    } catch {
        return null;
    }
}

/** "9:00 AM" — the time alone, for a chip under an already-chosen day. */
export function formatParentTimeOnly(startAt: string, timezone: string | null): string {
    const d = new Date(startAt);
    if (Number.isNaN(d.getTime())) return "";
    try {
        return new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: timezone || "UTC",
        }).format(d);
    } catch {
        return "";
    }
}

/** "Wednesday, August 5" — the chosen day, spelled out. */
export function formatParentDayLabel(dayKey: string): string {
    const [y, m, d] = dayKey.split("-").map((n) => Number(n));
    if (!y || !m || !d) return "";
    // Noon UTC keeps the calendar date stable regardless of the render timezone.
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    }).format(dt);
}

/** Month label for the calendar header, e.g. "August 2026". */
export function formatParentMonthLabel(dayKey: string): string {
    const [y, m] = dayKey.split("-").map((n) => Number(n));
    if (!y || !m) return "";
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(y, m - 1, 1, 12))
    );
}

/**
 * Build the weeks of a month grid for `dayKeys`, padded to whole Sunday-start weeks.
 * Empty string means "no cell" (leading/trailing padding).
 */
/**
 * Month navigation for the parent calendar.
 *
 * The displayed month used to be a pure function of the selected day — there was no month
 * state at all, so there was nothing a visitor could move. These helpers give the month its
 * own identity WITHOUT introducing a second calendar model: the grid is still built by
 * {@link buildTourCalendarWeeks}, availability is still grouped by {@link tourSlotDayKey},
 * and a month key is just the first day of that month.
 */

/** `2026-08-14` → `2026-08`. */
export function tourMonthKeyOf(dayKey: string): string {
    return String(dayKey ?? "").slice(0, 7);
}

/** A month key as the day key of its first day, which is what the grid builder consumes. */
export function tourMonthAnchorDay(monthKey: string): string {
    return `${monthKey}-01`;
}

/** Move a `YYYY-MM` key by whole months, rolling the year correctly. */
export function shiftTourMonthKey(monthKey: string, delta: number): string {
    const [y, m] = String(monthKey ?? "").split("-").map((n) => Number(n));
    if (!y || !m) return monthKey;
    const zero = (y * 12 + (m - 1)) + delta;
    const ny = Math.floor(zero / 12);
    const nm = (zero % 12) + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
}

/**
 * The instant window to ask the availability route for, to cover one month.
 *
 * Padded a day on each side because slots are grouped by the CENTRE's local day while the
 * route takes instants — without the pad, a centre east or west of UTC loses its first or
 * last day of the month. The padded span is at most 33 days, comfortably inside
 * `TOUR_PUBLIC_SLOTS_MAX_RANGE_MS` (45 days), so this can never trip the abuse guard.
 */
export function tourMonthSlotsWindow(monthKey: string): { from: Date; to: Date } {
    const [y, m] = monthKey.split("-").map((n) => Number(n));
    const from = new Date(Date.UTC(y, m - 1, 1) - 24 * 60 * 60 * 1000);
    const to = new Date(Date.UTC(y, m, 1) + 24 * 60 * 60 * 1000);
    return { from, to };
}

/** `true` when `monthKey` is strictly before the month containing `now`. */
export function isTourMonthInPast(monthKey: string, now: Date = new Date()): boolean {
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return monthKey < current;
}

export function buildTourCalendarWeeks(monthOfDayKey: string): string[][] {
    const [y, m] = monthOfDayKey.split("-").map((n) => Number(n));
    if (!y || !m) return [];
    const first = new Date(Date.UTC(y, m - 1, 1, 12));
    const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    const lead = first.getUTCDay();

    const cells: string[] = Array.from({ length: lead }, () => "");
    for (let d = 1; d <= daysInMonth; d += 1) {
        cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push("");

    const weeks: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}
