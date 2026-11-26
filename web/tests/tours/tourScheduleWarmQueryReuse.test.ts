/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    clearWarmTourScheduleForTests,
    peekWarmTourSchedule,
    peekWarmTourScheduleForQuery,
    prefetchTourSchedule,
} from "@/lib/tours/tourScheduleWarmCache";

/**
 * R-005 — the second instance of the warm-cache bypass.
 *
 * `OpportunityTourSlotSchedulePanel` peeked this cache to paint synchronously, then re-fetched
 * `tours/slots` and `tours/availability-rules` unconditionally — two of the three endpoints the
 * cache already held. Same shape as the form-delivery defect (R-003).
 *
 * It could not simply reuse the warm value, which is why it was reported rather than half-fixed:
 * the panel's query is not always the warmed one. A reschedule adds `exclude_booking_id`, and
 * paging past page 0 moves the window. Both are genuinely different queries.
 *
 * The cache now answers "do I hold THIS query?" so the panel never has to guess. These assert
 * that the answer is correct in both directions — reuse on the common path, and a real fetch
 * whenever the query differs.
 */

const OID = "opp-1";
const LOC = "loc-1";
const TTL_MS = 45_000;

let calls: string[];

function resourceOf(url: string): string {
    if (url.includes("/bookings")) return "bookings";
    if (url.includes("/tours/slots")) return "slots";
    if (url.includes("availability-rules")) return "rules";
    return `other:${url}`;
}
const counts = () => {
    const out: Record<string, number> = {};
    for (const c of calls) out[resourceOf(c)] = (out[resourceOf(c)] ?? 0) + 1;
    return out;
};

function bodyFor(url: string): unknown {
    if (url.includes("/bookings")) return { bookings: [] };
    if (url.includes("/tours/slots")) return { slots: [{ id: "s1", rule_id: "r1" }] };
    return { rules: [{ id: "r1", approval_required: true }] };
}

beforeEach(() => {
    calls = [];
    clearWarmTourScheduleForTests();
    vi.stubGlobal("window", {} as unknown as Window);
    vi.stubGlobal("fetch", ((input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        return Promise.resolve({ ok: true, json: async () => bodyFor(url) });
    }) as unknown as typeof fetch);
});

afterEach(() => {
    vi.unstubAllGlobals();
    clearWarmTourScheduleForTests();
});

describe("tour schedule — warm entry is reused only for the query it covers", () => {
    it("warming fetches each resource exactly once", async () => {
        await prefetchTourSchedule(OID, LOC);
        expect(counts()).toEqual({ bookings: 1, slots: 1, rules: 1 });
    });

    it("the warmed window is reusable — the common path costs ZERO further requests", async () => {
        const warm = await prefetchTourSchedule(OID, LOC);
        expect(warm).not.toBeNull();
        calls = [];

        const hit = peekWarmTourScheduleForQuery(OID, LOC, {
            windowFrom: new Date(warm!.windowFromIso),
            windowTo: new Date(warm!.windowToIso),
            excludeBookingId: null,
        });
        expect(hit).not.toBeNull();
        expect(hit!.slots).toHaveLength(1);
        expect(counts()).toEqual({});
    });

    it("a RESCHEDULE excludes a booking, so the warm entry must NOT be reused", async () => {
        const warm = await prefetchTourSchedule(OID, LOC);
        expect(
            peekWarmTourScheduleForQuery(OID, LOC, {
                windowFrom: new Date(warm!.windowFromIso),
                windowTo: new Date(warm!.windowToIso),
                excludeBookingId: "booking-9",
            }),
            "excluding a booking changes which slots are free — reusing here would show a taken slot as available",
        ).toBeNull();
    });

    it("a PAGED window is a different query, so the warm entry must NOT be reused", async () => {
        const warm = await prefetchTourSchedule(OID, LOC);
        const laterFrom = new Date(new Date(warm!.windowFromIso).getTime() + 7 * 86_400_000);
        const laterTo = new Date(new Date(warm!.windowToIso).getTime() + 7 * 86_400_000);
        expect(
            peekWarmTourScheduleForQuery(OID, LOC, {
                windowFrom: laterFrom,
                windowTo: laterTo,
                excludeBookingId: null,
            }),
        ).toBeNull();
    });

    it("a stale entry is not reused", async () => {
        const warm = await prefetchTourSchedule(OID, LOC, 0);
        expect(
            peekWarmTourScheduleForQuery(
                OID,
                LOC,
                {
                    windowFrom: new Date(warm!.windowFromIso),
                    windowTo: new Date(warm!.windowToIso),
                    excludeBookingId: null,
                },
                TTL_MS + 1,
            ),
        ).toBeNull();
        expect(peekWarmTourSchedule(OID, LOC, TTL_MS + 1)).toBeNull();
    });

    it("the panel consumes the cache's answer instead of deciding for itself", () => {
        // The counts above only hold while this does. The original defect was a consumer that
        // bypassed the cache, so a cache-only test would have passed against the broken code.
        const src = readFileSync(
            join(__dirname, "..", "..", "components/admin/opportunity/tours/OpportunityTourSlotSchedulePanel.tsx"),
            "utf8",
        );
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(code).toContain("peekWarmTourScheduleForQuery(");
        // It still owns the genuinely-different queries, so the fetch stays.
        expect(code).toContain("/api/admin/tours/slots?");
    });
});
