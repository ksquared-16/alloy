/**
 * The parent surface's contract — Interactive Tour, Parent Action Completion.
 *
 * `buildTourParentView` is the only place internal state becomes parent language, so
 * these cases are the guarantee that no invitation status, booking `status_key`,
 * action key, or id can reach a customer. Testing it directly is what makes every
 * terminal state provable without a database or a browser.
 */

import { describe, expect, it } from "vitest";

import {
    buildTourCalendarWeeks,
    buildTourParentView,
    formatParentDayLabel,
    formatParentMonthLabel,
    formatParentTimeOnly,
    formatParentTourTime,
    tourSlotDayKey,
} from "@/lib/tours/public/tourParentView";

const base = {
    opportunityLabel: "Rowan Reyes",
    locationLabel: "Northwind — Downtown",
    availableActions: ["select_tour_slot"] as const,
};

/** Everything a parent can read, as one string — for leak assertions. */
function allProse(v: ReturnType<typeof buildTourParentView>): string {
    return [v.headline, v.childLine, v.locationLine, v.bodyLine, v.bookingLabel, v.notice, ...v.actions.map((a) => a.label)]
        .filter(Boolean)
        .join(" | ");
}

/**
 * Internal IDENTIFIERS only. Plain English like "cancelled" or "booked" is exactly
 * what a parent should read — the risk is platform vocabulary, not vocabulary.
 */
const LEAKY = [
    // action kinds
    "select_tour_slot", "decline_tour", "confirm_tour", "reschedule_tour",
    "cancel_tour", "view_tour_slots", "view_tour_details",
    // status keys and column names
    "pending_approval", "status_key", "org_id", "opportunity_id", "location_id",
    "invitation_id", "recipient_person_id", "process_instance",
    // platform nouns
    "opportunity", "business process", "work unit", "current work", "uuid",
];

describe("no internal vocabulary can reach the parent", () => {
    const states = [
        { invitationStatus: "active" },
        { invitationStatus: "declined" },
        { invitationStatus: "expired" },
        { invitationStatus: "revoked" },
        { invitationStatus: "superseded" },
        { invitationStatus: "booked", bookingStatusKey: "pending_approval", bookingStartAt: "2026-08-10T16:00:00Z", bookingTimezone: "America/Los_Angeles" },
        { invitationStatus: "booked", bookingStatusKey: "confirmed", bookingStartAt: "2026-08-10T16:00:00Z", bookingTimezone: "America/Los_Angeles" },
        { invitationStatus: "booked", bookingStatusKey: "cancelled" },
        { invitationStatus: "active", consumed: true },
    ];

    for (const s of states) {
        it(`${s.invitationStatus}/${s.bookingStatusKey ?? "no-booking"}${s.consumed ? "/consumed" : ""} leaks nothing`, () => {
            const v = buildTourParentView({
                ...base,
                availableActions: ["select_tour_slot", "decline_tour", "confirm_tour", "reschedule_tour", "cancel_tour"],
                ...s,
            });
            const prose = allProse(v).toLowerCase();
            for (const word of LEAKY) {
                expect(prose, `"${word}" reached the parent`).not.toContain(word.toLowerCase());
            }
            // Always says something.
            expect(v.headline.length).toBeGreaterThan(0);
            expect(v.bodyLine.length).toBeGreaterThan(0);
        });
    }
});

describe("every state is intentional and terminal where it should be", () => {
    it("a live invitation invites exactly one obvious choice", () => {
        const v = buildTourParentView({ ...base, invitationStatus: "active", availableActions: ["select_tour_slot", "decline_tour"] });
        expect(v.state).toBe("choose");
        expect(v.showsOptions).toBe(true);
        expect(v.actions.filter((a) => a.tone === "primary")).toHaveLength(1);
        expect(v.actions.map((a) => a.intent)).toEqual(["book", "decline"]);
    });

    it("a declined invitation offers nothing further", () => {
        const v = buildTourParentView({ ...base, invitationStatus: "declined", availableActions: ["decline_tour"] });
        expect(v.state).toBe("declined");
        expect(v.actions).toHaveLength(0);
        expect(v.showsOptions).toBe(false);
    });

    it("an expired invitation is terminal and tells the parent what to do", () => {
        const v = buildTourParentView({ ...base, invitationStatus: "active", expired: true, availableActions: ["select_tour_slot"] });
        expect(v.state).toBe("expired");
        expect(v.actions).toHaveLength(0);
        expect(v.notice).toBeTruthy();
    });

    it("a superseded link points at the newer message instead of dead-ending", () => {
        const v = buildTourParentView({ ...base, invitationStatus: "superseded", availableActions: ["select_tour_slot"] });
        expect(v.state).toBe("expired");
        expect(v.notice).toContain("most recent");
    });

    it("a spent credential does not invite the parent to act twice", () => {
        const v = buildTourParentView({ ...base, invitationStatus: "active", consumed: true, availableActions: ["decline_tour"] });
        expect(v.state).toBe("finished");
        expect(v.actions).toHaveLength(0);
        expect(v.showsOptions).toBe(false);
    });

    it("a cancelled booking is terminal even while the credential still permits actions", () => {
        const v = buildTourParentView({
            ...base,
            invitationStatus: "booked",
            bookingStatusKey: "cancelled",
            availableActions: ["confirm_tour", "reschedule_tour", "cancel_tour"],
        });
        expect(v.state).toBe("cancelled");
        expect(v.actions).toHaveLength(0);
    });
});

describe("a booked tour shows what the parent needs", () => {
    const booked = {
        ...base,
        invitationStatus: "booked",
        bookingStartAt: "2026-08-10T16:00:00Z",
        bookingTimezone: "America/Los_Angeles",
    };

    it("pending asks for confirmation first", () => {
        const v = buildTourParentView({ ...booked, bookingStatusKey: "pending_approval", availableActions: ["confirm_tour", "reschedule_tour", "cancel_tour"] });
        expect(v.state).toBe("booked_pending");
        expect(v.actions[0].intent).toBe("confirm");
        expect(v.actions[0].tone).toBe("primary");
        expect(v.bookingLabel).toBe("Monday, August 10 · 9:00 AM");
        expect(v.bodyLine).toContain("Monday, August 10");
    });

    it("confirmed stops asking and still allows change", () => {
        const v = buildTourParentView({ ...booked, bookingStatusKey: "confirmed", availableActions: ["confirm_tour", "reschedule_tour", "cancel_tour"] });
        expect(v.state).toBe("booked_confirmed");
        expect(v.actions.map((a) => a.intent)).not.toContain("confirm");
        expect(v.actions.map((a) => a.intent)).toEqual(["reschedule", "cancel"]);
        expect(v.notice).toBeNull();
    });

    it("only offers what the held credential actually permits", () => {
        const v = buildTourParentView({ ...booked, bookingStatusKey: "confirmed", availableActions: ["reschedule_tour"] });
        expect(v.actions.map((a) => a.intent)).toEqual(["reschedule"]);
    });
});

describe("presentation details a parent would notice", () => {
    it("renders the time in the tour's timezone, not the viewer's", () => {
        expect(formatParentTourTime("2026-08-10T16:00:00Z", "America/Los_Angeles")).toBe("Monday, August 10 · 9:00 AM");
        expect(formatParentTourTime("2026-08-10T16:00:00Z", "America/New_York")).toBe("Monday, August 10 · 12:00 PM");
    });

    it("survives a bad timestamp rather than rendering junk", () => {
        expect(formatParentTourTime("not-a-date", "UTC")).toBeNull();
        expect(formatParentTourTime(null, "UTC")).toBeNull();
    });

    it("says nothing rather than 'For Tour' when the record has no name", () => {
        const v = buildTourParentView({ ...base, opportunityLabel: "Tour", invitationStatus: "active" });
        expect(v.childLine).toBeNull();
    });

    it("names the child when the record has one", () => {
        const v = buildTourParentView({ ...base, invitationStatus: "active" });
        expect(v.childLine).toBe("For Rowan Reyes");
    });

    it("falls back to a sentence that still reads when the center has no label", () => {
        const v = buildTourParentView({ ...base, locationLabel: "   ", invitationStatus: "active" });
        expect(v.locationLine).toBe("our center");
        expect(v.bodyLine).toContain("our center");
    });
});

describe("calendar grouping is expressed in the tour's timezone", () => {
    it("groups a slot by the CENTRE's calendar day, not the viewer's", () => {
        // 02:00Z on Aug 6 is still Aug 5 in Los Angeles. A parent picking a visit must
        // see the centre's day, or they book a date that does not exist for them.
        expect(tourSlotDayKey("2026-08-06T02:00:00Z", "America/Los_Angeles")).toBe("2026-08-05");
        expect(tourSlotDayKey("2026-08-06T02:00:00Z", "America/New_York")).toBe("2026-08-05");
        expect(tourSlotDayKey("2026-08-06T02:00:00Z", "UTC")).toBe("2026-08-06");
    });

    it("returns null for an unusable timestamp rather than a wrong day", () => {
        expect(tourSlotDayKey("not-a-date", "UTC")).toBeNull();
    });

    it("renders the time alone in the tour's timezone", () => {
        expect(formatParentTimeOnly("2026-08-05T16:00:00Z", "America/Los_Angeles")).toBe("9:00 AM");
        expect(formatParentTimeOnly("2026-08-05T16:00:00Z", "America/New_York")).toBe("12:00 PM");
    });

    it("labels a day and a month for the calendar header", () => {
        expect(formatParentDayLabel("2026-08-05")).toBe("Wednesday, August 5");
        expect(formatParentMonthLabel("2026-08-05")).toBe("August 2026");
    });

    it("builds whole Sunday-start weeks with padding", () => {
        const weeks = buildTourCalendarWeeks("2026-08-05");
        expect(weeks.every((w) => w.length === 7)).toBe(true);
        // August 2026 starts on a Saturday: six blanks then the 1st.
        expect(weeks[0].slice(0, 6).every((c) => c === "")).toBe(true);
        expect(weeks[0][6]).toBe("2026-08-01");
        const all = weeks.flat().filter(Boolean);
        expect(all).toHaveLength(31);
        expect(all[30]).toBe("2026-08-31");
    });
});
