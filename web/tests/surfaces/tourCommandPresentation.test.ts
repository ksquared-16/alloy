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
            { timeZone: "UTC" },
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
