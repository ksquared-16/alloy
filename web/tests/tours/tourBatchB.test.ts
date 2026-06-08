import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveTourPublicBookingLinkByToken } from "@/lib/tours/public/resolveTourPublicBookingLink";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { assertBookingLocationMatchesOpportunity } from "@/lib/tours/admin/opportunityTourContext";
import { recordOpportunityDrawerLayoutIncludesSection } from "@/lib/recordChrome/types";

describe("resolveTourPublicBookingLinkByToken", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("rejects expired links", async () => {
        const token = "test-plain";
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
                            expires_at: "2026-05-01T00:00:00.000Z",
                            is_active: true,
                        },
                        error: null,
                    }),
                })),
            })),
        } as never;
        const r = await resolveTourPublicBookingLinkByToken(supabase, token);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("EXPIRED");
    });
});

describe("assertBookingLocationMatchesOpportunity", () => {
    it("blocks mismatched location when opportunity is pinned", () => {
        const r = assertBookingLocationMatchesOpportunity(
            { id: "1", org_id: "o", location_id: "loc-a", primary_person_id: null, primary_contact_id: null },
            "loc-b"
        );
        expect(r.ok).toBe(false);
    });

    it("allows any org location when opportunity has no pinned site", () => {
        const r = assertBookingLocationMatchesOpportunity(
            { id: "1", org_id: "o", location_id: null, primary_person_id: null, primary_contact_id: null },
            "loc-b"
        );
        expect(r.ok).toBe(true);
    });
});

describe("recordOpportunityDrawerLayoutIncludesSection", () => {
    it("detects tour_scheduling in overview_section_order", () => {
        expect(recordOpportunityDrawerLayoutIncludesSection({ overview_section_order: ["tour_scheduling", "notes"] }, "tour_scheduling")).toBe(true);
    });
});
