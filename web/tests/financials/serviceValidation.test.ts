import { describe, expect, it } from "vitest";
import { validateService, worstSeverity } from "@/lib/financials/services/serviceValidation";
import { defaultCapabilities } from "@/lib/financials/services/serviceCapabilities";

describe("service validation — operational consequence", () => {
    it("flags a recurring, rate-priced service with no price (attention)", () => {
        const findings = validateService({
            label: "Full-Time Care",
            serviceType: "recurring",
            capabilities: defaultCapabilities("recurring"),
            hasRatePlan: false,
            hasRevenueHome: true,
        });
        const pricing = findings.find((f) => f.target === "pricing");
        expect(pricing?.severity).toBe("attention");
        expect(pricing?.message).toContain("no tuition");
        expect(pricing?.fixLabel).toBe("Rate Plans");
    });

    it("does not flag pricing once a rate plan exists", () => {
        const findings = validateService({
            label: "Full-Time Care",
            serviceType: "recurring",
            capabilities: defaultCapabilities("recurring"),
            hasRatePlan: true,
            hasRevenueHome: true,
        });
        expect(findings.find((f) => f.target === "pricing")).toBeUndefined();
    });

    it("flags a missing revenue home (attention)", () => {
        const findings = validateService({
            label: "Meals",
            serviceType: "attendance_derived",
            capabilities: defaultCapabilities("attendance_derived"),
            hasRatePlan: false,
            hasRevenueHome: false,
        });
        expect(findings.find((f) => f.target === "revenue")?.severity).toBe("attention");
    });

    it("advises when attendance is tracked but no schedule is created", () => {
        const caps = { ...defaultCapabilities("recurring"), creates_schedule: false, tracks_attendance: true, uses_rate_plans: false };
        const findings = validateService({
            label: "Custom",
            serviceType: "recurring",
            capabilities: caps,
            hasRatePlan: true,
            hasRevenueHome: true,
        });
        const adv = findings.find((f) => f.target === "switchboard" && f.message.includes("attendance"));
        expect(adv?.severity).toBe("advisory");
    });

    it("worstSeverity surfaces attention over advisory", () => {
        const findings = validateService({
            label: "X",
            serviceType: "recurring",
            capabilities: defaultCapabilities("recurring"),
            hasRatePlan: false,
            hasRevenueHome: false,
        });
        expect(worstSeverity(findings)).toBe("attention");
    });
});
