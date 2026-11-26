import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * K6 / H2 — the PUBLIC invitation page offered today's (and earlier days') times: its month view asks
 * from the first of the month. The booking service refuses them; the page must not offer them.
 */
const m = vi.hoisted(() => ({ slots: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/tours/availability/computeAvailableTourSlots", () => ({ computeAvailableTourSlots: async () => m.slots }));
vi.mock("@/lib/tours/events/recordTourEvent", () => ({ recordTourEvent: async () => undefined }));
vi.mock("@/lib/tours/public/tourActionRouteGuard", () => ({
    guardTourActionRoute: async () => ({
        ok: true,
        supabase: {},
        auth: { capability: { readsAvailability: true }, link: { org_id: "o", location_id: "l" }, invitation: { id: "i", recipient_person_id: "p", opportunity_id: "op", conversation_thread_id: null }, actionKind: "view_tour_slots" },
    }),
}));

import { GET } from "@/app/api/public/tour-booking/[token]/slots/route";

const tz = "America/Los_Angeles";
beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T19:00:00Z")); // Oct 16, noon in Bend
});
afterAll(() => vi.useRealTimers());

describe("public tour slots", () => {
    it("offers only tomorrow onward in the site's calendar", async () => {
        m.slots = [
            { startAt: "2026-10-02T17:00:00.000Z", timezone: tz }, // earlier this month
            { startAt: "2026-10-16T22:00:00.000Z", timezone: tz }, // later today (3 PM local)
            { startAt: "2026-10-17T17:00:00.000Z", timezone: tz }, // tomorrow
            { startAt: "2026-10-19T17:00:00.000Z", timezone: tz }, // future
        ];
        const res = await GET(
            new NextRequest("http://x/api/public/tour-booking/t/slots?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z"),
            { params: Promise.resolve({ token: "t" }) },
        );
        const body = (await res.json()) as { slots: Array<{ startAt: string }> };
        expect(body.slots.map((s) => s.startAt)).toEqual(["2026-10-17T17:00:00.000Z", "2026-10-19T17:00:00.000Z"]);
    });
});
