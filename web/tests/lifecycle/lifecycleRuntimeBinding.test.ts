import { describe, expect, it } from "vitest";
import {
    defaultWorkUnitQueueNameForOperatorStage,
    defaultWorkUnitQueueNameForStageKey,
    isLegacyDefaultPipelineDisplayName,
    statusKeysForOperatorStageQueueSync,
} from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";

describe("lifecycleRuntimeBinding", () => {
    it("default work unit name for lead stage is New Leads not Enrollment Pipeline", () => {
        expect(defaultWorkUnitQueueNameForOperatorStage("lead")).toBe("New Leads");
        expect(defaultWorkUnitQueueNameForStageKey("lead")).toBe("New Leads");
        expect(isLegacyDefaultPipelineDisplayName("Enrollment pipeline")).toBe(true);
        expect(isLegacyDefaultPipelineDisplayName("New Leads")).toBe(false);
    });

    it("lead stage queue sync includes platform create-lead status key", () => {
        const keys = statusKeysForOperatorStageQueueSync("lead", ["new_lead"]);
        expect(keys).toContain("new_lead");
        expect(keys).toContain(NEW_LEAD_STATUS_KEY);
    });

    it("non-lead stages do not inject create-lead key", () => {
        const keys = statusKeysForOperatorStageQueueSync("tour", ["tour_scheduled"]);
        expect(keys).toEqual(["tour_scheduled"]);
    });
});
