import { describe, expect, it } from "vitest";
import { resolveChildAgeDisplayLabel } from "@/lib/admin/drawer/childAgeDisplay";

describe("resolveChildAgeDisplayLabel", () => {
    it("uses Person DOB when person_id is linked", () => {
        expect(
            resolveChildAgeDisplayLabel({
                person_id: "p1",
                person_date_of_birth: "2021-03-10",
                member_dob: "2020-01-01",
            })
        ).toMatch(/^\d+y/);
    });

    it("falls back to member/inquiry DOB when unlinked", () => {
        expect(
            resolveChildAgeDisplayLabel({
                person_id: null,
                member_dob: "2024-01-22",
            })
        ).toMatch(/^\d+m$|^\d+y/);
    });

    it("returns null when no DOB", () => {
        expect(resolveChildAgeDisplayLabel({})).toBeNull();
    });
});
