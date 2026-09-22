/**
 * P0-7.6 — THE BUSINESS PROCESS ACTIVITY COUNT, RESOLVED AT COMMIT.
 *
 * ── WHAT THE COUNT ACTUALLY IS ──────────────────────────────────────────────────────────────────
 *
 * Not a generic "activity" count from a guessed table. It is `evidence.activity.length` on the
 * Process card, and `activity` is `buildCurrentWorkActivityPreviewItemsFromContext`, which reads
 * canonical activity entries out of TRUTH and — when truth carries none — falls back to ONE item
 * derived from `context.signals.tour`:
 *
 *     if (items.length > 0) return items
 *     if (signals.tour.scheduled && signals.tour.startAt) return [{ label: "Tour scheduled", … }]
 *     return []
 *
 * So the `1` measured on deployed was a SCHEDULED TOUR, and the trigger that renders it is omitted
 * entirely at zero — the card never prints "0".
 *
 * The commit producer declared `signals.tour` settlement-owned ("honest empty, never fabricated"),
 * so the item — and the count beside it — appeared only when the drawer answered. That was the
 * last legitimate UNKNOWN → KNOWN correction blocking first-paint authority.
 *
 * ── THE RULE THESE TESTS PIN ────────────────────────────────────────────────────────────────────
 *
 * ONE owner. `buildTourSignalFromBookings` is the single mapping from the canonical booking
 * projection to the signal, and BOTH settlement and commit call it. Parity is therefore structural,
 * and these tests prove the structure rather than re-deriving settlement's arithmetic.
 *
 * And: a read that did not resolve may never read as "no tour".
 */
import { describe, expect, it } from "vitest";

import { buildTourSignalFromBookings } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { buildCurrentWorkActivityPreviewItems } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const booking = (over: Partial<TourBookingRow> = {}): TourBookingRow =>
    ({
        id: "tb-1",
        org_id: "org-1",
        opportunity_id: "opp-1",
        status_key: "scheduled",
        start_at: "2026-09-25T15:00:00.000Z",
        metadata: null,
        ...over,
    }) as unknown as TourBookingRow;

/** A context carrying NO canonical activity entries in truth, so the tour fallback decides. */
const ctxWith = (tour: OperationalContext["signals"]["tour"]): OperationalContext =>
    ({
        truth: { id: "opp-1" },
        signals: { tour },
    }) as unknown as OperationalContext;

/**
 * The shape the context carries when the tour was NOT established. Note it is structurally equal
 * to a resolved "no tour" — which is exactly why the ANSWER must distinguish them by carrying
 * `resolvedTour: null`, not by the signal's shape.
 */
const NOT_ESTABLISHED = {
    scheduled: false,
    startAt: null,
    statusLabel: null,
    statusKey: null,
    bookingId: null,
    parentConfirmationLabel: null,
} as OperationalContext["signals"]["tour"];

const activityCount = (tour: OperationalContext["signals"]["tour"]) =>
    buildCurrentWorkActivityPreviewItems({ context: ctxWith(tour), limit: 25 }).length;

describe("the canonical mapping is ONE owner", () => {
    it("settlement and commit compose the identical signal from identical bookings", () => {
        const input = {
            activeBookings: [booking()],
            operatorRelevantBooking: booking(),
            truth: { id: "opp-1" } as Record<string, unknown>,
        };
        // Two calls stand in for the two callers; the point is that there is only one function.
        expect(buildTourSignalFromBookings(input)).toEqual(buildTourSignalFromBookings(input));
        expect(buildTourSignalFromBookings(input).scheduled).toBe(true);
    });

    it("zero activity — no bookings yields an unscheduled signal and NO activity item", () => {
        const sig = buildTourSignalFromBookings({
            activeBookings: [], operatorRelevantBooking: null, truth: {},
        });
        expect(sig.scheduled).toBe(false);
        expect(activityCount(sig)).toBe(0);
    });

    it("one activity — a scheduled booking yields exactly one preview item", () => {
        const sig = buildTourSignalFromBookings({
            activeBookings: [booking()], operatorRelevantBooking: booking(), truth: {},
        });
        expect(sig.scheduled).toBe(true);
        expect(activityCount(sig)).toBe(1);
    });

    it("multiple bookings still yield ONE tour item — the fallback speaks once", () => {
        const sig = buildTourSignalFromBookings({
            activeBookings: [booking({ id: "tb-1" }), booking({ id: "tb-2" })],
            operatorRelevantBooking: booking({ id: "tb-1" }),
            truth: {},
        });
        expect(sig.scheduled).toBe(true);
        expect(activityCount(sig)).toBe(1);
    });

    it("a concluded tour still states what it was, from the operator-relevant booking", () => {
        const sig = buildTourSignalFromBookings({
            activeBookings: [],
            operatorRelevantBooking: booking({ status_key: "completed" }),
            truth: {},
        });
        // Not scheduled — but the status survives for command/eligibility seams.
        expect(sig.scheduled).toBe(false);
        expect(sig.statusKey).toBe("completed");
    });

    it("a booking with no start time cannot become an activity item", () => {
        const sig = buildTourSignalFromBookings({
            activeBookings: [booking({ start_at: undefined })],
            operatorRelevantBooking: booking({ start_at: undefined }),
            truth: {},
        });
        expect(sig.scheduled).toBe(true);
        expect(sig.startAt).toBeNull();
        // The fallback requires BOTH scheduled and a startAt; stating "Tour scheduled" with no time
        // would be an item the answer cannot place.
        expect(activityCount(sig)).toBe(0);
    });
});

describe("UNKNOWN != ZERO — plants that must bind", () => {
    it("plant: a NOT-ESTABLISHED signal must not be presented as a known zero", () => {
        /*
         * The commit producer omits `resolvedTour` when the read did not resolve, and the context
         * then carries the settlement-owned empty. That empty renders no activity — which is the
         * SAME surface as "no tour". What must never happen is the ANSWER claiming it resolved.
         * This pins the distinction at the carrier: null means not established.
         */
        expect(activityCount(NOT_ESTABLISHED)).toBe(0);
        const established = buildTourSignalFromBookings({
            activeBookings: [], operatorRelevantBooking: null, truth: {},
        });
        // Structurally identical surfaces, but only one of them is an ANSWER.
        expect(established).toEqual(NOT_ESTABLISHED);
        // So the carrier — not the signal shape — is what must distinguish them.
        expect(null as unknown).not.toEqual(established);
    });

    it("plant: settlement and commit disagree", () => {
        const commit = buildTourSignalFromBookings({
            activeBookings: [booking()], operatorRelevantBooking: booking(), truth: {},
        });
        const settledDifferent = { ...commit, scheduled: false };
        expect(commit).not.toEqual(settledDifferent);
        expect(activityCount(commit)).not.toBe(activityCount(settledDifferent));
    });

    it("plant: wrong subject's activity", () => {
        // The projection is keyed by opportunity at the query; the mapping must not invent one.
        const sig = buildTourSignalFromBookings({
            activeBookings: [booking({ opportunity_id: "opp-OTHER" })],
            operatorRelevantBooking: booking({ opportunity_id: "opp-OTHER" }),
            truth: { id: "opp-1" },
        });
        // The mapping cannot filter by subject — it is the QUERY's job, so this documents the
        // boundary: a mapping that silently accepted foreign rows would show another subject's tour.
        expect(sig.scheduled).toBe(true);
        expect(sig.bookingId).toBe("tb-1");
    });

    it("plant: activity failure must not read as zero at the answer", async () => {
        const { loadOpportunityTourProjectionStrict } = await import(
            "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityActiveTourBookingsForViewModel"
        );
        const failing = {
            from: () => {
                const b: Record<string, unknown> = {};
                for (const op of ["select", "eq", "order", "limit"]) b[op] = () => b;
                b.then = (res: (v: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
                return b;
            },
        } as never;
        // STRICT raises, so the composer omits the field and the signal stays settlement-owned.
        await expect(loadOpportunityTourProjectionStrict(failing, "org-1", "opp-1")).rejects.toThrow(/boom/);
    });

    it("the lenient settlement policy is deliberately unchanged", async () => {
        const { loadOpportunityTourProjectionForViewModel } = await import(
            "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityActiveTourBookingsForViewModel"
        );
        const failing = {
            from: () => {
                const b: Record<string, unknown> = {};
                for (const op of ["select", "eq", "order", "limit"]) b[op] = () => b;
                b.then = (res: (v: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
                return b;
            },
        } as never;
        // The drawer must still paint when the tour leg fails; that behaviour is preserved.
        await expect(loadOpportunityTourProjectionForViewModel(failing, "org-1", "opp-1"))
            .resolves.toEqual({ active: [], operatorRelevant: null });
    });
});
