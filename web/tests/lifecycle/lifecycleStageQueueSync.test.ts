import { describe, expect, it } from "vitest";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    applyStageStatusKeysToQueueDefinition,
    defaultEnrollmentPipelineQueueDefinition,
    stageStatusesNeedQueueSync,
} from "@/lib/lifecycle/lifecycleStageQueueSync";
import { queueStatusKeysForOperatorStage, snapshotEnrollmentPipelineWorkUnit } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

describe("lifecycleStageQueueSync", () => {
    it("default enrollment pipeline validates as v2 bundle", () => {
        const doc = defaultEnrollmentPipelineQueueDefinition();
        expect(doc.version).toBe(2);
        expect(Array.isArray(doc.queues)).toBe(true);
    });

    it("applyStageStatusKeysToQueueDefinition updates lead lane filters", () => {
        const base = defaultEnrollmentPipelineQueueDefinition();
        const next = applyStageStatusKeysToQueueDefinition(base, "lead", ["new", "open"]);
        const snapshot = snapshotEnrollmentPipelineWorkUnit({
            id: "wu-1",
            key: "enrollment_pipeline",
            name: "Pipeline",
            is_active: true,
            queue_definition: next,
        });
        expect(queueStatusKeysForOperatorStage("lead", snapshot).sort()).toEqual(["new", "open"]);
    });

    it("stageStatusesNeedQueueSync detects mismatch", () => {
        const snapshot = snapshotEnrollmentPipelineWorkUnit({
            id: "wu-1",
            key: "enrollment_pipeline",
            name: "Pipeline",
            is_active: true,
            queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
        });
        expect(stageStatusesNeedQueueSync("lead", snapshot, ["new", "open"])).toBe(true);
        const synced = applyStageStatusKeysToQueueDefinition(
            RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
            "lead",
            ["new_inquiry", "new"]
        );
        const syncedSnap = snapshotEnrollmentPipelineWorkUnit({
            id: "wu-1",
            key: "enrollment_pipeline",
            name: "Pipeline",
            is_active: true,
            queue_definition: synced,
        });
        expect(stageStatusesNeedQueueSync("lead", syncedSnap, ["new_inquiry", "new"])).toBe(false);
    });
});
