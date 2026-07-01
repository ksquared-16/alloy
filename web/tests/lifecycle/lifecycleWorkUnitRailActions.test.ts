import { describe, expect, it } from "vitest";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { mergeResolvedActionsBySlot } from "@/lib/workspace/mergeResolvedActionsBySlot";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";
import {
    builderStageKeyMatchesViewStage,
    lifecycleBuilderPlacementVisibleOnStage,
} from "@/lib/lifecycle/lifecycleBuilderActionVisibility";
import { buildLifecycleActionConditionConfig } from "@/lib/lifecycle/lifecycleStageActionScope";
import { lifecyclePlacementById } from "@/lib/lifecycle/lifecycleStageBaseActions";

describe("work unit right rail actions", () => {
    it("rightRailResolvedFromActionsPayload includes work_unit primary when right_rail surface has other actions", () => {
        const merged = mergeResolvedActionsBySlot(
            {
                ...emptyResolvedActionsBySlot(),
                right_rail: [{ key: "legacy_rail", label: "Legacy", description: null, action_type: "workflow", icon: null, style: null, display_style: "button", payload: {}, workflow_id: null }],
            },
            {
                ...emptyResolvedActionsBySlot(),
                primary: [{ key: "schedule_tour", label: "Schedule Tour", description: null, action_type: "workflow", icon: null, style: null, display_style: "button", payload: {}, workflow_id: null }],
            }
        );
        const flat = rightRailResolvedFromActionsPayload(merged);
        expect(flat.map((a) => a.key)).toEqual(["legacy_rail", "schedule_tour"]);
    });

    it("lifecycle matrix work_unit_rail maps to work_unit surface primary slot", () => {
        const placement = lifecyclePlacementById("work_unit_rail");
        expect(placement).toMatchObject({ surface: "work_unit", slot: "primary" });
    });

    it("lifecycle matrix workspace_root maps to workspace surface primary slot", () => {
        const placement = lifecyclePlacementById("workspace_root");
        expect(placement).toMatchObject({ surface: "workspace", slot: "primary" });
    });

    it("lifecycle-wide placement is visible on any builder stage", () => {
        const cfg = buildLifecycleActionConditionConfig("lifecycle", []);
        expect(lifecycleBuilderPlacementVisibleOnStage(cfg, "tour")).toBe(true);
        expect(lifecycleBuilderPlacementVisibleOnStage(cfg, "waitlist")).toBe(true);
    });

    it("stage-specific Schedule Tour visible only on matching stage", () => {
        const cfg = buildLifecycleActionConditionConfig("stage", ["tour"]);
        expect(lifecycleBuilderPlacementVisibleOnStage(cfg, "tour")).toBe(true);
        expect(lifecycleBuilderPlacementVisibleOnStage(cfg, "waitlist")).toBe(false);
    });

    it("builderStageKeyMatchesViewStage matches operator stage keys on view stage", () => {
        expect(builderStageKeyMatchesViewStage(["tour"], "tour")).toBe(true);
        expect(builderStageKeyMatchesViewStage(["tour"], "waitlist")).toBe(false);
    });

    it("disabled placement would not resolve without a row (documented expectation)", () => {
        const actions = rightRailResolvedFromActionsPayload({
            ...emptyResolvedActionsBySlot(),
            primary: [],
        });
        expect(actions).toEqual([]);
    });
});
