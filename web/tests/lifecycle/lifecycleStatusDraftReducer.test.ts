import { describe, expect, it } from "vitest";
import {
    applyLifecycleStatusDraftAction,
    INITIAL_LIFECYCLE_STATUS_DRAFT_STATE,
} from "@/lib/lifecycle/lifecycleStatusDraftReducer";
import { statusDraftKeysForStage } from "@/lib/lifecycle/lifecycleStatusStepDraft";

describe("lifecycleStatusDraftReducer", () => {
    it("toggle marks dirty and syncFromServer does not wipe in-flight edits", () => {
        let state = INITIAL_LIFECYCLE_STATUS_DRAFT_STATE;
        state = applyLifecycleStatusDraftAction(state, {
            type: "toggle",
            stageKey: "enrolled",
            statusKey: "active",
            selected: true,
        });
        expect(state.dirtyByStage.enrolled).toBe(true);
        expect(state.draftByStage.enrolled).toEqual(["active"]);

        const afterStaleSync = applyLifecycleStatusDraftAction(state, {
            type: "syncFromServer",
            stageKey: "enrolled",
            keys: [],
        });
        expect(afterStaleSync.draftByStage.enrolled).toEqual(["active"]);
        expect(afterStaleSync.dirtyByStage.enrolled).toBe(true);
    });

    it("commitSaved bypasses dirty guard", () => {
        let state = applyLifecycleStatusDraftAction(INITIAL_LIFECYCLE_STATUS_DRAFT_STATE, {
            type: "toggle",
            stageKey: "lead",
            statusKey: "new_inquiry",
            selected: true,
        });
        state = applyLifecycleStatusDraftAction(state, {
            type: "syncFromServer",
            stageKey: "lead",
            keys: ["other"],
        });
        expect(statusDraftKeysForStage(state.draftByStage, "lead")).toEqual(["new_inquiry"]);

        state = applyLifecycleStatusDraftAction(state, {
            type: "commitSaved",
            stageKey: "lead",
            keys: ["new_inquiry"],
        });
        expect(statusDraftKeysForStage(state.savedByStage, "lead")).toEqual(["new_inquiry"]);
    });

    it("syncFromServer applies when stage is not dirty", () => {
        let state = INITIAL_LIFECYCLE_STATUS_DRAFT_STATE;
        state = applyLifecycleStatusDraftAction(state, {
            type: "syncFromServer",
            stageKey: "lead",
            keys: ["new_inquiry"],
        });
        expect(state.draftByStage.lead).toEqual(["new_inquiry"]);
        expect(state.savedByStage.lead).toEqual(["new_inquiry"]);
        expect(state.dirtyByStage.lead).toBeUndefined();
    });
});
