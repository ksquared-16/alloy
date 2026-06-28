import { describe, expect, it } from "vitest";
import { serviceDateForInstant } from "@/lib/childcareOperational/attendance/attendanceServiceDate";

describe("serviceDateForInstant (org-local service day)", () => {
    it("derives different local service dates across a timezone boundary for one instant", () => {
        const instant = "2026-06-15T06:00:00Z"; // 06:00 UTC
        expect(serviceDateForInstant(instant, "America/Los_Angeles")).toBe("2026-06-14"); // 23:00 prior day
        expect(serviceDateForInstant(instant, "America/New_York")).toBe("2026-06-15"); // 02:00 same day
        expect(serviceDateForInstant(instant, "UTC")).toBe("2026-06-15");
    });

    it("late-evening local check-in stays on the local day, not the UTC next day", () => {
        // 2026-06-15 23:30 PDT == 2026-06-16 06:30 UTC
        const instant = "2026-06-16T06:30:00Z";
        expect(serviceDateForInstant(instant, "America/Los_Angeles")).toBe("2026-06-15");
        expect(serviceDateForInstant(instant, "UTC")).toBe("2026-06-16");
    });

    it("throws on an invalid timestamp", () => {
        expect(() => serviceDateForInstant("not-a-date", "UTC")).toThrow();
    });
});
