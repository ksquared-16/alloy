/**
 * Room fit: the two defects that marked a 30-month-old Toddler "ineligible" for every room.
 */
import { describe, expect, it } from "vitest";

import { ageBoundToMonths, ageInMonthsAsOf } from "@/lib/operationalCalculations/families/placement";
import { roomProgramFit } from "@/lib/scheduling/options/generatePlacementOptions";

describe("age bounds in years cover the whole final year", () => {
    it("a 1–2 years room takes a child who is still two", () => {
        const min = ageBoundToMonths(1, "years", "min");
        const max = ageBoundToMonths(2, "years", "max");
        expect(min).toBe(12);
        expect(max).toBe(35);
        const age = ageInMonthsAsOf("2024-04-02", "2026-10-20");
        expect(age).toBe(30);
        expect(age! <= max!).toBe(true);
    });

    it("the child is too old only once they turn three", () => {
        expect(ageInMonthsAsOf("2024-04-02", "2027-04-02")! > ageBoundToMonths(2, "years", "max")!).toBe(true);
    });

    it("month bounds stay exact, and a lower bound is never widened", () => {
        expect(ageBoundToMonths(24, "months", "max")).toBe(24);
        expect(ageBoundToMonths(2, "years")).toBe(24);
    });
});

describe("program fit uses the room's configured Program", () => {
    it("the same Program matches; a different one does not", () => {
        expect(
            roomProgramFit({ childProgramCategoryId: "p-toddler", roomProgramCategoryId: "p-toddler", childAgeGroup: null, roomAgeGroup: null }),
        ).toEqual({ programKnown: true, programMatch: true });
        expect(
            roomProgramFit({ childProgramCategoryId: "p-toddler", roomProgramCategoryId: "p-preschool", childAgeGroup: null, roomAgeGroup: null }),
        ).toEqual({ programKnown: true, programMatch: false });
    });

    it("without a room Program, age groups compare case-insensitively", () => {
        expect(
            roomProgramFit({ childProgramCategoryId: "p-toddler", roomProgramCategoryId: null, childAgeGroup: "toddler", roomAgeGroup: "Toddler" }),
        ).toEqual({ programKnown: true, programMatch: true });
    });

    it("an unknowable comparison gives no verdict — never 'different program'", () => {
        expect(
            roomProgramFit({ childProgramCategoryId: "p-toddler", roomProgramCategoryId: null, childAgeGroup: "toddler", roomAgeGroup: null }),
        ).toEqual({ programKnown: false, programMatch: false });
        expect(
            roomProgramFit({ childProgramCategoryId: null, roomProgramCategoryId: "p-toddler", childAgeGroup: null, roomAgeGroup: null }).programKnown,
        ).toBe(false);
    });
});
