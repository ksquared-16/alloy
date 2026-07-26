import { describe, expect, it } from "vitest";

import type { AssignmentRosterReadModel } from "@/lib/scheduling/roster/buildAssignmentRosterReadModel";

describe("assignment roster read model shape", () => {
    it("groups multiple assignments under one subject with primary first", () => {
        const model: AssignmentRosterReadModel = {
            subjects: [
                {
                    agreementId: "a1",
                    customerMemberId: "cm1",
                    childName: "Alex",
                    subjectType: "child",
                    assignmentCount: 2,
                    primaryRoom: "Blue Room",
                    assignments: [
                        {
                            assignmentId: "as1",
                            agreementId: "a1",
                            customerMemberId: "cm1",
                            childName: "Alex",
                            subjectType: "child",
                            isPrimary: true,
                            roleLabel: "Primary",
                            assignmentTypeLabel: "Primary classroom",
                            roomName: "Blue Room",
                            weekdaysLabel: "Mon, Wed, Fri",
                            effectiveFrom: "2026-08-01",
                            effectiveTo: null,
                            status: "active",
                        },
                        {
                            assignmentId: "as2",
                            agreementId: "a1",
                            customerMemberId: "cm1",
                            childName: "Alex",
                            subjectType: "child",
                            isPrimary: false,
                            roleLabel: "Secondary",
                            assignmentTypeLabel: "After school",
                            roomName: "Green Room",
                            weekdaysLabel: "Tue, Thu",
                            effectiveFrom: "2026-08-01",
                            effectiveTo: null,
                            status: "active",
                        },
                    ],
                },
            ],
            totalAssignments: 2,
            staffReady: true,
        };

        expect(model.subjects[0].assignmentCount).toBe(2);
        expect(model.subjects[0].assignments[0].roleLabel).toBe("Primary");
        expect(model.subjects[0].primaryRoom).toBe("Blue Room");
    });
});
