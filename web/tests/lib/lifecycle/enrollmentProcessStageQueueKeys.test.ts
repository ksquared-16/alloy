import { describe, expect, it } from "vitest";
import {
    operatorStageKeysForPipelineQueueKey,
    operatorWorkUnitKeyForPipelineQueueKey,
} from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";

describe("operatorWorkUnitKeyForPipelineQueueKey", () => {
    it("maps a primary lane queue key to its own operator work-unit key", () => {
        expect(operatorWorkUnitKeyForPipelineQueueKey("new_leads")).toBe("new_leads");
        expect(operatorWorkUnitKeyForPipelineQueueKey("tours")).toBe("tours");
        expect(operatorWorkUnitKeyForPipelineQueueKey("enrollment_offers")).toBe("enrollment_offers");
    });

    it("collapses a stage's secondary lane to the stage's primary operator work unit", () => {
        // tours_follow_up belongs to the `tour` stage whose primary work unit is `tours`.
        expect(operatorWorkUnitKeyForPipelineQueueKey("tours_follow_up")).toBe("tours");
    });

    it("is case-insensitive on the lane key", () => {
        expect(operatorWorkUnitKeyForPipelineQueueKey("New_Leads")).toBe("new_leads");
    });

    it("returns an unknown lane key unchanged (per-lane slug fallback, never the pipeline aggregate)", () => {
        expect(operatorWorkUnitKeyForPipelineQueueKey("some_custom_lane")).toBe("some_custom_lane");
    });

    it("returns null for empty input", () => {
        expect(operatorWorkUnitKeyForPipelineQueueKey("")).toBeNull();
        expect(operatorWorkUnitKeyForPipelineQueueKey("   ")).toBeNull();
    });

    it("stays consistent with the reverse stage map", () => {
        expect(operatorStageKeysForPipelineQueueKey("new_leads")).toContain("lead");
        expect(operatorStageKeysForPipelineQueueKey("tours_follow_up")).toContain("tour");
    });
});
