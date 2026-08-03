/**
 * The book route — Parent Action Completion.
 *
 * Drives the REAL handler through the REAL guard and authorizer. Only the canonical
 * booking service and the database are doubled.
 *
 * `tourActionRoutes.test.ts` certifies decline/confirm/cancel/reschedule; booking was
 * the one lifecycle action with no route-level coverage, which is why the consume-once,
 * replay and concurrency guarantees are pinned here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AvailableTourSlot } from "@/lib/tours/availability/types";

const createMock = vi.fn();
const eventMock = vi.fn();

vi.mock("@/lib/tours/bookings/tourBookingService", () => ({
    createTourBooking: (...a: unknown[]) => createMock(...a),
    confirmTourBooking: vi.fn(),
    rescheduleTourBooking: vi.fn(),
    cancelTourBooking: vi.fn(),
}));
vi.mock("@/lib/tours/events/recordTourEvent", () => ({
    recordTourEvent: (...a: unknown[]) => eventMock(...a),
    TOUR_EVENTS: [],
}));
vi.mock("@/lib/tours/availability/computeAvailableTourSlots", () => ({
    computeAvailableTourSlots: async () => availableSlots,
}));
vi.mock("@/lib/tours/public/tourPublicRateLimit", () => ({ takeTourPublicRateLimit: () => null }));

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const OTHER_PERSON = "11111111-0000-4000-8000-00000000000b";
const OPP = "22222222-0000-4000-8000-00000000000c";
const LOC = "33333333-0000-4000-8000-00000000000d";
const INV = "44444444-0000-4000-8000-00000000000e";
const BOOKING = "55555555-0000-4000-8000-00000000000f";
const START = "2026-08-10T16:00:00.000Z";
const RULE = "rule-1";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

let availableSlots: AvailableTourSlot[] = [];

function slot(over: Partial<AvailableTourSlot> = {}): AvailableTourSlot {
    return {
        startAt: START,
        endAt: "2026-08-10T17:00:00.000Z",
        timezone: "America/Los_Angeles",
        remainingCapacity: 3,
        ruleId: RULE,
        locationId: LOC,
        userId: null,
        ...over,
    };
}

type State = {
    link: Record<string, unknown> | null;
    invitation: Record<string, unknown> | null;
    booking: Record<string, unknown> | null;
    rule: Record<string, unknown> | null;
    opportunity: Record<string, unknown> | null;
    /** Conditional consume attempts and whether they matched — the concurrency evidence. */
    consumeAttempts: Array<{ matched: boolean }>;
    /** Simulate a racer having already consumed the action. */
    alreadyConsumed: boolean;
};
let state: State;

const link = (over: Record<string, unknown> = {}) => ({
    id: "link-1", org_id: ORG, opportunity_id: OPP, location_id: LOC,
    invitation_id: INV, recipient_person_id: PERSON, action_kind: "select_tour_slot",
    booking_id: null, consumed_at: null, revoked_at: null, use_count: 0, max_uses: null,
    is_active: true, expires_at: null, authorization_model: "scoped", ...over,
});
const invitation = (over: Record<string, unknown> = {}) => ({
    id: INV, org_id: ORG, recipient_person_id: PERSON, opportunity_id: OPP, location_id: LOC,
    status: "active", expires_at: null, revoked_at: null, conversation_thread_id: null,
    option_snapshot: {}, ...over,
});

vi.mock("@/lib/supabase/serverServiceClient", () => ({
    createServiceRoleClient: () => ({
        from(table: string) {
            let patch: Record<string, unknown> | null = null;
            let isNullCol: string | null = null;
            const b: Record<string, unknown> = {
                select: () => b,
                insert: () => b,
                in: () => b,
                limit: () => b,
                neq: () => b,
                eq: () => b,
                update: (p: Record<string, unknown>) => { patch = p; return b; },
                is: (c: string) => { isNullCol = c; return b; },
                then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
                maybeSingle: async () => {
                    if (patch) {
                        // consumeTourAction is a conditional UPDATE ... WHERE consumed_at IS NULL.
                        // Exactly one racer may match.
                        if (isNullCol === "consumed_at") {
                            const matched = !state.alreadyConsumed;
                            state.consumeAttempts.push({ matched });
                            state.alreadyConsumed = true;
                            return { data: matched ? { id: "link-1" } : null, error: null };
                        }
                        return { data: { id: "row" }, error: null };
                    }
                    if (table === "tour_public_booking_links") return { data: state.link, error: null };
                    if (table === "tour_invitations") return { data: state.invitation, error: null };
                    if (table === "tour_bookings") return { data: state.booking, error: null };
                    if (table === "tour_availability_rules") return { data: state.rule, error: null };
                    if (table === "opportunities") return { data: state.opportunity, error: null };
                    return { data: null, error: null };
                },
            };
            return b;
        },
    }),
}));

import { POST as bookPOST } from "@/app/api/public/tour-booking/[token]/book/route";

const params = Promise.resolve({ token: "tok" });
const validBody = { rule_id: RULE, start_at: START, end_at: "2026-08-10T17:00:00.000Z", timezone: "America/Los_Angeles" };

async function book(body: unknown = validBody) {
    const req = new Request("https://x.test/api", { method: "POST", body: JSON.stringify(body) }) as never;
    const res = await bookPOST(req, { params });
    let json: Record<string, unknown> = {};
    try { json = (await res.clone().json()) as Record<string, unknown>; } catch { /* empty */ }
    return { status: res.status, json };
}

beforeEach(() => {
    vi.clearAllMocks();
    availableSlots = [slot()];
    state = {
        link: link(),
        invitation: invitation(),
        booking: null,
        rule: { id: RULE, org_id: ORG, location_id: LOC, approval_required: false, is_active: true },
        opportunity: { id: OPP, org_id: ORG, primary_person_id: PERSON, primary_contact_id: null, location_id: LOC },
        consumeAttempts: [],
        alreadyConsumed: false,
    };
    createMock.mockResolvedValue({
        id: BOOKING, org_id: ORG, opportunity_id: OPP, status_key: "confirmed",
        start_at: START, end_at: "2026-08-10T17:00:00.000Z", timezone: "America/Los_Angeles",
    });
    eventMock.mockResolvedValue({ recorded: true });
});

describe("4. the invitation action is consumed exactly once", () => {
    it("books through the canonical service and consumes once", async () => {
        const { status, json } = await book();
        expect(status).toBe(201);
        expect(json.ok).toBe(true);
        expect(createMock).toHaveBeenCalledTimes(1);
        expect(state.consumeAttempts.filter((a) => a.matched)).toHaveLength(1);
    });

    it("never creates a second booking service call for one request", async () => {
        await book();
        expect(createMock).toHaveBeenCalledTimes(1);
    });
});

describe("5. replaying the same request returns the existing successful result", () => {
    it("a consumed credential bound to a booking replays instead of rebooking", async () => {
        state.link = link({ consumed_at: "2026-08-01T00:00:00Z", booking_id: BOOKING });
        state.booking = { id: BOOKING, status_key: "confirmed", start_at: START, end_at: "2026-08-10T17:00:00.000Z", timezone: "America/Los_Angeles" };

        const { status, json } = await book();

        expect(status).toBe(200);
        expect(json.ok).toBe(true);
        expect(json.idempotent_replay).toBe(true);
        // The parent gets the booking they already have — not a second one.
        expect(createMock).not.toHaveBeenCalled();
    });
});

describe("10. two concurrent attempts converge to one booking", () => {
    it("only one racer consumes the action", async () => {
        // Both requests authorize against the same un-consumed credential.
        const [a, b] = await Promise.all([book(), book()]);

        const matched = state.consumeAttempts.filter((x) => x.matched);
        expect(matched).toHaveLength(1);
        // Neither parent sees a failure implying they did something wrong.
        expect([a.status, b.status].every((s) => s === 200 || s === 201 || s === 409)).toBe(true);
    });
});

describe("9. hostile and out-of-lifecycle credentials cannot book", () => {
    it("an unknown token books nothing", async () => {
        state.link = null;
        const { status } = await book();
        expect(status).toBe(404);
        expect(createMock).not.toHaveBeenCalled();
    });

    it("a wrong-action credential books nothing", async () => {
        state.link = link({ action_kind: "decline_tour" });
        const { status } = await book();
        expect(status).toBe(404);
        expect(createMock).not.toHaveBeenCalled();
    });

    it("an expired credential books nothing", async () => {
        state.link = link({ expires_at: "2020-01-01T00:00:00Z" });
        await book();
        expect(createMock).not.toHaveBeenCalled();
    });

    it("a revoked credential books nothing", async () => {
        state.link = link({ revoked_at: "2026-01-01T00:00:00Z" });
        await book();
        expect(createMock).not.toHaveBeenCalled();
    });

    it("a legacy unscoped link books nothing", async () => {
        state.link = link({ authorization_model: "legacy_unscoped", invitation_id: null, recipient_person_id: null });
        await book();
        expect(createMock).not.toHaveBeenCalled();
    });

    it("a credential whose recipient does not match the invitation books nothing", async () => {
        state.link = link({ recipient_person_id: OTHER_PERSON });
        await book();
        expect(createMock).not.toHaveBeenCalled();
    });

    it("a slot that is not live books nothing, and the action stays retryable", async () => {
        availableSlots = [];
        const { status } = await book();
        expect(status).toBe(409);
        expect(createMock).not.toHaveBeenCalled();
        expect(state.consumeAttempts.filter((a) => a.matched)).toHaveLength(0);
    });

    it("an arbitrary submitted slot cannot book", async () => {
        const { status } = await book({ ...validBody, start_at: "2026-12-25T09:00:00.000Z" });
        expect(status).toBe(409);
        expect(createMock).not.toHaveBeenCalled();
    });
});
