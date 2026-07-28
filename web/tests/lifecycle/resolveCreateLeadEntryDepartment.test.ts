import { describe, expect, it } from "vitest";

import { selectCreateLeadEntryDepartment } from "@/lib/lifecycle/resolveCreateLeadEntryDepartment";

describe("selectCreateLeadEntryDepartment", () => {
    it("implies the single department whose lifecycle resolves an entry work unit", () => {
        const resolution = selectCreateLeadEntryDepartment([
            { departmentId: "dept-enrollment", workUnitId: "wu-lead" },
            // Configured department with no create-lead entry — never a candidate.
            { departmentId: "dept-finance", workUnitId: null },
        ]);
        expect(resolution).toEqual({
            state: "resolved",
            departmentId: "dept-enrollment",
            workUnitId: "wu-lead",
        });
    });

    it("reports none when no department can host create lead", () => {
        expect(selectCreateLeadEntryDepartment([{ departmentId: "dept-a", workUnitId: null }])).toEqual({
            state: "none",
        });
        expect(selectCreateLeadEntryDepartment([])).toEqual({ state: "none" });
    });

    it("never guesses between two capable departments", () => {
        // The pre-fix workspace picked whichever sorted first; ambiguity must reach the operator.
        const resolution = selectCreateLeadEntryDepartment([
            { departmentId: "dept-a", workUnitId: "wu-a" },
            { departmentId: "dept-b", workUnitId: "wu-b" },
        ]);
        expect(resolution).toEqual({ state: "ambiguous", departmentIds: ["dept-a", "dept-b"] });
    });

    it("ignores blank ids and blank work units rather than treating them as capable", () => {
        expect(
            selectCreateLeadEntryDepartment([
                { departmentId: "dept-a", workUnitId: "   " },
                { departmentId: "  ", workUnitId: "wu-b" },
                { departmentId: "dept-c", workUnitId: "wu-c" },
            ])
        ).toEqual({ state: "resolved", departmentId: "dept-c", workUnitId: "wu-c" });
    });
});
