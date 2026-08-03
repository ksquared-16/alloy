/**
 * The resolve route — Parent Action Completion.
 *
 * Drives the REAL handler through the REAL guard and authorizer. Only the database
 * is doubled.
 *
 * The case that matters most: Slice C accepted VIEWING credentials only, but the
 * invitation email's per-option links are `select_tour_slot` tokens. That combination
 * meant opening the primary call-to-action returned 404 before the parent saw
 * anything — a broken customer journey that no unit test covered because no test
 * drove resolve at all.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const OPP = "22222222-0000-4000-8000-00000000000c";
const LOC = "33333333-0000-4000-8000-00000000000d";
const INV = "44444444-0000-4000-8000-00000000000e";
const BOOKING = "55555555-0000-4000-8000-00000000000f";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

type State = {
    link: Record<string, unknown> | null;
    invitation: Record<string, unknown> | null;
    booking: Record<string, unknown> | null;
    opportunity: Record<string, unknown> | null;
    location: Record<string, unknown> | null;
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
            const b: Record<string, unknown> = {
                select: () => b,
                eq: () => b,
                is: () => b,
                in: () => b,
                limit: () => b,
                update: () => b,
                maybeSingle: async () => {
                    if (table === "tour_public_booking_links") return { data: state.link, error: null };
                    if (table === "tour_invitations") return { data: state.invitation, error: null };
                    if (table === "tour_bookings") return { data: state.booking, error: null };
                    if (table === "opportunities") return { data: state.opportunity, error: null };
                    if (table === "locations") return { data: state.location, error: null };
                    return { data: null, error: null };
                },
            };
            return b;
        },
    }),
}));
vi.mock("@/lib/tours/public/tourPublicRateLimit", () => ({ takeTourPublicRateLimit: () => null }));

import { GET as resolveGET } from "@/app/api/public/tour-booking/[token]/resolve/route";

const params = Promise.resolve({ token: "tok" });

async function call() {
    const res = await resolveGET(new Request("https://x.test/api") as never, { params });
    let json: Record<string, unknown> = {};
    try { json = (await res.clone().json()) as Record<string, unknown>; } catch { /* empty */ }
    return { status: res.status, json, view: json.view as Record<string, unknown> | undefined };
}

beforeEach(() => {
    state = {
        link: link(),
        invitation: invitation(),
        booking: null,
        opportunity: { name: "Rowan Reyes", org_id: ORG },
        location: { label: "Northwind — Downtown", org_id: ORG },
    };
});

describe("every invitation credential can ask what it is for", () => {
    it.each([
        "select_tour_slot",
        "view_tour_slots",
        "view_tour_details",
        "decline_tour",
        "confirm_tour",
        "reschedule_tour",
        "cancel_tour",
    ])("a %s token resolves", async (kind) => {
        state.link = link({ action_kind: kind });
        const { status, view } = await call();
        expect(status).toBe(200);
        expect(view).toBeTruthy();
        expect(String(view!.headline).length).toBeGreaterThan(0);
    });

    it("the email's per-option link is the regression this closes", async () => {
        // Exactly what `sendTourInvitation` mints for each offered time.
        state.link = link({ action_kind: "select_tour_slot" });
        const { status, view } = await call();
        expect(status).toBe(200);
        expect(view!.state).toBe("choose");
        expect(view!.showsOptions).toBe(true);
    });
});

describe("resolve discloses meaning, never identifiers", () => {
    it("returns no ids or internal status anywhere in the payload", async () => {
        state.link = link({ booking_id: BOOKING, action_kind: "confirm_tour" });
        state.booking = { status_key: "pending_approval", start_at: "2026-08-10T16:00:00Z", timezone: "America/Los_Angeles" };
        const { json } = await call();
        const raw = JSON.stringify(json);
        for (const secret of [ORG, PERSON, OPP, LOC, INV, BOOKING, "status_key", "pending_approval", "confirm_tour", "select_tour_slot"]) {
            expect(raw, `${secret} was disclosed`).not.toContain(secret);
        }
    });

    it("shows a bound booking's time in the tour's timezone", async () => {
        state.link = link({ booking_id: BOOKING, action_kind: "confirm_tour" });
        state.booking = { status_key: "pending_approval", start_at: "2026-08-10T16:00:00Z", timezone: "America/Los_Angeles" };
        const { view } = await call();
        expect(view!.bookingLabel).toBe("Monday, August 10 · 9:00 AM");
        expect(view!.state).toBe("booked_pending");
    });

    it("never reads a booking the credential is not bound to", async () => {
        state.link = link({ booking_id: null, action_kind: "select_tour_slot" });
        state.booking = { status_key: "confirmed", start_at: "2026-08-10T16:00:00Z", timezone: "UTC" };
        const { view } = await call();
        // booking_id is null, so the bound-booking read must not happen.
        expect(view!.bookingLabel).toBeNull();
        expect(view!.state).toBe("choose");
    });
});

describe("terminal and hostile states", () => {
    it("an expired invitation resolves to a safe terminal state, not an error", async () => {
        state.invitation = invitation({ expires_at: "2020-01-01T00:00:00Z" });
        state.link = link({ action_kind: "view_tour_slots" });
        const { status, view } = await call();
        // The authorizer may refuse an expired credential outright; either way the
        // parent must never see a raw failure.
        if (status === 200) {
            expect(view!.state).toBe("expired");
            expect(view!.actions).toHaveLength(0);
        } else {
            expect([403, 404, 410]).toContain(status);
        }
    });

    it("a consumed credential does not invite the parent to act again", async () => {
        state.link = link({ action_kind: "decline_tour", consumed_at: "2026-08-01T00:00:00Z" });
        const { status, view } = await call();
        // 409 is the authorizer's own answer for a spent credential — a conflict,
        // not a not-found. The page renders it as "you've already replied".
        if (status === 200) {
            expect(view!.actions).toHaveLength(0);
        } else {
            expect([403, 404, 409, 410]).toContain(status);
        }
    });

    it("an unknown token reveals nothing", async () => {
        state.link = null;
        const { status, json } = await call();
        expect(status).toBe(404);
        expect(JSON.stringify(json)).not.toContain(ORG);
        expect(json.view).toBeUndefined();
    });

    // NOTE: cross-scope refusal is deliberately NOT asserted here. This suite's
    // database double ignores query filters, so such a case would prove the double
    // rather than the code. Recipient/org/invitation binding is certified against
    // the real authorizer in authorizeTourAction.test.ts.
});
