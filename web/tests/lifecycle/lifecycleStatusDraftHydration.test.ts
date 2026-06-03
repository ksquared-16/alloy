import { describe, expect, it } from "vitest";
import {
    applyLifecycleStatusDraftAction,
    INITIAL_LIFECYCLE_STATUS_DRAFT_STATE,
} from "@/lib/lifecycle/lifecycleStatusDraftReducer";
import { shouldApplyServerStatusKeysForStage } from "@/lib/lifecycle/lifecycleStatusStepDraft";

describe("lifecycleStatusDraftHydration", () => {
    it("shouldApplyServerStatusKeysForStage blocks empty server wipe", () => {
        expect(
            shouldApplyServerStatusKeysForStage(
                { enrolled: ["active"] },
                { enrolled: [] },
                "enrolled",
                []
            )
        ).toBe(false);
    });

    it("syncFromServer does not clear a user toggle when server returns empty", () => {
        let state = applyLifecycleStatusDraftAction(INITIAL_LIFECYCLE_STATUS_DRAFT_STATE, {
            type: "toggle",
            stageKey: "enrolled",
            statusKey: "active",
            selected: true,
        });
        state = applyLifecycleStatusDraftAction(state, {
            type: "syncFromServer",
            stageKey: "enrolled",
            keys: [],
        });
        expect(state.draftByStage.enrolled).toEqual(["active"]);
        expect(state.dirtyByStage.enrolled).toBe(true);
    });
});
