import { describe, expect, it } from "vitest";
import { OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY } from "@/lib/admin/actions/lifecycleActionMetadataKeys";

describe("tour completed metadata key", () => {
    it("uses tour_completed_date for opportunity metadata stamping", () => {
        expect(OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY).toBe("tour_completed_date");
    });
});
