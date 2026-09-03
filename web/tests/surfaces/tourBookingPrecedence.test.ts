/**
 * WHICH TOUR IS *THE* TOUR.
 *
 * Widening the projection to terminal states introduces history into what was an active-only
 * view, so the precedence rule has to be deterministic and it has to come from Tour lifecycle
 * semantics rather than array order. Two opposite failures are what these guard against:
 * an old completed tour hiding a newer confirmed one, and a superseded pre-reschedule row
 * showing a date the family is no longer coming on.
 */

import { describe, expect, it } from "vitest";

import {
    isActiveTourBooking,
    resolveOperatorRelevantTourBooking,
} from "@/lib/tours/bookings/resolveOperatorRelevantTourBooking";
import type { TourBookingRow, TourBookingStatusKey } from "@/lib/tours/bookings/types";

let seq = 0;
function booking(over: Partial<TourBookingRow> & { status_key: TourBookingStatusKey }): TourBookingRow {
    seq += 1;
    return {
        id: over.id ?? `b${seq}`,
        org_id: "org",
        opportunity_id: "opp",
        location_id: "loc",
        primary_person_id: null,
        primary_contact_id: null,
        requested_by_user_id: null,
        start_at: "2026-01-01T10:00:00Z",
        end_at: "2026-01-01T11:00:00Z",
        timezone: "UTC",
        source: "admin",
        form_submission_id: null,
        form_public_link_id: null,
        canceled_at: null,
        canceled_by: null,
        cancel_reason: null,
        rescheduled_from_booking_id: null,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...over,
    };
}

describe("an appointment that still stands outranks history", () => {
    it("prefers a newer confirmed booking over an old completed one", () => {
        const completed = booking({ id: "old", status_key: "completed", start_at: "2026-03-01T10:00:00Z" });
        const confirmed = booking({ id: "new", status_key: "confirmed", start_at: "2026-09-08T17:00:00Z" });
        expect(resolveOperatorRelevantTourBooking([completed, confirmed])?.id).toBe("new");
        // Order of the input must not matter.
        expect(resolveOperatorRelevantTourBooking([confirmed, completed])?.id).toBe("new");
    });

    it("prefers an active booking even when it is scheduled EARLIER than a concluded one", () => {
        // A completed tour later in the calendar must not outrank a standing appointment.
        const completed = booking({ id: "later", status_key: "completed", start_at: "2026-12-01T10:00:00Z" });
        const requested = booking({ id: "sooner", status_key: "requested", start_at: "2026-06-01T10:00:00Z" });
        expect(resolveOperatorRelevantTourBooking([completed, requested])?.id).toBe("sooner");
    });

    it("treats every non-terminal status as standing", () => {
        for (const status of ["requested", "pending_approval", "confirmed", "rescheduled"] as TourBookingStatusKey[]) {
            expect(isActiveTourBooking({ status_key: status }), status).toBe(true);
        }
        for (const status of ["canceled", "completed", "no_show"] as TourBookingStatusKey[]) {
            expect(isActiveTourBooking({ status_key: status }), status).toBe(false);
        }
    });

    it("takes the soonest of several standing appointments", () => {
        const far = booking({ id: "far", status_key: "confirmed", start_at: "2026-10-01T10:00:00Z" });
        const near = booking({ id: "near", status_key: "confirmed", start_at: "2026-09-01T10:00:00Z" });
        expect(resolveOperatorRelevantTourBooking([far, near])?.id).toBe("near");
    });
});

describe("a superseded booking never speaks for the Tour", () => {
    it("uses the reschedule successor, not the row it replaced", () => {
        const original = booking({ id: "orig", status_key: "confirmed", start_at: "2026-09-01T10:00:00Z" });
        const moved = booking({
            id: "moved", status_key: "rescheduled",
            start_at: "2026-09-20T14:00:00Z", rescheduled_from_booking_id: "orig",
        });
        const picked = resolveOperatorRelevantTourBooking([original, moved]);
        expect(picked?.id).toBe("moved");
        // The stale pre-reschedule date must not reach presentation.
        expect(picked?.start_at).toBe("2026-09-20T14:00:00Z");
    });

    it("follows a chain of reschedules to its head", () => {
        const a = booking({ id: "a", status_key: "confirmed", start_at: "2026-09-01T10:00:00Z" });
        const b = booking({ id: "b", status_key: "rescheduled", start_at: "2026-09-05T10:00:00Z", rescheduled_from_booking_id: "a" });
        const c = booking({ id: "c", status_key: "rescheduled", start_at: "2026-09-09T10:00:00Z", rescheduled_from_booking_id: "b" });
        expect(resolveOperatorRelevantTourBooking([a, b, c])?.id).toBe("c");
    });

    it("does not empty the list when a chain references rows we were not given", () => {
        // The loader pages; a successor may reference a parent outside the window.
        const orphan = booking({ id: "only", status_key: "confirmed", rescheduled_from_booking_id: "not-loaded" });
        expect(resolveOperatorRelevantTourBooking([orphan])?.id).toBe("only");
    });
});

describe("with nothing standing, the most recently concluded booking speaks", () => {
    it("represents a cancellation rather than reporting no tour", () => {
        const canceled = booking({ id: "x", status_key: "canceled", canceled_at: "2026-05-02T09:00:00Z" });
        const picked = resolveOperatorRelevantTourBooking([canceled]);
        expect(picked?.id).toBe("x");
        expect(picked?.status_key).toBe("canceled");
    });

    it("orders by when it concluded, not by when it was created", () => {
        // The cancellation was recorded today for a tour scheduled long ago; the completed
        // tour happened months back. `created_at` would pick the wrong one.
        const completedLongAgo = booking({
            id: "completed", status_key: "completed",
            start_at: "2026-02-01T10:00:00Z", created_at: "2026-06-01T00:00:00Z",
        });
        const canceledToday = booking({
            id: "canceled", status_key: "canceled",
            start_at: "2026-01-01T10:00:00Z", canceled_at: "2026-08-01T09:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
        });
        expect(resolveOperatorRelevantTourBooking([completedLongAgo, canceledToday])?.id).toBe("canceled");
    });

    it("keeps a no-show visible", () => {
        const noShow = booking({ id: "ns", status_key: "no_show", start_at: "2026-04-01T10:00:00Z" });
        expect(resolveOperatorRelevantTourBooking([noShow])?.status_key).toBe("no_show");
    });

    it("a completed tour followed by a new scheduled one yields the new one", () => {
        const done = booking({ id: "done", status_key: "completed", start_at: "2026-03-01T10:00:00Z" });
        const next = booking({ id: "next", status_key: "confirmed", start_at: "2026-11-01T10:00:00Z" });
        expect(resolveOperatorRelevantTourBooking([done, next])?.id).toBe("next");
    });
});

describe("nothing at all", () => {
    it("is null for an empty, null or undefined list", () => {
        expect(resolveOperatorRelevantTourBooking([])).toBeNull();
        expect(resolveOperatorRelevantTourBooking(null)).toBeNull();
        expect(resolveOperatorRelevantTourBooking(undefined)).toBeNull();
    });

    it("survives unusable timestamps rather than throwing", () => {
        const bad = booking({ id: "bad", status_key: "completed", start_at: "not-a-date", canceled_at: "nope" });
        expect(resolveOperatorRelevantTourBooking([bad])?.id).toBe("bad");
    });
});
