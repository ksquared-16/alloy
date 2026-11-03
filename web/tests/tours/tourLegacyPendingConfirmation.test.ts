/**
 * The one compatibility path (Tours feedback 2026-10-29, sprint OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B).
 *
 * The slot engine is mocked to model a location whose only rule is a legacy organization-wide one:
 * its time is offered ONLY under the server-controlled `legacy_pending_confirmation` authority.
 * Confirming the existing pending booking at its unchanged time still passes the capacity check;
 * a new booking or a reschedule to that same time is refused. No other row is touched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const authorities: string[] = [];
const LEGACY_SLOT = {
    startAt: "2026-08-10T16:00:00.000Z",
    endAt: "2026-08-10T17:00:00.000Z",
    timezone: "America/Los_Angeles",
    remainingCapacity: 1,
    capacity: 1,
    ruleId: "org-rule",
    locationId: "loc-1",
    userId: null,
};
let legacyCapacityLeft = 1;

vi.mock("@/lib/tours/availability/computeAvailableTourSlots", () => ({
    computeAvailableTourSlots: async (_sb: unknown, _p: unknown, authority: string = "location") => {
        authorities.push(authority);
        return authority === "legacy_pending_confirmation" && legacyCapacityLeft > 0 ? [LEGACY_SLOT] : [];
    },
}));
vi.mock("@/lib/tours/opportunity/tourBookingOpportunityIntegration", () => ({
    applyTourBookingOpportunityIntegration: async () => ({ undo: async () => {} }),
}));
vi.mock("@/lib/tours/opportunity/tourStageSyncFollowUp", () => ({
    recordTourStageSyncFollowUp: async () => ({ recorded: true }),
    TOUR_STAGE_SYNC_FOLLOW_UP_EVENT: "tour_stage_sync_follow_up_required",
}));
vi.mock("@/lib/tours/events/tourLifecycleEvents", () => ({ emitTourBookingLifecycleEvent: async () => "tour_confirmed" }));
vi.mock("@/lib/lifecycle/associateTourBookingToStageWork", () => ({ associateTourBookingToStageWork: async () => null }));
vi.mock("@/lib/tours/comms/tourCommsOrchestrator", () => {
    const ok = async () => ({ ok: true, skippedReasons: [], immediate: [], reminders: { action: "none" } });
    return {
        orchestrateTourBookingCanceled: ok,
        orchestrateTourBookingCompleted: ok,
        orchestrateTourBookingConfirmed: ok,
        orchestrateTourBookingNoShow: ok,
        orchestrateTourBookingRescheduled: ok,
        runTourCommsOrchestratorBestEffort: async (_l: string, fn: () => Promise<unknown>) => {
            await fn().catch(() => undefined);
        },
    };
});

import { confirmTourBooking, createTourBooking, rescheduleTourBooking } from "@/lib/tours/bookings/tourBookingService";

beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const ORG = "org-1";
let booking: TourBookingRow;
let updates: { table: string; patch: Record<string, unknown> }[] = [];
let inserts: string[] = [];

function pending(): TourBookingRow {
    return {
        id: "bk-legacy",
        org_id: ORG,
        opportunity_id: "opp-1",
        location_id: "loc-1",
        status_key: "pending_approval",
        start_at: LEGACY_SLOT.startAt,
        end_at: LEGACY_SLOT.endAt,
        timezone: "America/Los_Angeles",
        requested_by_user_id: null,
        metadata: {},
    } as unknown as TourBookingRow;
}

function makeSupabase() {
    return {
        from: (table: string) => {
            const chain: Record<string, unknown> = {};
            let patch: Record<string, unknown> | null = null;
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.neq = () => chain;
            chain.in = () => chain;
            chain.limit = async () => ({ data: [], error: null });
            chain.update = (p: Record<string, unknown>) => {
                patch = p;
                updates.push({ table, patch: p });
                return chain;
            };
            chain.insert = () => {
                inserts.push(table);
                return chain;
            };
            chain.delete = () => chain;
            const current = async () => {
                if (table !== "tour_bookings") return { data: null, error: null };
                if (patch) booking = { ...booking, ...patch } as TourBookingRow;
                return { data: { ...booking }, error: null };
            };
            chain.maybeSingle = current;
            chain.single = current;
            return chain;
        },
    } as never;
}

beforeEach(() => {
    booking = pending();
    updates = [];
    inserts = [];
    authorities.length = 0;
    legacyCapacityLeft = 1;
});

describe("a pending booking made under a legacy organization-wide rule", () => {
    it("is still confirmable at its unchanged time — status is the only change", async () => {
        const row = await confirmTourBooking(makeSupabase(), ORG, "bk-legacy", { actorUserId: "staff-1" });
        expect(row.status_key).toBe("confirmed");
        expect(authorities).toEqual(["legacy_pending_confirmation"]);
        const bookingUpdates = updates.filter((u) => u.table === "tour_bookings");
        expect(bookingUpdates).toEqual([{ table: "tour_bookings", patch: { status_key: "confirmed" } }]);
        expect(row.start_at).toBe(LEGACY_SLOT.startAt);
        expect(inserts.filter((t) => t === "tour_bookings")).toEqual([]);
    });

    it("keeps the existing capacity safeguard: no offered capacity, no confirmation", async () => {
        legacyCapacityLeft = 0;
        await expect(confirmTourBooking(makeSupabase(), ORG, "bk-legacy")).rejects.toThrow(/not available/);
        expect(updates.filter((u) => u.table === "tour_bookings")).toEqual([]);
    });

    it("cannot be rescheduled onto a legacy-only interval — even its own time (excludeBookingId grants nothing)", async () => {
        await expect(
            rescheduleTourBooking(makeSupabase(), ORG, "bk-legacy", {
                startAt: new Date(LEGACY_SLOT.startAt),
                endAt: new Date(LEGACY_SLOT.endAt),
            } as never)
        ).rejects.toThrow(/not available/);
        expect(authorities).toEqual(["location"]);
        expect(updates.filter((u) => u.table === "tour_bookings")).toEqual([]);
    });

    it("a NEW booking for that legacy-only interval is refused", async () => {
        await expect(
            createTourBooking(makeSupabase(), {
                orgId: ORG,
                opportunityId: "opp-2",
                locationId: "loc-1",
                startAt: new Date(LEGACY_SLOT.startAt),
                endAt: new Date(LEGACY_SLOT.endAt),
                timezone: "America/Los_Angeles",
                source: "public_link",
                requestedByUserId: null,
                primaryPersonId: "person-1",
                primaryContactId: null,
                approvalRequired: false,
                metadata: {},
            } as never)
        ).rejects.toThrow(/not available/);
        expect(authorities).toEqual(["location"]);
        expect(inserts.filter((t) => t === "tour_bookings")).toEqual([]);
    });
});
