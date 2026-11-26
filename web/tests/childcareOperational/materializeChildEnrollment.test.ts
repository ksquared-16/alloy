/**
 * Shared enrollment materialization core: from resolved facts, create/reuse the durable trio
 * (agreement → placement → schedule assignment). Idempotent. Never touches process_instances.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/childcareOperational/enrollmentAgreementService", () => ({
    getOperationalAgreementForMemberSite: vi.fn(async () => null),
    createChildEnrollmentAgreement: vi.fn(async () => ({ id: "agr-1" })),
}));
vi.mock("@/lib/childcareOperational/childPlacementService", () => ({
    getOperationalPlacementForAgreement: vi.fn(async () => null),
    createInitialChildPlacement: vi.fn(async (_s: unknown, args: unknown) => ({ id: "plc-1", _args: args })),
}));
vi.mock("@/lib/childcareOperational/scheduleAssignmentService", () => ({
    getOperationalScheduleAssignmentForAgreement: vi.fn(async () => null),
    createInitialScheduleAssignment: vi.fn(async (_s: unknown, args: unknown) => ({ id: "sch-1", _args: args })),
}));
vi.mock("@/lib/childcareOperational/schedulePatternService", () => ({
    listSchedulePatterns: vi.fn(async () => [{ id: "pat-1", key: "full_day", schedule_type_key: "full_day" }]),
}));
vi.mock("@/lib/childcareOperational/operationalEnrollmentEvents", () => ({
    emitEnrollmentAgreementCreatedEvent: vi.fn(async () => {}),
    emitPlacementCreatedEvent: vi.fn(async () => {}),
    emitScheduleAssignmentCreatedEvent: vi.fn(async () => {}),
}));

import { applyChildEnrollmentMaterialization } from "@/lib/childcareOperational/materializeChildEnrollment";
import { getOperationalAgreementForMemberSite, createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import { getOperationalPlacementForAgreement, createInitialChildPlacement } from "@/lib/childcareOperational/childPlacementService";
import { getOperationalScheduleAssignmentForAgreement, createInitialScheduleAssignment } from "@/lib/childcareOperational/scheduleAssignmentService";

const sb = {} as never;
const ORG = "org-1";
const baseFacts = {
    customerMemberId: "child-A",
    siteLocationId: "site-1",
    startDate: "2026-09-01",
    programCategoryId: "prog-1",
    roomLocationId: "room-1",
    scheduleType: "full_day",
};

describe("applyChildEnrollmentMaterialization (shared core)", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates agreement + placement (program/room/site/start) + schedule assignment", async () => {
        const res = await applyChildEnrollmentMaterialization(sb, {
            orgId: ORG,
            opportunityId: "opp-1",
            customerId: null,
            facts: baseFacts,
            todayYmd: "2026-07-04",
            sourceKey: "test",
        });
        expect(res.agreement).toEqual({ outcome: "created", id: "agr-1" });
        expect(res.placement.outcome).toBe("created");
        expect(res.schedule_assignment.outcome).toBe("created");
        // placement carries program/room/start date
        const placementArgs = vi.mocked(createInitialChildPlacement).mock.calls[0][1];
        expect(placementArgs).toMatchObject({
            enrollmentAgreementId: "agr-1",
            programCategoryId: "prog-1",
            roomLocationId: "room-1",
            startDate: "2026-09-01",
        });
        // schedule resolved the pattern from schedule_type
        expect(vi.mocked(createInitialScheduleAssignment).mock.calls[0][1]).toMatchObject({
            enrollmentAgreementId: "agr-1",
            schedulePatternId: "pat-1",
            startDate: "2026-09-01",
        });
    });

    it("is idempotent — reuses existing agreement/placement/schedule, creates nothing", async () => {
        vi.mocked(getOperationalAgreementForMemberSite).mockResolvedValueOnce({ id: "agr-x" } as never);
        vi.mocked(getOperationalPlacementForAgreement).mockResolvedValueOnce({ id: "plc-x" } as never);
        vi.mocked(getOperationalScheduleAssignmentForAgreement).mockResolvedValueOnce({ id: "sch-x" } as never);
        const res = await applyChildEnrollmentMaterialization(sb, {
            orgId: ORG,
            opportunityId: "opp-1",
            customerId: null,
            facts: baseFacts,
            todayYmd: "2026-07-04",
            sourceKey: "test",
        });
        expect(res.agreement).toEqual({ outcome: "reused", id: "agr-x" });
        expect(res.placement).toEqual({ outcome: "reused", id: "plc-x" });
        expect(res.schedule_assignment).toEqual({ outcome: "reused", id: "sch-x" });
        expect(createChildEnrollmentAgreement).not.toHaveBeenCalled();
        expect(createInitialChildPlacement).not.toHaveBeenCalled();
        expect(createInitialScheduleAssignment).not.toHaveBeenCalled();
    });

    it("skips the schedule assignment when no schedule fact is present", async () => {
        const res = await applyChildEnrollmentMaterialization(sb, {
            orgId: ORG,
            opportunityId: "opp-1",
            customerId: null,
            facts: { ...baseFacts, scheduleType: null, schedulePatternId: null },
            todayYmd: "2026-07-04",
            sourceKey: "test",
        });
        expect(res.schedule_assignment.outcome).toBe("skipped");
        expect(createInitialScheduleAssignment).not.toHaveBeenCalled();
    });

    it("skips placement when neither program nor room is present", async () => {
        const res = await applyChildEnrollmentMaterialization(sb, {
            orgId: ORG,
            opportunityId: "opp-1",
            customerId: null,
            facts: { ...baseFacts, programCategoryId: null, roomLocationId: null },
            todayYmd: "2026-07-04",
            sourceKey: "test",
        });
        expect(res.placement.outcome).toBe("skipped");
    });

    it("the core never writes operational facts to process_instances (source invariant)", () => {
        const src = readFileSync(path.join(__dirname, "../../lib/childcareOperational/materializeChildEnrollment.ts"), "utf8");
        expect(src).not.toContain("process_instances");
        expect(src).toContain("child_enrollment_agreements".length ? "createChildEnrollmentAgreement" : "");
    });

    it("the legacy approve-enrollment handoff delegates to the same core function", () => {
        const src = readFileSync(path.join(__dirname, "../../lib/childcareOperational/enrollmentAgreementHandoff.ts"), "utf8");
        expect(src).toContain("applyChildEnrollmentMaterialization");
    });
});
