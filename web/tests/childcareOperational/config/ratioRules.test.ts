import { describe, expect, it } from "vitest";
import {
    maxChildrenForStaff,
    ratioLimitedCapacity,
    requiredStaffForChildren,
    sortRatioTiers,
    type RatioTier,
} from "@/lib/childcareOperational/config/ratioRules";

// 1 staff up to 5, 2 staff up to 11, 3 staff up to 16
const TIERS: RatioTier[] = [
    { max_children: 11, required_staff: 2 },
    { max_children: 5, required_staff: 1 },
    { max_children: 16, required_staff: 3 },
];

describe("ratio rule tiers", () => {
    it("sorts tiers ascending by max_children", () => {
        expect(sortRatioTiers(TIERS).map((t) => t.max_children)).toEqual([5, 11, 16]);
    });

    it("returns the smallest covering tier's staff for tiered thresholds", () => {
        expect(requiredStaffForChildren(TIERS, 1).requiredStaff).toBe(1);
        expect(requiredStaffForChildren(TIERS, 5).requiredStaff).toBe(1);
        expect(requiredStaffForChildren(TIERS, 6).requiredStaff).toBe(2);
        expect(requiredStaffForChildren(TIERS, 11).requiredStaff).toBe(2);
        expect(requiredStaffForChildren(TIERS, 12).requiredStaff).toBe(3);
        expect(requiredStaffForChildren(TIERS, 16).requiredStaff).toBe(3);
    });

    it("zero children require zero staff", () => {
        expect(requiredStaffForChildren(TIERS, 0)).toEqual({ requiredStaff: 0, exceedsDefinedTiers: false });
    });

    it("flags counts above the highest tier", () => {
        const result = requiredStaffForChildren(TIERS, 17);
        expect(result.exceedsDefinedTiers).toBe(true);
        expect(result.requiredStaff).toBe(3);
    });

    it("reports empty tiers as exceeding for any positive count", () => {
        expect(requiredStaffForChildren([], 1)).toEqual({ requiredStaff: 0, exceedsDefinedTiers: true });
    });

    it("ratio-limited capacity is the highest tier max_children", () => {
        expect(ratioLimitedCapacity(TIERS)).toBe(16);
        expect(ratioLimitedCapacity([])).toBe(0);
    });

    it("max children for a staff count uses the highest covered tier", () => {
        expect(maxChildrenForStaff(TIERS, 1)).toBe(5);
        expect(maxChildrenForStaff(TIERS, 2)).toBe(11);
        expect(maxChildrenForStaff(TIERS, 3)).toBe(16);
        expect(maxChildrenForStaff(TIERS, 0)).toBe(0);
    });
});
