/**
 * Tour lifecycle transitions — transaction integrity certification.
 *
 * `createTourBooking` was made atomic in f0c99413e. The other five transitions were not:
 * confirm / reschedule / cancel / complete / no_show each COMMITTED the booking update and
 * then ran the opportunity integration and the lifecycle event unguarded. A mirror or signal
 * failure returned an error to the operator next to a booking whose status had already
 * changed — the same ghost shape, one call away.
 *
 * These tests drive the real service against an in-memory booking row and assert the honest
 * ending for each transition.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    cancelTourBooking,
    markTourBookingCompleted,
    markTourBookingNoShow,
    TourBookingTransactionError,
} from "@/lib/tours/bookings/tourBookingService";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const orgId = "org-1";
const bookingId = "booking-1";

const mockIntegration = vi.fn();
const mockLifecycleEvent = vi.fn();
const mockComms = vi.fn();

vi.mock("@/lib/tours/opportunity/tourBookingOpportunityIntegration", () => ({
    applyTourBookingOpportunityIntegration: (...args: unknown[]) => mockIntegration(...args),
}));

vi.mock("@/lib/tours/events/tourLifecycleEvents", () => ({
    emitTourBookingLifecycleEvent: (...args: unknown[]) => mockLifecycleEvent(...args),
}));

vi.mock("@/lib/tours/comms/tourCommsOrchestrator", () => ({
    orchestrateTourBookingCanceled: (...args: unknown[]) => mockComms(...args),
    orchestrateTourBookingCompleted: (...args: unknown[]) => mockComms(...args),
    orchestrateTourBookingConfirmed: (...args: unknown[]) => mockComms(...args),
    orchestrateTourBookingNoShow: (...args: unknown[]) => mockComms(...args),
    orchestrateTourBookingRescheduled: (...args: unknown[]) => mockComms(...args),
    runTourCommsOrchestratorBestEffort: async (_label: string, fn: () => Promise<unknown>) => {
        await fn();
    },
}));

/** The durable booking row. Writes through the fake mutate it, so ghosts are observable. */
let booking: TourBookingRow;
let restoreShouldFail = false;

function makeSupabase() {
    return {
        from: (table: string) => {
            if (table !== "tour_bookings") throw new Error(`unexpected table ${table}`);
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.maybeSingle = async () => ({ data: { ...booking }, error: null });
            chain.single = async () => ({ data: { ...booking }, error: null });
            chain.update = (patch: Partial<TourBookingRow>) => {
                if (restoreShouldFail) {
                    const failing: Record<string, unknown> = {};
                    failing.eq = () => failing;
                    failing.select = () => failing;
                    failing.single = async () => ({ data: null, error: { message: "row is locked" } });
                    failing.then = (resolve: (v: unknown) => unknown) => resolve({ error: { message: "row is locked" } });
                    return failing;
                }
                booking = { ...booking, ...patch };
                return chain;
            };
            return chain;
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    restoreShouldFail = false;
    booking = {
        id: bookingId,
        org_id: orgId,
        opportunity_id: "opp-1",
        location_id: "loc-1",
        primary_person_id: null,
        primary_contact_id: null,
        requested_by_user_id: "user-1",
        start_at: "2026-07-27T09:00:00.000Z",
        end_at: "2026-07-27T09:30:00.000Z",
        timezone: "America/Los_Angeles",
        status_key: "confirmed",
        source: "admin",
        form_submission_id: null,
        form_public_link_id: null,
        canceled_at: null,
        canceled_by: null,
        cancel_reason: null,
        metadata: {},
    } as unknown as TourBookingRow;
    mockIntegration.mockResolvedValue({});
    mockLifecycleEvent.mockResolvedValue("event-1");
    mockComms.mockResolvedValue({ ok: true });
});

describe("tour lifecycle — a failed transition leaves the booking untouched", () => {
    it("complete: an opportunity-integration failure does NOT leave the booking completed", async () => {
        mockIntegration.mockRejectedValue(new Error("tour_booking: completed signal failed — event insert denied"));

        await expect(markTourBookingCompleted(makeSupabase() as never, orgId, bookingId)).rejects.toThrow(
            /completed signal failed/,
        );
        // Before === After. The operator was told it failed, so it failed.
        expect(booking.status_key).toBe("confirmed");
    });

    it("no_show: a lifecycle-event failure rolls the status back", async () => {
        mockLifecycleEvent.mockRejectedValue(new Error("workflow_events insert failed"));

        await expect(markTourBookingNoShow(makeSupabase() as never, orgId, bookingId)).rejects.toThrow(
            /workflow_events insert failed/,
        );
        expect(booking.status_key).toBe("confirmed");
    });

    it("cancel: the cancel SIGNAL is inside the boundary — a signal failure rolls the cancel back", async () => {
        mockIntegration.mockRejectedValue(new Error("tour_booking: cancel signal failed — nope"));

        await expect(
            cancelTourBooking(makeSupabase() as never, orgId, bookingId, { canceledBy: "user-1" }),
        ).rejects.toThrow(/cancel signal failed/);
        expect(booking.status_key).toBe("confirmed");
        expect(booking.canceled_at).toBeNull();
    });

    it("a precondition failure writes nothing at all", async () => {
        booking = { ...booking, status_key: "canceled" } as TourBookingRow;

        await expect(markTourBookingCompleted(makeSupabase() as never, orgId, bookingId)).rejects.toThrow(
            /complete only from confirmed or rescheduled/,
        );
        expect(mockIntegration).not.toHaveBeenCalled();
        expect(mockLifecycleEvent).not.toHaveBeenCalled();
        expect(booking.status_key).toBe("canceled");
    });
});

// Await a call expected to reject with a TourBookingTransactionError and return it, narrowed via a
// real instanceof guard — so the assertions read the transaction-error contract, not the
// success-row (`TourBookingRow`) side of the union.
async function captureTourFailure(p: Promise<unknown>): Promise<TourBookingTransactionError> {
    try {
        await p;
    } catch (e) {
        if (e instanceof TourBookingTransactionError) return e;
        throw e;
    }
    throw new Error("expected markTourBookingCompleted to reject with a TourBookingTransactionError");
}

describe("tour lifecycle — the operator is told whether anything changed", () => {
    it("a clean rollback reports changed=false", async () => {
        mockIntegration.mockRejectedValue(new Error("mirror failed"));

        const error = await captureTourFailure(
            markTourBookingCompleted(makeSupabase() as never, orgId, bookingId),
        );

        expect(error).toBeInstanceOf(TourBookingTransactionError);
        expect(error.changed).toBe(false);
        expect(error.integrityBreach).toBeUndefined();
        expect(error.correlationId).toBeTruthy();
    });

    it("a rollback that FAILS reports changed=true with an integrity breach, not a clean abort", async () => {
        mockIntegration.mockImplementation(async () => {
            // The status write has committed; make the compensating restore fail.
            restoreShouldFail = true;
            throw new Error("mirror failed");
        });

        const error = await captureTourFailure(
            markTourBookingCompleted(makeSupabase() as never, orgId, bookingId),
        );

        expect(error.changed).toBe(true);
        expect(error.integrityBreach?.step).toBe("booking_status");
        expect(error.message).toContain("rollback did not fully complete");
        // The booking really is still completed — and the platform says so.
        expect(booking.status_key).toBe("completed");
    });
});

describe("tour lifecycle — declared downstream effects never revoke committed work", () => {
    it("a comms failure still commits the transition and does not roll it back", async () => {
        mockComms.mockRejectedValue(new Error("smtp timeout"));

        const row = await markTourBookingCompleted(makeSupabase() as never, orgId, bookingId);

        expect(row.status_key).toBe("completed");
        expect(booking.status_key).toBe("completed");
    });
});
