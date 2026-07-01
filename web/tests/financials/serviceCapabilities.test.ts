import { describe, expect, it } from "vitest";
import {
    defaultCapabilities,
    isPricedByRatePlans,
    normalizeCapabilities,
    rhythmOf,
    SERVICE_CAPABILITIES,
    SERVICE_RHYTHM_LABEL,
} from "@/lib/financials/services/serviceCapabilities";

describe("service capabilities — rhythm", () => {
    it("maps service_type onto billing rhythm", () => {
        expect(rhythmOf("recurring")).toBe("recurring");
        expect(rhythmOf("one_time")).toBe("one_time");
        expect(rhythmOf("usage")).toBe("usage");
        expect(rhythmOf("attendance_derived")).toBe("usage");
        expect(SERVICE_RHYTHM_LABEL[rhythmOf("recurring")]).toBe("Recurring");
    });
});

describe("service capabilities — defaults by rhythm", () => {
    it("recurring care switches everything on", () => {
        const caps = defaultCapabilities("recurring");
        expect(SERVICE_CAPABILITIES.every((c) => caps[c])).toBe(true);
    });

    it("one-time switches operations off but stays portal-visible", () => {
        const caps = defaultCapabilities("one_time");
        expect(caps.creates_schedule).toBe(false);
        expect(caps.uses_rate_plans).toBe(false);
        expect(caps.parent_portal_visible).toBe(true);
    });

    it("attendance-derived tracks attendance, usage does not", () => {
        expect(defaultCapabilities("attendance_derived").tracks_attendance).toBe(true);
        expect(defaultCapabilities("usage").tracks_attendance).toBe(false);
    });
});

describe("service capabilities — normalize + pricing reveal", () => {
    it("fills missing capabilities from the type default and keeps explicit overrides", () => {
        const caps = normalizeCapabilities({ uses_rate_plans: false }, "recurring");
        expect(caps.uses_rate_plans).toBe(false); // explicit override
        expect(caps.creates_schedule).toBe(true); // default retained
    });

    it("ignores junk and returns a complete map", () => {
        const caps = normalizeCapabilities("nonsense", "one_time");
        expect(SERVICE_CAPABILITIES.every((c) => typeof caps[c] === "boolean")).toBe(true);
    });

    it("isPricedByRatePlans reflects the switch", () => {
        expect(isPricedByRatePlans(defaultCapabilities("recurring"))).toBe(true);
        expect(isPricedByRatePlans(defaultCapabilities("one_time"))).toBe(false);
    });
});
