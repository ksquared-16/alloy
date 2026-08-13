import { describe, expect, it } from "vitest";

import type { AssignmentRosterReadModel } from "@/lib/scheduling/roster/buildAssignmentRosterReadModel";

describe("assignment roster read model shape", () => {
    it("groups multiple assignments under one subject with primary first", () => {
        const model: AssignmentRosterReadModel = {
            subjects: [
                {
                    subjectKey: "agreement:a1",
                    subjectName: "Alex",
                    customerMemberId: "cm1",
                    enrollmentAgreementId: "a1",
                    subjectType: "child",
                    assignmentCount: 2,
                    primaryRoom: "Blue Room",
                    assignments: [
                        {
                            assignmentId: "as1",
                            subjectKey: "agreement:a1",
                            subjectName: "Alex",
                            customerMemberId: "cm1",
                            enrollmentAgreementId: "a1",
                            subjectType: "child",
                            isPrimary: true,
                            roleLabel: "Primary",
                            assignmentTypeLabel: "Primary classroom",
                            roomName: "Blue Room",
                            weekdaysLabel: "Mon, Wed, Fri",
                            effectiveFrom: "2026-08-01",
                            effectiveTo: null,
                            status: "active",
                            lifecycleLabel: "Active",
                            commitmentKind: "committed",
                        },
                        {
                            assignmentId: "as2",
                            subjectKey: "agreement:a1",
                            subjectName: "Alex",
                            customerMemberId: "cm1",
                            enrollmentAgreementId: "a1",
                            subjectType: "child",
                            isPrimary: false,
                            roleLabel: "Secondary",
                            assignmentTypeLabel: "After school",
                            roomName: "Green Room",
                            weekdaysLabel: "Tue, Thu",
                            effectiveFrom: "2026-08-01",
                            effectiveTo: null,
                            status: "active",
                            lifecycleLabel: "Active",
                            commitmentKind: "committed",
                        },
                    ],
                },
            ],
            totalAssignments: 2,
            staffSubjectCount: 0,
        };

        expect(model.subjects[0].assignmentCount).toBe(2);
        expect(model.subjects[0].assignments[0].roleLabel).toBe("Primary");
        expect(model.subjects[0].primaryRoom).toBe("Blue Room");
    });

    it("models a staff subject without child fields", () => {
        // Staff carry no customer member and no enrollment agreement — the DB
        // constraint requires both to be NULL. The type must permit that shape
        // rather than forcing staff through child-shaped fields.
        const staff: AssignmentRosterReadModel = {
            subjects: [
                {
                    subjectKey: "staff:person-1",
                    subjectName: "Jane Wilson",
                    customerMemberId: null,
                    enrollmentAgreementId: null,
                    positionLabel: "Lead Teacher",
                    subjectType: "staff",
                    assignmentCount: 1,
                    primaryRoom: "Toddler Room A",
                    assignments: [
                        {
                            assignmentId: "as-staff-1",
                            subjectKey: "staff:person-1",
                            subjectName: "Jane Wilson",
                            customerMemberId: null,
                            enrollmentAgreementId: null,
                            personId: "person-1",
                            positionLabel: "Lead Teacher",
                            subjectType: "staff",
                            isPrimary: true,
                            roleLabel: "Primary",
                            assignmentTypeLabel: null,
                            roomName: "Toddler Room A",
                            weekdaysLabel: "Mon, Tue, Wed, Thu, Fri",
                            effectiveFrom: "2026-08-17",
                            effectiveTo: null,
                            status: "active",
                            lifecycleLabel: "Active",
                            commitmentKind: "committed",
                        },
                    ],
                },
            ],
            totalAssignments: 1,
            staffSubjectCount: 1,
        };

        expect(staff.subjects[0].subjectType).toBe("staff");
        expect(staff.subjects[0].customerMemberId).toBeNull();
        expect(staff.staffSubjectCount).toBe(1);
    });
});
