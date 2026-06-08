import { describe, expect, it } from "vitest";
import { normalizeIntakeOpportunityStatusKey } from "@/lib/forms/intake/normalizeIntakeOpportunityStatusKey";
import { opportunityMatchesEnrollmentNewLeadsQueue } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

describe("normalizeIntakeOpportunityStatusKey", () => {
    it("maps legacy new to new_inquiry", () => {
        expect(normalizeIntakeOpportunityStatusKey("new")).toBe("new_inquiry");
    });

    it("defaults empty to new_inquiry", () => {
        expect(normalizeIntakeOpportunityStatusKey(null)).toBe("new_inquiry");
    });

    it("passes through canonical pipeline keys", () => {
        expect(normalizeIntakeOpportunityStatusKey("new_inquiry")).toBe("new_inquiry");
    });
});

describe("enrollment pipeline new leads visibility", () => {
    it("matches new_inquiry and legacy new status keys", () => {
        expect(opportunityMatchesEnrollmentNewLeadsQueue("new_inquiry")).toBe(true);
        expect(opportunityMatchesEnrollmentNewLeadsQueue("new")).toBe(true);
        expect(opportunityMatchesEnrollmentNewLeadsQueue("tour_scheduled")).toBe(false);
    });
});
