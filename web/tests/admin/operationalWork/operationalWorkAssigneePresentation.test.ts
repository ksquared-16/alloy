import { describe, expect, it } from "vitest";

import {
    operationalWorkAssigneeCompactLabel,
    operationalWorkAssigneeDetailLabel,
} from "@/lib/admin/operationalWork/operationalWorkAssigneePresentation";

const me = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";

describe("operationalWorkAssigneePresentation", () => {
    it("uses Unassigned when no assignee", () => {
        expect(
            operationalWorkAssigneeCompactLabel({
                assignedToUserId: null,
                assigneeLabel: null,
                currentUserId: me,
            })
        ).toBe("Unassigned");
    });

    it("uses Mine for current user", () => {
        expect(
            operationalWorkAssigneeCompactLabel({
                assignedToUserId: me,
                assigneeLabel: "kelly",
                currentUserId: me,
            })
        ).toBe("Mine");
    });

    it("uses assignee label for other users", () => {
        expect(
            operationalWorkAssigneeDetailLabel({
                assignedToUserId: other,
                assigneeLabel: "alex",
                currentUserId: me,
            })
        ).toBe("alex");
    });
});
