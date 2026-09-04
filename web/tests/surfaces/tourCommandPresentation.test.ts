/**
 * TOUR IS ONE OPERATIONAL CONCEPT, PRESENTED BY ITS CURRENT STATE.
 *
 * The Process card rendered every configured Tour capability as an unrelated command, so a
 * scheduled tour still offered "Schedule Tour" beside "Cancel Tour" and the operator had to
 * infer the state from which buttons happened to be present. Current Work already grouped them
 * through `partitionTourGroupedActions`; the Process card never asked, and neither surface said
 * anything about the state — Current Work's trigger was the literal string "Tour".
 *
 * `resolveTourCommandPresentation` is the shared piece. It reuses the existing partition rather
 * than forking a second notion of "which commands are Tour commands", and it decides only the
 * LABEL. It cannot add, remove, reorder or enable a command: availability stays with
 * `alignTourSupportingActionsForBookingState` and the platform's eligibility, and durable truth
 * stays in `tour_bookings`.
 */

import { describe, expect, it } from "vitest";

import {
    formatTourControlWhen,
    resolveTourCommandPresentation,
    tourInstantHasPassed,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveTourCommandPresentation";
import { partitionTourGroupedActions } from "@/lib/adminV2/runtime/focusPanel/currentWork/groupTourPresentationActions";
import type { OperationalTourSignal } from "@/lib/adminV2/runtime/operationalContext/types";
import type { TourBookingStatusKey } from "@/lib/tours/bookings/types";

const cmd = (key: string) => ({ key });
const TOUR_SET = [
    cmd("schedule_tour"),
    cmd("reschedule_tour"),
    cmd("cancel_tour"),
    cmd("send_tour_invitation"),
];
const MIXED = [cmd("quick_message"), ...TOUR_SET, cmd("add_child")];

function signal(over: Partial<OperationalTourSignal> = {}): OperationalTourSignal {
    return { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null, ...over };
}

describe("grouping reuses the existing partition", () => {
    it("collapses exactly the Tour commands and leaves the rest independent", () => {
        const out = resolveTourCommandPresentation(MIXED, signal());
        expect(out.tour.map((c) => c.key)).toEqual(TOUR_SET.map((c) => c.key));
        expect(out.rest.map((c) => c.key)).toEqual(["quick_message", "add_child"]);
    });

    it("agrees with partitionTourGroupedActions — one notion of a Tour command, not two", () => {
        const shared = partitionTourGroupedActions(MIXED);
        const out = resolveTourCommandPresentation(MIXED, signal());
        expect(out.tour).toEqual(shared.tour);
        expect(out.rest).toEqual(shared.rest);
    });

    it("never drops a command: everything in is accounted for", () => {
        const out = resolveTourCommandPresentation(MIXED, signal({ scheduled: true, statusKey: "confirmed" }));
        expect([...out.rest, ...out.tour].map((c) => c.key).sort()).toEqual(MIXED.map((c) => c.key).sort());
    });

    it("does not collapse a lone Tour command behind a menu", () => {
        const out = resolveTourCommandPresentation([cmd("schedule_tour"), cmd("quick_message")], signal());
        expect(out.grouped).toBe(false);
        expect(out.label).toBeNull();
    });
});

describe("the label states the durable booking state", () => {
    const cases: Array<[TourBookingStatusKey, string]> = [
        ["requested", "Tour requested"],
        ["pending_approval", "Tour pending approval"],
        ["confirmed", "Tour scheduled"],
        ["rescheduled", "Tour rescheduled"],
    ];

    it.each(cases)("%s → %s", (statusKey, stem) => {
        const out = resolveTourCommandPresentation(TOUR_SET, signal({ scheduled: true, statusKey }));
        expect(out.grouped).toBe(true);
        expect(out.label?.startsWith(stem)).toBe(true);
        expect(out.statusKey).toBe(statusKey);
    });

    it("carries the booking time when there is one", () => {
        const out = resolveTourCommandPresentation(
            TOUR_SET,
            signal({ scheduled: true, statusKey: "confirmed", startAt: "2026-09-08T17:00:00Z" }),
            // `now` is pinned BEFORE the booking: the time is printed because it is still ahead,
            // and this assertion cannot quietly change meaning on the day the date goes by.
            { timeZone: "UTC", now: Date.parse("2026-09-01T00:00:00Z") },
        );
        expect(out.label).toBe("Tour scheduled · Sep 8, 5:00 PM");
    });

    it("still names the state when the instant is missing or unusable", () => {
        for (const startAt of [null, "", "not-a-date"]) {
            const out = resolveTourCommandPresentation(
                TOUR_SET, signal({ scheduled: true, statusKey: "confirmed", startAt }), { timeZone: "UTC" },
            );
            expect(out.label).toBe("Tour scheduled");
        }
    });

    it("announces no state when no active booking exists", () => {
        const out = resolveTourCommandPresentation(TOUR_SET, signal());
        expect(out.grouped).toBe(true);
        expect(out.label).toBe("Tour");
    });

    it("branches on statusKey, never on the label field", () => {
        // `statusLabel` has always carried the raw status_key under a misleading name. A reader
        // that trusted it would be reading a field documented as display-only.
        const out = resolveTourCommandPresentation(
            TOUR_SET, signal({ scheduled: true, statusKey: null, statusLabel: "confirmed" }),
        );
        expect(out.label).toBe("Tour");
    });

    it("survives an unusable time zone rather than losing the control", () => {
        expect(formatTourControlWhen("2026-09-08T17:00:00Z", "Not/AZone")).toBeTruthy();
    });
});

describe("a concluded tour still says what it was", () => {
    // The whole point of widening the projection: `active_tour_bookings` excludes these, so a
    // completed tour used to arrive as "no tour" and the card offered Schedule Tour again.
    const cases: Array<[TourBookingStatusKey, string]> = [
        ["canceled", "Tour canceled"],
        ["completed", "Tour completed"],
        ["no_show", "Tour no-show"],
    ];

    it.each(cases)("%s → %s, with scheduled already false", (statusKey, expected) => {
        const out = resolveTourCommandPresentation(
            TOUR_SET,
            signal({ scheduled: false, statusKey, startAt: "2026-03-01T10:00:00Z" }),
            { timeZone: "UTC" },
        );
        expect(out.grouped).toBe(true);
        expect(out.label).toBe(expected);
        expect(out.statusKey).toBe(statusKey);
    });

    it("does not pin a date to a concluded tour", () => {
        // "Tour completed · Mar 1, 10:00 AM" reads like an appointment. The state is the fact.
        for (const statusKey of ["canceled", "completed", "no_show"] as TourBookingStatusKey[]) {
            const out = resolveTourCommandPresentation(
                TOUR_SET, signal({ scheduled: false, statusKey, startAt: "2026-03-01T10:00:00Z" }), { timeZone: "UTC" },
            );
            expect(out.label).not.toMatch(/·/);
        }
    });

    it("is still distinguishable from a family that never had a tour", () => {
        const never = resolveTourCommandPresentation(TOUR_SET, signal({ scheduled: false, statusKey: null }));
        const done = resolveTourCommandPresentation(TOUR_SET, signal({ scheduled: false, statusKey: "completed" }));
        expect(never.label).toBe("Tour");
        expect(done.label).toBe("Tour completed");
        expect(never.label).not.toBe(done.label);
    });
});

describe("a tour that has already happened states its status, not its date", () => {
    /**
     * A booking does not conclude itself — an operator records the outcome. So a tour the family
     * already attended sits in `confirmed` until someone says what happened, and the control read
     * "Tour scheduled · Aug 14, 9:00 AM" three weeks after the visit: a date to work toward, for a
     * tour that was over. The date is what has to go; the state is what the operator needs.
     */
    const PAST = "2026-08-14T16:00:00Z";
    const NOW = Date.parse("2026-09-04T12:00:00Z");

    it.each([
        ["confirmed" as const],
        ["rescheduled" as const],
    ])("%s with an elapsed instant reads as awaiting its outcome", (statusKey) => {
        const out = resolveTourCommandPresentation(
            TOUR_SET,
            signal({ scheduled: true, statusKey, startAt: PAST }),
            { timeZone: "UTC", now: NOW },
        );
        expect(out.label).toBe("Tour awaiting outcome");
        // The DURABLE state is untouched — only the label speaks differently.
        expect(out.statusKey).toBe(statusKey);
    });

    it("prints no date once the instant is behind the operator", () => {
        const out = resolveTourCommandPresentation(
            TOUR_SET,
            signal({ scheduled: true, statusKey: "confirmed", startAt: PAST }),
            { timeZone: "UTC", now: NOW },
        );
        expect(out.label).not.toMatch(/Aug|14|9:00/);
    });

    it("keeps the date while the booking is still ahead", () => {
        const out = resolveTourCommandPresentation(
            TOUR_SET,
            signal({ scheduled: true, statusKey: "confirmed", startAt: "2026-09-08T17:00:00Z" }),
            { timeZone: "UTC", now: NOW },
        );
        expect(out.label).toBe("Tour scheduled · Sep 8, 5:00 PM");
    });

    it("leaves an un-negotiated slot as what it is, minus the stale date", () => {
        // A requested slot that has gone by is stale, not concluded: nothing says the family came.
        const out = resolveTourCommandPresentation(
            TOUR_SET,
            signal({ scheduled: true, statusKey: "requested", startAt: PAST }),
            { timeZone: "UTC", now: NOW },
        );
        expect(out.label).toBe("Tour requested");
    });

    it("does not demote a booking on an unusable instant", () => {
        // No evidence the tour happened — a parse failure must not restate the operator's position.
        for (const startAt of [null, "", "not-a-date"]) {
            const out = resolveTourCommandPresentation(
                TOUR_SET,
                signal({ scheduled: true, statusKey: "confirmed", startAt }),
                { timeZone: "UTC", now: NOW },
            );
            expect(out.label).toBe("Tour scheduled");
        }
    });

    it("still says what a concluded tour was, rather than awaiting an outcome it has", () => {
        const out = resolveTourCommandPresentation(
            TOUR_SET,
            signal({ scheduled: false, statusKey: "completed", startAt: PAST }),
            { timeZone: "UTC", now: NOW },
        );
        expect(out.label).toBe("Tour completed");
    });

    it("tourInstantHasPassed answers only on evidence", () => {
        expect(tourInstantHasPassed(PAST, NOW)).toBe(true);
        expect(tourInstantHasPassed("2026-09-08T17:00:00Z", NOW)).toBe(false);
        expect(tourInstantHasPassed(null, NOW)).toBe(false);
        expect(tourInstantHasPassed("not-a-date", NOW)).toBe(false);
    });
});
