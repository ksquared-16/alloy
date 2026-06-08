import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { assertTourPublicSlotsQueryWindow, TOUR_PUBLIC_SLOTS_MAX_RANGE_MS } from "@/lib/tours/public/tourPublicSlotsWindow";
import { takeTourPublicRateLimit, resetTourPublicRateLimitForTests } from "@/lib/tours/public/tourPublicRateLimit";
import { resolveTourPublicBookingLinkByToken } from "@/lib/tours/public/resolveTourPublicBookingLink";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { loadTourPublicResolveLabels } from "@/lib/tours/public/loadTourPublicResolveLabels";
import type { TourPublicBookingLinkRow } from "@/lib/tours/public/resolveTourPublicBookingLink";

describe("assertTourPublicSlotsQueryWindow", () => {
    it("rejects invalid or inverted range", () => {
        const a = new Date("2026-06-01T12:00:00.000Z");
        expect(assertTourPublicSlotsQueryWindow(new Date("x"), a).ok).toBe(false);
        expect(assertTourPublicSlotsQueryWindow(a, a).ok).toBe(false);
        expect(assertTourPublicSlotsQueryWindow(a, new Date(a.getTime() - 1)).ok).toBe(false);
    });

    it("rejects ranges wider than the public cap", () => {
        const from = new Date("2026-06-01T12:00:00.000Z");
        const to = new Date(from.getTime() + TOUR_PUBLIC_SLOTS_MAX_RANGE_MS + 60_000);
        const r = assertTourPublicSlotsQueryWindow(from, to);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.message).toContain("too large");
    });

    it("accepts a range within the cap", () => {
        const from = new Date("2026-06-01T12:00:00.000Z");
        const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
        const r = assertTourPublicSlotsQueryWindow(from, to);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.to.getTime()).toBe(to.getTime());
    });
});

describe("takeTourPublicRateLimit", () => {
    beforeEach(() => resetTourPublicRateLimitForTests());
    afterEach(() => resetTourPublicRateLimitForTests());

    it("returns Retry-After seconds after exceeding the book window", () => {
        const req = new NextRequest("http://localhost/api/public/tour-booking/t/book");
        const token = "plain-token";
        for (let i = 0; i < 30; i++) {
            expect(takeTourPublicRateLimit(req, "book", token)).toBeNull();
        }
        const retry = takeTourPublicRateLimit(req, "book", token);
        expect(retry).not.toBeNull();
        expect(retry!).toBeGreaterThanOrEqual(1);
    });
});

describe("resolveTourPublicBookingLinkByToken", () => {
    it("rejects inactive links", async () => {
        const token = "inactive-plain";
        const token_hash = hashFormLinkToken(token);
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn().mockReturnThis(),
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            id: "1",
                            org_id: "o",
                            opportunity_id: "p",
                            location_id: "l",
                            expires_at: null,
                            is_active: false,
                        },
                        error: null,
                    }),
                })),
            })),
        } as never;
        const r = await resolveTourPublicBookingLinkByToken(supabase, token);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("INACTIVE");
    });
});

describe("loadTourPublicResolveLabels", () => {
    it("returns 404-style error when opportunity is missing for org (no cross-tenant labels)", async () => {
        const link: TourPublicBookingLinkRow = {
            id: "L1",
            org_id: "org-a",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            expires_at: null,
            is_active: true,
        };
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn().mockReturnThis(),
                            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                        })),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        } as never;
        const r = await loadTourPublicResolveLabels(supabase, link);
        expect("error" in r).toBe(true);
        if ("error" in r) {
            expect(r.status).toBe(404);
            expect(r.error).toContain("unknown");
        }
    });
});
