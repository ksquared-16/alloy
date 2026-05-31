import { describe, expect, it } from "vitest";
import {
    formatPlacementBucketLabel,
    normalizePlacementBucketKeyForDisplay,
    TIER_EMPLOYEE_FAMILY_BUCKET,
    TIER_GENERAL_WAITLIST_BUCKET,
} from "@/lib/orchestration/placement/placementBucketLabels";

describe("placementBucketLabels", () => {
    it("never surfaces literal unknown in operator labels", () => {
        expect(formatPlacementBucketLabel("unknown")).toBe("Standard family");
        expect(formatPlacementBucketLabel("")).toBe("Standard family");
    });

    it("maps legacy tier_staff_community to employee family display", () => {
        expect(normalizePlacementBucketKeyForDisplay("tier_staff_community")).toBe(TIER_EMPLOYEE_FAMILY_BUCKET);
        expect(formatPlacementBucketLabel("tier_staff_community")).toBe("Employee family");
    });

    it("labels general waitlist as Standard family", () => {
        expect(formatPlacementBucketLabel(TIER_GENERAL_WAITLIST_BUCKET)).toBe("Standard family");
    });

    it("labels employee bucket distinctly from staff/community legacy", () => {
        expect(formatPlacementBucketLabel(TIER_EMPLOYEE_FAMILY_BUCKET)).toBe("Employee family");
    });
});
