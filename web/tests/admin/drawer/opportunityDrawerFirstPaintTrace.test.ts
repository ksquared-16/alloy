import { describe, expect, it } from "vitest";
import {
    recordOpportunityDrawerPostOpenFetch,
    reportDrawerAboveFoldStable,
    resetOpportunityDrawerFirstPaintTrace,
} from "@/lib/perf/opportunityDrawerFirstPaintTrace";

describe("opportunityDrawerFirstPaintTrace", () => {
    it("counts post-open fetches per opportunity", () => {
        resetOpportunityDrawerFirstPaintTrace("opp-1");
        recordOpportunityDrawerPostOpenFetch("opp-1", "activity_signal");
        recordOpportunityDrawerPostOpenFetch("opp-1", "tour_bookings");
        expect(() => reportDrawerAboveFoldStable("opp-1")).not.toThrow();
    });
});
