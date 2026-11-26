/**
 * S1-A — the single tour communications eligibility policy, pinned state by state.
 *
 * The rule: an unapproved booking, or a tour requested by a lead still awaiting Processing
 * approval, never sends a tour confirmation, calendar invitation or reminder.
 */
import { describe, expect, it } from "vitest";

import {
    isTourBookingApprovedForComms,
    mayCommunicateForTour,
    TOUR_COMMS_MESSAGE_CLASS,
    type TourCommsAuthoritativeState,
    type TourCommsIntent,
} from "@/lib/tours/comms/tourCommsEligibility";

const FUTURE = "2099-01-01T15:00:00.000Z";
const NOW = new Date("2026-10-22T12:00:00.000Z");

function state(status_key: string, over: Partial<TourCommsAuthoritativeState> = {}): TourCommsAuthoritativeState {
    return { booking: { status_key, start_at: FUTURE }, opportunityAccepted: true, ...over };
}

const CONFIRMATION_LIKE: TourCommsIntent[] = ["booking_confirmation", "reschedule_notice", "reminder"];

describe("mayCommunicateForTour", () => {
    describe.each(CONFIRMATION_LIKE)("%s", (intent) => {
        it.each(["confirmed", "rescheduled"])("is allowed for an approved (%s) booking", (status) => {
            expect(mayCommunicateForTour(intent, state(status), { now: NOW })).toEqual({ allowed: true });
        });

        it.each([
            ["pending_approval", "awaiting_approval"],
            ["requested", "awaiting_approval"],
            ["canceled", "booking_canceled"],
            ["completed", "booking_closed"],
            ["no_show", "booking_closed"],
            ["some_future_status", "booking_closed"],
        ])("is refused for a %s booking (%s)", (status, reason) => {
            expect(mayCommunicateForTour(intent, state(status), { now: NOW })).toEqual({ allowed: false, reason });
        });

        it("is refused when the lead was never accepted (no opportunity in the org)", () => {
            expect(mayCommunicateForTour(intent, state("confirmed", { opportunityAccepted: false }), { now: NOW })).toEqual({
                allowed: false,
                reason: "lead_not_accepted",
            });
        });

        it("is refused when the booking is not found", () => {
            expect(mayCommunicateForTour(intent, { booking: null, opportunityAccepted: true }, { now: NOW })).toEqual({
                allowed: false,
                reason: "booking_not_found",
            });
        });
    });

    it("refuses a reminder for a tour that has already started", () => {
        const started = { booking: { status_key: "confirmed", start_at: "2026-10-22T11:00:00.000Z" }, opportunityAccepted: true };
        expect(mayCommunicateForTour("reminder", started, { now: NOW })).toEqual({ allowed: false, reason: "tour_started" });
        // A confirmation is not time-boxed the same way; the reminder is.
        expect(mayCommunicateForTour("booking_confirmation", started, { now: NOW })).toEqual({ allowed: true });
    });

    describe("cancellation_notice", () => {
        it.each(["confirmed", "rescheduled"])("is allowed when a %s tour is canceled", (previous) => {
            expect(mayCommunicateForTour("cancellation_notice", state("canceled"), { previousStatusKey: previous })).toEqual({
                allowed: true,
            });
        });

        it.each(["pending_approval", "requested", null])(
            "is refused when the request (%s) was never confirmed — a rejection is not 'your tour was canceled'",
            (previous) => {
                expect(mayCommunicateForTour("cancellation_notice", state("canceled"), { previousStatusKey: previous })).toEqual({
                    allowed: false,
                    reason: "never_confirmed",
                });
            }
        );

        it("is refused unless the booking is actually canceled now", () => {
            expect(mayCommunicateForTour("cancellation_notice", state("confirmed"), { previousStatusKey: "confirmed" })).toEqual({
                allowed: false,
                reason: "booking_closed",
            });
        });
    });

    it("no-show and post-visit follow-ups follow their own status only", () => {
        expect(mayCommunicateForTour("no_show_followup", state("no_show")).allowed).toBe(true);
        expect(mayCommunicateForTour("no_show_followup", state("confirmed")).allowed).toBe(false);
        expect(mayCommunicateForTour("post_visit_followup", state("completed")).allowed).toBe(true);
        expect(mayCommunicateForTour("post_visit_followup", state("pending_approval")).allowed).toBe(false);
    });

    it("never authorises from an event name: the same intent flips with the booking's state alone", () => {
        expect(mayCommunicateForTour("booking_confirmation", state("pending_approval")).allowed).toBe(false);
        expect(mayCommunicateForTour("booking_confirmation", state("confirmed")).allowed).toBe(true);
    });
});

describe("message classification (for C-D0)", () => {
    it("classifies every tour intent as transactional — none is marketing", () => {
        expect(new Set(Object.values(TOUR_COMMS_MESSAGE_CLASS))).toEqual(new Set(["transactional"]));
    });

    it("approval means confirmed or rescheduled, nothing else", () => {
        expect(["confirmed", "rescheduled"].every(isTourBookingApprovedForComms)).toBe(true);
        expect(["pending_approval", "requested", "canceled", "completed", "no_show", "", null].some(isTourBookingApprovedForComms)).toBe(false);
    });
});
