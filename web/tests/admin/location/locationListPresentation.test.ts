import { describe, expect, it } from "vitest";
import { formatLocationAgeRange, formatLocationTypeLabel } from "@/lib/admin/locationListPresentation";

describe("locationListPresentation", () => {
    it("formats site and room type labels for operators", () => {
        expect(formatLocationTypeLabel("site")).toBe("Site");
        expect(formatLocationTypeLabel("unit")).toBe("Room");
    });

    it("formats age range display", () => {
        expect(formatLocationAgeRange("2", "4")).toBe("2–4");
        expect(formatLocationAgeRange("2", null)).toBe("2");
    });
});
