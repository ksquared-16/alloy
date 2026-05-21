import { describe, expect, it, beforeEach } from "vitest";
import {
    allowOpportunityDrawerFullRefetch,
    finishOpportunityDrawerHydrate,
    resetOpportunityDrawerHydrateGuards,
    tryBeginOpportunityDrawerHydrate,
    tryScheduleOpportunityDrawerBackgroundFull,
} from "@/lib/admin/opportunityDrawerHydrateGuards";

describe("opportunityDrawerHydrateGuards", () => {
    const id = "opp-test-1";

    beforeEach(() => {
        resetOpportunityDrawerHydrateGuards(id);
    });

    it("allows primary hydrate only once per open", () => {
        expect(tryBeginOpportunityDrawerHydrate(id, "primary")).toBe(true);
        expect(tryBeginOpportunityDrawerHydrate(id, "primary")).toBe(false);
        finishOpportunityDrawerHydrate(id, "primary", "success");
        expect(tryBeginOpportunityDrawerHydrate(id, "primary")).toBe(false);
    });

    it("allows full hydrate only once per open", () => {
        expect(tryBeginOpportunityDrawerHydrate(id, "full")).toBe(true);
        expect(tryBeginOpportunityDrawerHydrate(id, "full")).toBe(false);
        finishOpportunityDrawerHydrate(id, "full", "success");
        expect(tryBeginOpportunityDrawerHydrate(id, "full")).toBe(false);
    });

    it("schedules background full only once until refetch allowance", () => {
        expect(tryScheduleOpportunityDrawerBackgroundFull(id)).toBe(true);
        expect(tryScheduleOpportunityDrawerBackgroundFull(id)).toBe(false);
        allowOpportunityDrawerFullRefetch(id);
        expect(tryScheduleOpportunityDrawerBackgroundFull(id)).toBe(true);
    });
});
