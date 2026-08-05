/**
 * The booking authority boundary — Parent Action Completion.
 *
 * Director decision: the canonical `tour_bookings` row is domain truth. Business Process
 * stage movement and communications are downstream consequences — observable and
 * retryable, but never part of the transaction that decides whether the parent booked.
 *
 * Before this, a tenant with no configured `lead_to_tour` transition rolled the booking
 * back: a family got "that didn't go through" because an operator had never authored a
 * stage rule. These cases pin the boundary in both directions — downstream failures must
 * degrade, and genuine booking failures must still roll back.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TourBookingRow } from "@/lib/tours/bookings/types";

const mockIntegration = vi.fn();
const mockLifecycleEvent = vi.fn();
const mockComms = vi.fn();
const mockFollowUp = vi.fn();
const mockStageWork = vi.fn();

vi.mock("@/lib/tours/opportunity/tourBookingOpportunityIntegration", () => ({
    applyTourBookingOpportunityIntegration: (...a: unknown[]) => mockIntegration(...a),
}));
vi.mock("@/lib/tours/opportunity/tourStageSyncFollowUp", () => ({
    recordTourStageSyncFollowUp: (...a: unknown[]) => mockFollowUp(...a),
    TOUR_STAGE_SYNC_FOLLOW_UP_EVENT: "tour_stage_sync_follow_up_required",
}));
vi.mock("@/lib/tours/events/tourLifecycleEvents", () => ({
    emitTourBookingLifecycleEvent: (...a: unknown[]) => mockLifecycleEvent(...a),
}));
vi.mock("@/lib/lifecycle/associateTourBookingToStageWork", () => ({
    associateTourBookingToStageWork: (...a: unknown[]) => mockStageWork(...a),
}));
vi.mock("@/lib/tours/comms/tourCommsOrchestrator", () => ({
    orchestrateTourBookingCanceled: (...a: unknown[]) => mockComms(...a),
    orchestrateTourBookingCompleted: (...a: unknown[]) => mockComms(...a),
    orchestrateTourBookingConfirmed: (...a: unknown[]) => mockComms(...a),
    orchestrateTourBookingNoShow: (...a: unknown[]) => mockComms(...a),
    orchestrateTourBookingRescheduled: (...a: unknown[]) => mockComms(...a),
    runTourCommsOrchestratorBestEffort: async (_l: string, fn: () => Promise<unknown>) => {
        try {
            await fn();
        } catch {
            /* best-effort by contract */
        }
    },
}));
vi.mock("@/lib/tours/availability/computeAvailableTourSlots", () => ({
    computeAvailableTourSlots: async () => availableSlots,
}));
vi.mock("@/lib/tours/availability/internalCompute", () => ({
    isSlotOffered: () => slotOffered,
}));

import { createTourBooking, TourBookingTransactionError } from "@/lib/tours/bookings/tourBookingService";

const ORG = "org-1";
const OPP = "opp-1";
const LOC = "loc-1";

let availableSlots: unknown[] = [];
let slotOffered = true;
/** Rows durably present. A rollback must leave this empty. */
let bookingRows: TourBookingRow[] = [];
let activeConflict = false;
let insertedCount = 0;

function row(over: Partial<TourBookingRow> = {}): TourBookingRow {
    return {
        id: `booking-${insertedCount}`,
        org_id: ORG,
        opportunity_id: OPP,
        location_id: LOC,
        status_key: "confirmed",
        start_at: "2026-08-10T16:00:00.000Z",
        end_at: "2026-08-10T17:00:00.000Z",
        timezone: "America/Los_Angeles",
        requested_by_user_id: null,
        ...over,
    } as TourBookingRow;
}

function makeSupabase() {
    return {
        from: (table: string) => {
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.neq = () => chain;
            chain.in = () => chain;
            chain.limit = async () => ({ data: activeConflict ? [{ id: "other" }] : [], error: null });
            chain.insert = (payload: Record<string, unknown>) => {
                if (table === "tour_bookings") {
                    insertedCount += 1;
                    const created = row({ ...payload, id: `booking-${insertedCount}` });
                    bookingRows.push(created);
                    const ins: Record<string, unknown> = {};
                    ins.select = () => ins;
                    ins.single = async () => ({ data: { ...created }, error: null });
                    ins.maybeSingle = async () => ({ data: { ...created }, error: null });
                    return ins;
                }
                return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
            };
            chain.delete = () => {
                const del: Record<string, unknown> = {};
                del.eq = () => del;
                del.then = (resolve: (v: unknown) => unknown) => {
                    // Compensating delete — the rollback proof.
                    bookingRows = [];
                    return Promise.resolve({ data: null, error: null }).then(resolve);
                };
                return del;
            };
            chain.update = () => chain;
            chain.maybeSingle = async () => ({ data: bookingRows[0] ? { ...bookingRows[0] } : null, error: null });
            chain.single = async () => ({ data: bookingRows[0] ? { ...bookingRows[0] } : null, error: null });
            return chain;
        },
    } as never;
}

const input = () => ({
    orgId: ORG,
    opportunityId: OPP,
    locationId: LOC,
    startAt: new Date("2026-08-10T16:00:00.000Z"),
    endAt: new Date("2026-08-10T17:00:00.000Z"),
    timezone: "America/Los_Angeles",
    source: "public_link" as const,
    requestedByUserId: null,
    primaryPersonId: "person-1",
    primaryContactId: null,
    approvalRequired: false,
    metadata: {},
});

const MISSING_TRANSITION = {
    domain: "tour_booking",
    signal: "scheduled",
    message: 'Transition "lead_to_tour" is not configured on this stage.',
};

beforeEach(() => {
    vi.clearAllMocks();
    bookingRows = [];
    insertedCount = 0;
    activeConflict = false;
    slotOffered = true;
    availableSlots = [{ startAt: "2026-08-10T16:00:00.000Z", ruleId: "rule-1", locationId: LOC }];
    mockIntegration.mockResolvedValue({ undo: async () => {} });
    mockLifecycleEvent.mockResolvedValue("tour_confirmed");
    mockComms.mockResolvedValue({ ok: true, skippedReasons: [], immediate: [], reminders: { action: "none" } });
    mockFollowUp.mockResolvedValue({ recorded: true });
    mockStageWork.mockResolvedValue(null);
});

describe("a missing Business Process transition does not revoke the booking", () => {
    it("1+3. the booking commits and is not rolled back", async () => {
        mockIntegration.mockResolvedValue({ undo: async () => {}, stageSyncFailure: MISSING_TRANSITION });

        const booking = await createTourBooking(makeSupabase(), input());

        expect(booking.id).toBeTruthy();
        expect(bookingRows).toHaveLength(1);
    });

    it("2. produces an observable follow-up carrying enough context to retry", async () => {
        mockIntegration.mockResolvedValue({ undo: async () => {}, stageSyncFailure: MISSING_TRANSITION });

        await createTourBooking(makeSupabase(), input());

        expect(mockFollowUp).toHaveBeenCalledTimes(1);
        const call = mockFollowUp.mock.calls[0][0] as Record<string, unknown>;
        expect(call.opportunityId).toBe(OPP);
        expect(call.bookingId).toBeTruthy();
        expect(call.failure).toEqual(MISSING_TRANSITION);
    });

    it("7. does not suppress the canonical booking event", async () => {
        mockIntegration.mockResolvedValue({ undo: async () => {}, stageSyncFailure: MISSING_TRANSITION });

        await createTourBooking(makeSupabase(), input());

        expect(mockLifecycleEvent).toHaveBeenCalledTimes(1);
        expect(mockLifecycleEvent.mock.calls[0][1]).toBe("tour_confirmed");
    });

    it("records no follow-up when the stage did synchronize", async () => {
        await createTourBooking(makeSupabase(), input());
        expect(mockFollowUp).not.toHaveBeenCalled();
    });
});

describe("other downstream consequences also degrade rather than roll back", () => {
    it("6. a communication failure leaves the booking committed", async () => {
        mockComms.mockRejectedValue(new Error("provider unavailable"));

        const booking = await createTourBooking(makeSupabase(), input());

        expect(booking.id).toBeTruthy();
        expect(bookingRows).toHaveLength(1);
    });

    it("a stage/work sufficiency failure leaves the booking committed", async () => {
        mockStageWork.mockRejectedValue(new Error("no work unit"));

        const booking = await createTourBooking(makeSupabase(), { ...input(), requestedByUserId: "user-1" });

        expect(booking.id).toBeTruthy();
        expect(bookingRows).toHaveLength(1);
    });

    it("a follow-up recorder failure still leaves the booking committed", async () => {
        mockIntegration.mockResolvedValue({ undo: async () => {}, stageSyncFailure: MISSING_TRANSITION });
        mockFollowUp.mockRejectedValue(new Error("workflow_events unavailable"));

        const booking = await createTourBooking(makeSupabase(), input());

        expect(bookingRows).toHaveLength(1);
        expect(booking.id).toBeTruthy();
    });
});

describe("the transaction still owns what it must", () => {
    it("8. a genuine booking conflict rolls back and reports failure", async () => {
        activeConflict = true;

        await expect(createTourBooking(makeSupabase(), input())).rejects.toThrow(/active non-terminal booking/);
        expect(bookingRows).toHaveLength(0);
        // Nothing downstream may run for a booking that never existed.
        expect(mockLifecycleEvent).not.toHaveBeenCalled();
        expect(mockFollowUp).not.toHaveBeenCalled();
    });

    it("a slot that is no longer offered rolls back", async () => {
        slotOffered = false;

        await expect(createTourBooking(makeSupabase(), input())).rejects.toThrow();
        expect(bookingRows).toHaveLength(0);
    });

    it("an integration WRITE failure still rolls the booking back", async () => {
        // Distinct from a missing transition: a real write failure is in-boundary.
        mockIntegration.mockRejectedValue(new Error("tour_booking: opportunity metadata mirror failed — denied"));

        await expect(createTourBooking(makeSupabase(), input())).rejects.toThrow(TourBookingTransactionError);
        expect(bookingRows).toHaveLength(0);
    });

    it("a lifecycle event failure still rolls the booking back", async () => {
        mockLifecycleEvent.mockRejectedValue(new Error("workflow_events insert denied"));

        await expect(createTourBooking(makeSupabase(), input())).rejects.toThrow(TourBookingTransactionError);
        expect(bookingRows).toHaveLength(0);
    });
});
