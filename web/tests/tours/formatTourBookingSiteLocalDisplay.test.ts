import { describe, expect, it } from "vitest";
import { formatTourBookingInstantSiteLocal } from "@/lib/tours/opportunity/formatTourBookingSiteLocalDisplay";

describe("formatTourBookingInstantSiteLocal", () => {
    it("formats UTC instant in America/Los_Angeles (site wall, not viewer TZ)", () => {
        const s = formatTourBookingInstantSiteLocal("2026-05-11T15:00:00.000Z", "America/Los_Angeles");
        expect(s).toMatch(/05\/11\/2026/);
        expect(s).toMatch(/8:00\s*AM/i);
    });

    it("uses UTC fallback for invalid IANA", () => {
        const s = formatTourBookingInstantSiteLocal("2026-05-11T12:00:00.000Z", "Not/AZone");
        expect(s).toMatch(/05\/11\/2026/);
        expect(s).toMatch(/12:00\s*PM/i);
    });

    it("returns em dash for invalid instant", () => {
        expect(formatTourBookingInstantSiteLocal("not-a-date", "America/Los_Angeles")).toBe("—");
    });
});
