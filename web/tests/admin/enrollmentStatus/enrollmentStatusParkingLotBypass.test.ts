import { describe, expect, it } from "vitest";
import {
    clearSkippedStageBypassBlocking,
    parkingLotWaitlistBypassApplies,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusParkingLotBypass";
import { makeRequirementViolation } from "@/lib/completion/requirementValidationResult";

describe("enrollmentStatusParkingLotBypass", () => {
    it("applies when waitlist parking-lot jump includes bypass reason and skipped stages", () => {
        expect(
            parkingLotWaitlistBypassApplies({
                destinationKey: "waitlist",
                bypassReason: "No space available",
                bpDestination: {
                    destinationKey: "waitlist",
                    label: "Waitlist",
                    defaultStatusKey: "waitlisted",
                    entityType: "opportunity_customer_members",
                    parkingLot: true,
                    requiresTourBypass: true,
                    bpSource: "default",
                },
                skippedStageCount: 3,
            }),
        ).toBe(true);
    });

    it("does not apply without bypass reason", () => {
        expect(
            parkingLotWaitlistBypassApplies({
                destinationKey: "waitlist",
                bypassReason: "",
                bpDestination: { parkingLot: true } as never,
                skippedStageCount: 3,
            }),
        ).toBe(false);
    });

    it("clears bypass_reason blocking but preserves field-based intake blocks", () => {
        const cleared = clearSkippedStageBypassBlocking({
            ok: false,
            blocking: [
                makeRequirementViolation({
                    entity_type: "opportunity",
                    entity_id: "opp-1",
                    field_key: "bypass_reason",
                    label: "Reason for skipping requirements",
                    requirement_type: "required_before_action",
                    blocking_level: "hard_block",
                    missing_reason: "A reason is required.",
                }),
                makeRequirementViolation({
                    entity_type: "inquiry_child",
                    entity_id: "ocm-1",
                    field_key: "program_category_id",
                    label: "Program",
                    requirement_type: "required_before_action",
                    blocking_level: "hard_block",
                    missing_reason: "Program is required for each child.",
                }),
                makeRequirementViolation({
                    entity_type: "inquiry_child",
                    entity_id: "ocm-1",
                    field_key: "schedule_type",
                    label: "Desired Schedule",
                    requirement_type: "required_before_action",
                    blocking_level: "hard_block",
                    missing_reason: "Required",
                }),
            ],
            warnings: [],
            recommendations: [],
        });

        // Field-based intake requirements must remain hard blocks.
        expect(cleared.ok).toBe(false);
        expect(cleared.blocking.map((v) => v.field_key)).toEqual([
            "program_category_id",
            "schedule_type",
        ]);
        expect(cleared.blocking.some((v) => v.field_key === "bypass_reason")).toBe(false);
    });

    it("is a no-op when there are no skipped-stage bypass blocks", () => {
        const result = {
            ok: false,
            blocking: [
                makeRequirementViolation({
                    entity_type: "inquiry_child",
                    entity_id: "ocm-1",
                    field_key: "program_category_id",
                    label: "Program",
                    requirement_type: "required_before_action",
                    blocking_level: "hard_block" as const,
                    missing_reason: "Program is required for each child.",
                }),
            ],
            warnings: [],
            recommendations: [],
        };
        const cleared = clearSkippedStageBypassBlocking(result);
        expect(cleared).toBe(result);
        expect(cleared.ok).toBe(false);
    });
});
