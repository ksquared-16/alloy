import { describe, expect, it, vi, beforeEach } from "vitest";

import { assignmentDeleteProposedAction } from "@/lib/adminV2/actions/definitions/assignmentDeleteProposedAction";
import {
    customerMemberIdFromProposedDraftAssignmentId,
    isProposedDraftAssignmentId,
} from "@/lib/scheduling/projection/proposedDraftAssignmentId";

vi.mock("@/lib/childcareOperational/applyChildParticipationEdit", () => ({
    applyChildParticipationEdit: vi.fn().mockResolvedValue({
        ok: true,
        routed: "process_instance",
        updated: ["schedule_type", "program_room_cohort_key", "start_date"],
    }),
}));

vi.mock("@/lib/operationalAssignments/operationalAssignmentService", () => ({
    deleteProposedOperationalAssignment: vi.fn(),
}));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue(undefined),
}));

import { applyChildParticipationEdit } from "@/lib/childcareOperational/applyChildParticipationEdit";
import { deleteProposedOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";

describe("proposed draft assignment id", () => {
    it("detects synthetic proposed:<member> ids", () => {
        expect(isProposedDraftAssignmentId("proposed:05cf9138-7f4f-482c-a839-4644359985d1")).toBe(true);
        expect(isProposedDraftAssignmentId("05cf9138-7f4f-482c-a839-4644359985d1")).toBe(false);
        expect(customerMemberIdFromProposedDraftAssignmentId("proposed:abc")).toBe("abc");
    });
});

describe("assignment.delete_proposed — synthetic draft", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("clears participation draft instead of OA delete for proposed:<member> ids", async () => {
        const result = await assignmentDeleteProposedAction.execute({
            supabase: {} as never,
            ctx: { orgId: "org-1", userId: "user-1" } as never,
            invocation: {
                entityType: "child",
                entityId: "05cf9138-7f4f-482c-a839-4644359985d1",
            } as never,
            payload: { assignment_id: "proposed:05cf9138-7f4f-482c-a839-4644359985d1" },
        } as never);

        expect(result.ok).toBe(true);
        expect(applyChildParticipationEdit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                orgId: "org-1",
                customerMemberId: "05cf9138-7f4f-482c-a839-4644359985d1",
                patch: expect.objectContaining({
                    schedule_type: null,
                    program_room_cohort_key: null,
                    start_date: null,
                }),
            }),
        );
        expect(deleteProposedOperationalAssignment).not.toHaveBeenCalled();
    });

    it("after deleting a ledger proposed row, also clears participation draft", async () => {
        vi.mocked(deleteProposedOperationalAssignment).mockResolvedValue({
            id: "oa-1",
            customer_member_id: "member-1",
            room_location_id: "room-1",
            schedule_pattern_id: "pat-1",
            start_date: "2026-09-01",
            commitment_kind: "proposed",
        } as never);

        const result = await assignmentDeleteProposedAction.execute({
            supabase: {} as never,
            ctx: { orgId: "org-1", userId: "user-1" } as never,
            invocation: { entityType: "child", entityId: "member-1" } as never,
            payload: { assignment_id: "oa-1" },
        } as never);

        expect(result.ok).toBe(true);
        expect(deleteProposedOperationalAssignment).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ orgId: "org-1", assignmentId: "oa-1" }),
        );
        expect(applyChildParticipationEdit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                customerMemberId: "member-1",
                patch: expect.objectContaining({
                    schedule_type: null,
                    program_room_cohort_key: null,
                    start_date: null,
                }),
            }),
        );
    });
});
