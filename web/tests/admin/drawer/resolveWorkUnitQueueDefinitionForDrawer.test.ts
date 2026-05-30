import { describe, expect, it } from "vitest";
import { resolveWorkUnitQueueDefinitionForDrawer } from "@/lib/admin/drawer/resolveWorkUnitQueueDefinitionForDrawer";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

describe("resolveWorkUnitQueueDefinitionForDrawer", () => {
    it("coerces v2 enrollment pipeline queue_definition for drawer lifecycle rail", () => {
        const def = resolveWorkUnitQueueDefinitionForDrawer(
            ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw
        );
        expect(def).not.toBeNull();
        expect(() => validateQueueDefinition(def)).not.toThrow();
        expect(def!.queues.map((q) => q.key)).toContain("new_leads");
    });

    it("returns null for invalid documents", () => {
        expect(resolveWorkUnitQueueDefinitionForDrawer(null)).toBeNull();
        expect(resolveWorkUnitQueueDefinitionForDrawer({})).toBeNull();
    });
});
