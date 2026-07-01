import { describe, expect, it } from "vitest";
import { parsePlacementPriorityLayerStrict } from "@/lib/orchestration/placement/placementConfigSchema";
import {
    buildPlacementDemoOpportunityMetadataFragment,
    mergePlacementDemoIntoOpportunityMetadata,
    mergePlacementDemoLayerIntoWorkUnitMetadata,
    PLACEMENT_DEMO_SCENARIO_SEED_KEYS,
    PLACEMENT_PRIORITY_DEMO_LAYER_V1,
} from "@/lib/orchestration/placement/placementPriorityDemoPatch";

describe("placementPriorityDemoPatch", () => {
    it("demo placement layer is strict-parseable as work-unit metadata", () => {
        const meta = { placement_priority_v1: PLACEMENT_PRIORITY_DEMO_LAYER_V1 };
        const p = parsePlacementPriorityLayerStrict(meta);
        expect(p.ok).toBe(true);
    });

    it("mergePlacementDemoLayerIntoWorkUnitMetadata is idempotent", () => {
        const a = mergePlacementDemoLayerIntoWorkUnitMetadata({});
        expect(a.changed).toBe(true);
        expect(a.metadata.placement_priority_v1).toEqual(PLACEMENT_PRIORITY_DEMO_LAYER_V1);

        const b = mergePlacementDemoLayerIntoWorkUnitMetadata(a.metadata);
        expect(b.changed).toBe(false);
        expect(b.metadata.placement_priority_v1).toEqual(PLACEMENT_PRIORITY_DEMO_LAYER_V1);
    });

    it("scenario seed keys stay stable for idempotent upserts", () => {
        expect(PLACEMENT_DEMO_SCENARIO_SEED_KEYS.staff).toBe("placement_demo_waitlisted_staff");
        expect(PLACEMENT_DEMO_SCENARIO_SEED_KEYS.sister_center).toBe("placement_demo_waitlisted_sister_center");
    });

    it("buildPlacementDemoOpportunityMetadataFragment sets facts for evaluator adapter", () => {
        expect(buildPlacementDemoOpportunityMetadataFragment("staff").flag_staff_household).toBe(true);
        expect(buildPlacementDemoOpportunityMetadataFragment("community").flag_community_priority).toBe(true);
        expect(buildPlacementDemoOpportunityMetadataFragment("sibling").flag_sibling_enrolled).toBe(true);
        expect(buildPlacementDemoOpportunityMetadataFragment("sister_center").sister_center_transfer).toBe(true);
        expect(buildPlacementDemoOpportunityMetadataFragment("general")).not.toHaveProperty("flag_staff_household");
        expect(buildPlacementDemoOpportunityMetadataFragment("sibling_unknown").flag_sibling_enrolled).toBe("unknown");
        const inputsStaff = buildPlacementDemoOpportunityMetadataFragment("staff").placement_fact_inputs_v1 as {
            program_room_group: string;
        };
        expect(inputsStaff.program_room_group).toBe("Toddler");
        const inputsSibling = buildPlacementDemoOpportunityMetadataFragment("sibling").placement_fact_inputs_v1 as {
            program_room_group: string;
        };
        expect(inputsSibling.program_room_group).toBe("Infant");
        expect(String(buildPlacementDemoOpportunityMetadataFragment("staff").program_label)).toContain("Toddler");
        expect(String(buildPlacementDemoOpportunityMetadataFragment("sibling").program_label)).toContain("Infant");
    });

    it("mergePlacementDemoIntoOpportunityMetadata preserves unrelated keys", () => {
        const merged = mergePlacementDemoIntoOpportunityMetadata({ custom_demo_tag: "x", notes: "keep" }, "general");
        expect(merged.custom_demo_tag).toBe("x");
        expect(merged.notes).toBe("keep");
        expect(merged.seed_key).toBe(PLACEMENT_DEMO_SCENARIO_SEED_KEYS.general);
    });
});
