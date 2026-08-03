/**
 * Slice C certification — the four action routes plus the cross-route matrix.
 *
 * Behavioural: each case drives the REAL route handler, which drives the REAL
 * guard and authorizer. Only the canonical lifecycle services and the database
 * are doubled, so what is proven is the route's own orchestration —
 * authorization, binding, consumption, and lifecycle reuse.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.fn();
const rescheduleMock = vi.fn();
const cancelMock = vi.fn();
const eventMock = vi.fn();
const mintMock = vi.fn();

vi.mock("@/lib/tours/bookings/tourBookingService", () => ({
    confirmTourBooking: (...a: unknown[]) => confirmMock(...a),
    rescheduleTourBooking: (...a: unknown[]) => rescheduleMock(...a),
    cancelTourBooking: (...a: unknown[]) => cancelMock(...a),
    createTourBooking: vi.fn(),
}));
vi.mock("@/lib/tours/events/recordTourEvent", () => ({
    recordTourEvent: (...a: unknown[]) => eventMock(...a),
    TOUR_EVENTS: [],
}));
vi.mock("@/lib/tours/invitation/mintTourInvitation", () => ({
    mintActionsFor: (...a: unknown[]) => mintMock(...a),
    POST_BOOKING_ACTION_KINDS: ["view_tour_details", "confirm_tour", "reschedule_tour"],
}));
vi.mock("@/lib/tours/availability/computeAvailableTourSlots", () => ({
    computeAvailableTourSlots: async () => availableSlots,
}));

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const OTHER_PERSON = "11111111-0000-4000-8000-00000000000b";
const OPP = "22222222-0000-4000-8000-00000000000c";
const LOC = "33333333-0000-4000-8000-00000000000d";
const INV = "44444444-0000-4000-8000-00000000000e";
const BOOKING = "55555555-0000-4000-8000-00000000000f";
const START = "2026-08-10T16:00:00.000Z";

let availableSlots: Array<{ start_at: string; rule_id?: string }> = [];

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

type State = {
    link?: Record<string, unknown> | null;
    invitation?: Record<string, unknown> | null;
    booking?: Record<string, unknown> | null;
    /** Conditional updates that matched, in order — the concurrency evidence. */
    updates: Array<{ table: string; patch: Record<string, unknown>; matched: boolean }>;
    /** Simulate a racer having already won the conditional update. */
    alreadyTransitioned?: boolean;
};

let state: State;

const link = (over: Record<string, unknown> = {}) => ({
    id: "link-1", org_id: ORG, opportunity_id: OPP, location_id: LOC,
    invitation_id: INV, recipient_person_id: PERSON, action_kind: "decline_tour",
    booking_id: null, consumed_at: null, revoked_at: null, use_count: 0, max_uses: null,
    is_active: true, expires_at: null, authorization_model: "scoped", ...over,
});
const invitation = (over: Record<string, unknown> = {}) => ({
    id: INV, org_id: ORG, recipient_person_id: PERSON, opportunity_id: OPP, location_id: LOC,
    status: "active", expires_at: null, revoked_at: null, conversation_thread_id: null,
    option_snapshot: {}, ...over,
});
const booking = (over: Record<string, unknown> = {}) => ({
    id: BOOKING, org_id: ORG, status_key: "requested", start_at: START,
    end_at: "2026-08-10T16:30:00.000Z", timezone: "America/Los_Angeles",
    primary_person_id: PERSON, opportunity_id: OPP, ...over,
});

vi.mock("@/lib/supabase/serverServiceClient", () => ({
    createServiceRoleClient: () => ({
        from(table: string) {
            const filters: Record<string, unknown> = {};
            let patch: Record<string, unknown> | null = null;
            let isNullCol: string | null = null;
            let eqAfterUpdate: Record<string, unknown> = {};
            const b: Record<string, unknown> = {
                select: () => b,
                insert: () => b,
                in: () => b,
                limit: () => b,
                update: (p: Record<string, unknown>) => { patch = p; return b; },
                is: (c: string) => { isNullCol = c; return b; },
                neq: () => b,
                // Bulk updates (revocations) are awaited directly, with no
                // .maybeSingle(). Making the builder thenable records them.
                then: (resolve: (v: unknown) => unknown) => {
                    if (patch) state.updates.push({ table, patch: patch!, matched: true });
                    return Promise.resolve({ data: null, error: null }).then(resolve);
                },
                eq: (c: string, v: unknown) => { (patch ? eqAfterUpdate : filters)[c] = v; return b; },
                maybeSingle: async () => {
                    if (patch) {
                        // A conditional update matches only when the guarded
                        // column is still in its pre-transition state.
                        const guardedStatus = eqAfterUpdate.status as string | undefined;
                        const currentStatus = String((state.invitation as Record<string, unknown> | null)?.status ?? "");
                        const statusOk = guardedStatus === undefined || guardedStatus === currentStatus;
                        const nullOk = isNullCol === null || !state.alreadyTransitioned;
                        const matched = statusOk && nullOk && !state.alreadyTransitioned;
                        state.updates.push({ table, patch: patch!, matched });
                        return { data: matched ? { id: "row" } : null, error: null };
                    }
                    if (table === "tour_public_booking_links") return { data: state.link ?? null, error: null };
                    if (table === "tour_invitations") return { data: state.invitation ?? null, error: null };
                    if (table === "tour_bookings") return { data: state.booking ?? null, error: null };
                    return { data: null, error: null };
                },
            };
            return b;
        },
    }),
}));

vi.mock("@/lib/tours/public/tourPublicRateLimit", () => ({ takeTourPublicRateLimit: () => null }));

import { POST as declinePOST } from "@/app/api/public/tour-booking/[token]/decline/route";
import { POST as confirmPOST } from "@/app/api/public/tour-booking/[token]/confirm/route";
import { POST as cancelPOST } from "@/app/api/public/tour-booking/[token]/cancel/route";
import { POST as reschedulePOST } from "@/app/api/public/tour-booking/[token]/reschedule/route";

function req(body: unknown = {}) {
    return new Request("https://x.test/api", { method: "POST", body: JSON.stringify(body) }) as never;
}
const params = Promise.resolve({ token: "tok" });

async function call(handler: (r: never, c: { params: Promise<{ token: string }> }) => Promise<Response>, body?: unknown) {
    const res = await handler(req(body), { params });
    let json: Record<string, unknown> = {};
    try { json = (await res.clone().json()) as Record<string, unknown>; } catch { /* empty */ }
    return { status: res.status, json };
}

beforeEach(() => {
    [confirmMock, rescheduleMock, cancelMock, eventMock, mintMock].forEach((m) => m.mockReset());
    eventMock.mockResolvedValue({ recorded: true });
    mintMock.mockResolvedValue({ ok: true, actions: [] });
    confirmMock.mockResolvedValue(booking({ status_key: "confirmed" }));
    cancelMock.mockResolvedValue(booking({ status_key: "canceled" }));
    rescheduleMock.mockResolvedValue(booking({ id: "booking-2", status_key: "rescheduled" }));
    availableSlots = [{ start_at: START, rule_id: "rule-1" }];
    state = { link: link(), invitation: invitation(), booking: booking(), updates: [] };
});

// ---------------------------------------------------------------- decline ---
describe("decline", () => {
    it("declines an active invitation exactly once and consumes the action", async () => {
        const r = await call(declinePOST);
        expect(r.status).toBe(200);
        expect(r.json.status).toBe("declined");
        const declines = state.updates.filter((u) => u.patch.status === "declined" && u.matched);
        expect(declines).toHaveLength(1);
        expect(state.updates.some((u) => u.patch.consumed_at)).toBe(true);
    });

    it("creates and cancels NO booking", async () => {
        await call(declinePOST);
        expect(cancelMock).not.toHaveBeenCalled();
        expect(confirmMock).not.toHaveBeenCalled();
        expect(state.updates.some((u) => u.table === "tour_bookings")).toBe(false);
    });

    it("revokes outstanding selection actions", async () => {
        await call(declinePOST);
        expect(state.updates.some((u) => u.patch.revoked_at && u.patch.is_active === false)).toBe(true);
    });

    it("returns the existing result on replay", async () => {
        state.invitation = invitation({ status: "declined" });
        const r = await call(declinePOST);
        expect(r.json.idempotent_replay).toBe(true);
        expect(eventMock).not.toHaveBeenCalled();
    });

    it("CONCURRENT declines produce one transition — the loser sees the existing result", async () => {
        state.alreadyTransitioned = true; // a racer already won
        const r = await call(declinePOST);
        expect(r.json.idempotent_replay).toBe(true);
        expect(state.updates.filter((u) => u.patch.status === "declined" && u.matched)).toHaveLength(0);
    });

    it("refuses a booked invitation", async () => {
        state.invitation = invitation({ status: "booked" });
        expect((await call(declinePOST)).status).toBe(409);
    });

    it("emits the decline event once", async () => {
        await call(declinePOST);
        expect(eventMock.mock.calls.filter((c) => c[1].event === "tour_invitation_declined")).toHaveLength(1);
    });

    it.each(["select_tour_slot", "view_tour_slots", "confirm_tour", "cancel_tour"])(
        "refuses a %s token", async (kind) => {
            state.link = link({ action_kind: kind });
            expect((await call(declinePOST)).status).toBe(404);
        }
    );
});

// ---------------------------------------------------------------- confirm ---
describe("confirm", () => {
    beforeEach(() => { state.link = link({ action_kind: "confirm_tour", booking_id: BOOKING }); });

    it("confirms via the canonical service exactly once", async () => {
        const r = await call(confirmPOST);
        expect(r.status).toBe(200);
        expect(confirmMock).toHaveBeenCalledTimes(1);
        expect(confirmMock.mock.calls[0][2]).toBe(BOOKING);
    });

    it("takes the booking id from the CREDENTIAL, ignoring the body", async () => {
        await call(confirmPOST, { booking_id: "attacker-supplied", id: "also-ignored" });
        expect(confirmMock.mock.calls[0][2]).toBe(BOOKING);
    });

    it("does not patch booking status directly", async () => {
        await call(confirmPOST);
        expect(state.updates.some((u) => u.table === "tour_bookings")).toBe(false);
    });

    it("is idempotent on an already-confirmed booking", async () => {
        state.booking = booking({ status_key: "confirmed" });
        const r = await call(confirmPOST);
        expect(r.json.idempotent_replay).toBe(true);
        expect(confirmMock).not.toHaveBeenCalled();
    });

    it("leaves the action RETRYABLE when the lifecycle fails", async () => {
        confirmMock.mockRejectedValue(new Error("db down"));
        const r = await call(confirmPOST);
        expect(r.status).toBe(400);
        expect(state.updates.some((u) => u.patch.consumed_at)).toBe(false);
    });

    it("refuses a booking belonging to another recipient", async () => {
        state.booking = booking({ primary_person_id: OTHER_PERSON });
        expect((await call(confirmPOST)).status).toBe(404);
        expect(confirmMock).not.toHaveBeenCalled();
    });

    it("refuses when no booking is bound to the action", async () => {
        state.link = link({ action_kind: "confirm_tour", booking_id: null });
        expect((await call(confirmPOST)).status).toBe(404);
    });

    it.each(["reschedule_tour", "cancel_tour", "select_tour_slot"])("refuses a %s token", async (kind) => {
        state.link = link({ action_kind: kind, booking_id: BOOKING });
        expect((await call(confirmPOST)).status).toBe(404);
        expect(confirmMock).not.toHaveBeenCalled();
    });

    it("emits tour_confirmed once", async () => {
        await call(confirmPOST);
        expect(eventMock.mock.calls.filter((c) => c[1].event === "tour_confirmed")).toHaveLength(1);
    });
});

// ----------------------------------------------------------------- cancel ---
describe("cancel", () => {
    beforeEach(() => { state.link = link({ action_kind: "cancel_tour", booking_id: BOOKING }); });

    it("cancels via the canonical service exactly once", async () => {
        const r = await call(cancelPOST);
        expect(r.status).toBe(200);
        expect(cancelMock).toHaveBeenCalledTimes(1);
        expect(cancelMock.mock.calls[0][2]).toBe(BOOKING);
    });

    it("is idempotent on an already-cancelled booking", async () => {
        state.booking = booking({ status_key: "canceled" });
        const r = await call(cancelPOST);
        expect(r.json.idempotent_replay).toBe(true);
        expect(cancelMock).not.toHaveBeenCalled();
    });

    it("refuses a completed tour", async () => {
        state.booking = booking({ status_key: "completed" });
        expect((await call(cancelPOST)).status).toBe(409);
        expect(cancelMock).not.toHaveBeenCalled();
    });

    it("does not patch booking status directly", async () => {
        await call(cancelPOST);
        expect(state.updates.some((u) => u.table === "tour_bookings")).toBe(false);
    });

    it.each(["view_tour_details", "select_tour_slot", "confirm_tour", "reschedule_tour"])(
        "refuses a %s token", async (kind) => {
            state.link = link({ action_kind: kind, booking_id: BOOKING });
            expect((await call(cancelPOST)).status).toBe(404);
            expect(cancelMock).not.toHaveBeenCalled();
        }
    );

    it("emits tour_cancelled once", async () => {
        await call(cancelPOST);
        expect(eventMock.mock.calls.filter((c) => c[1].event === "tour_cancelled")).toHaveLength(1);
    });
});

// ------------------------------------------------------------- reschedule ---
describe("reschedule", () => {
    const body = { start_at: START, end_at: "2026-08-10T16:30:00.000Z" };
    beforeEach(() => { state.link = link({ action_kind: "reschedule_tour", booking_id: BOOKING }); });

    it("replaces via the canonical service and records lineage", async () => {
        const r = await call(reschedulePOST, body);
        expect(r.status).toBe(200);
        expect(rescheduleMock).toHaveBeenCalledTimes(1);
        expect(r.json.previous_booking_id).toBe(BOOKING);
    });

    it("mints a fresh post-booking action set for the replacement", async () => {
        await call(reschedulePOST, body);
        expect(mintMock).toHaveBeenCalledTimes(1);
        expect(mintMock.mock.calls[0][0].bookingId).toBe("booking-2");
    });

    it("does NOT consume the action when the slot is unavailable", async () => {
        availableSlots = [];
        const r = await call(reschedulePOST, body);
        expect(r.status).toBe(409);
        expect(rescheduleMock).not.toHaveBeenCalled();
        expect(state.updates.some((u) => u.patch.consumed_at)).toBe(false);
    });

    it("does NOT consume the action on a malformed slot", async () => {
        const r = await call(reschedulePOST, { start_at: "not-a-date" });
        expect(r.status).toBe(400);
        expect(state.updates.some((u) => u.patch.consumed_at)).toBe(false);
    });

    it("leaves the original booking intact when replacement fails", async () => {
        rescheduleMock.mockRejectedValue(new Error("conflict"));
        const r = await call(reschedulePOST, body);
        expect(r.status).toBe(400);
        expect(String(r.json.error)).toMatch(/original time is unchanged/i);
        expect(state.updates.some((u) => u.patch.consumed_at)).toBe(false);
    });

    it("returns the existing result on replay", async () => {
        state.link = link({ action_kind: "reschedule_tour", booking_id: BOOKING, consumed_at: new Date().toISOString() });
        const r = await call(reschedulePOST, body);
        // A single-use consumed action is refused by the authorizer; reschedule
        // is reusable, so the route's own replay branch answers instead.
        expect([200, 409]).toContain(r.status);
        expect(rescheduleMock).not.toHaveBeenCalled();
    });

    it.each(["confirm_tour", "cancel_tour", "view_tour_slots"])("refuses a %s token", async (kind) => {
        state.link = link({ action_kind: kind, booking_id: BOOKING });
        expect((await call(reschedulePOST, body)).status).toBe(404);
        expect(rescheduleMock).not.toHaveBeenCalled();
    });

    it("emits started and rescheduled", async () => {
        await call(reschedulePOST, body);
        const names = eventMock.mock.calls.map((c) => c[1].event);
        expect(names).toContain("tour_reschedule_started");
        expect(names).toContain("tour_rescheduled");
    });
});

// -------------------------------------------------------- cross-route matrix
describe("cross-route authorization matrix", () => {
    const ROUTES: Array<[string, (r: never, c: { params: Promise<{ token: string }> }) => Promise<Response>, string, unknown]> = [
        ["decline", declinePOST, "decline_tour", {}],
        ["confirm", confirmPOST, "confirm_tour", {}],
        ["cancel", cancelPOST, "cancel_tour", {}],
        ["reschedule", reschedulePOST, "reschedule_tour", { start_at: START, end_at: "2026-08-10T16:30:00.000Z" }],
    ];

    it.each(ROUTES)("%s refuses an expired action", async (_n, handler, kind, b) => {
        state.link = link({ action_kind: kind, booking_id: BOOKING, expires_at: new Date(Date.now() - 60_000).toISOString() });
        expect((await call(handler, b)).status).toBe(403);
    });

    it.each(ROUTES)("%s refuses a revoked action", async (_n, handler, kind, b) => {
        state.link = link({ action_kind: kind, booking_id: BOOKING, revoked_at: new Date().toISOString() });
        expect((await call(handler, b)).status).toBe(403);
    });

    it.each(ROUTES)("%s refuses a recipient mismatch", async (_n, handler, kind, b) => {
        state.link = link({ action_kind: kind, booking_id: BOOKING, recipient_person_id: OTHER_PERSON });
        expect((await call(handler, b)).status).toBe(404);
    });

    it.each(ROUTES)("%s refuses a cross-org token", async (_n, handler, kind, b) => {
        state.link = link({ action_kind: kind, booking_id: BOOKING, org_id: OTHER_ORG });
        expect((await call(handler, b)).status).toBe(404);
    });

    it.each(ROUTES)("%s refuses a legacy unscoped link", async (_n, handler, kind, b) => {
        state.link = link({ action_kind: kind, booking_id: BOOKING, authorization_model: "legacy_unscoped" });
        expect((await call(handler, b)).status).toBe(403);
    });

    it.each(ROUTES)("%s refuses an unknown token", async (_n, handler, _k, b) => {
        state.link = null;
        expect((await call(handler, b)).status).toBe(404);
    });

    it.each(ROUTES)("%s leaks no identifier or token in its failure", async (_n, handler, _k, b) => {
        state.link = link({ org_id: OTHER_ORG, booking_id: BOOKING });
        const r = await call(handler, b);
        const s = JSON.stringify(r.json);
        for (const id of [ORG, OTHER_ORG, PERSON, OPP, LOC, INV, BOOKING, "tok"]) expect(s).not.toContain(id);
    });

    it("no event payload carries a credential-shaped key", async () => {
        await call(declinePOST);
        for (const c of eventMock.mock.calls) {
            const s = JSON.stringify(c[1]).toLowerCase();
            for (const bad of ["token", "secret", "credential", "password"]) expect(s).not.toContain(bad);
        }
    });
});
