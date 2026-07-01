import { describe, expect, it, beforeEach } from "vitest";
import {
    __resetLifecycleStatusesCardMountRegistryForTests,
    detectLifecycleStatusStateSplit,
    getLifecycleStatusesCardMountSnapshot,
    registerLifecycleStatusesCardInstance,
    resolveLifecycleStatusesSaveState,
    unregisterLifecycleStatusesCardInstance,
} from "@/lib/lifecycle/lifecycleStatusesCardState";
import { mergeStatusDraftToggle } from "@/lib/lifecycle/lifecycleStatusStepDraft";

describe("lifecycleStatusesCardState", () => {
    beforeEach(() => {
        __resetLifecycleStatusesCardMountRegistryForTests();
    });

    it("checkbox and save read the same statusDraftByStageKey bucket", () => {
        const draft = mergeStatusDraftToggle({}, "nurture_lane", "contacted", true);
        const state = resolveLifecycleStatusesSaveState({
            stageKey: "nurture_lane",
            stageLabel: "Nurture",
            statusDraftByStageKey: draft,
            statusDraftDirtyByStage: { nurture_lane: true },
            statusesLoading: false,
            statusesSaving: false,
        });
        expect(state.checkboxSelectedKeys).toEqual(["contacted"]);
        expect(state.saveDraftKeys).toEqual(["contacted"]);
        expect(state.canSaveStatuses).toBe(true);
        expect(state.disabledReason).toBeNull();
    });

    it("detects LIFECYCLE_STATUS_STATE_SPLIT when checkbox keys non-empty and save empty", () => {
        const { split, detail } = detectLifecycleStatusStateSplit({
            checkboxSelectedKeys: ["new_inquiry"],
            saveDraftKeys: [],
            mountedInstanceIds: ["statuses-card-1"],
            stageKey: "lead",
            normalizedStageKey: "lead",
        });
        expect(split).toBe(true);
        expect(detail.code).toBe("LIFECYCLE_STATUS_STATE_SPLIT");
    });

    it("tracks a single mounted statuses card instance", () => {
        const id = registerLifecycleStatusesCardInstance("lead");
        expect(getLifecycleStatusesCardMountSnapshot().count).toBe(1);
        unregisterLifecycleStatusesCardInstance(id);
        expect(getLifecycleStatusesCardMountSnapshot().count).toBe(0);
    });

    it("save disabled when no status selected", () => {
        const state = resolveLifecycleStatusesSaveState({
            stageKey: "lead",
            stageLabel: "Lead",
            statusDraftByStageKey: {},
            statusDraftDirtyByStage: {},
            statusesLoading: false,
            statusesSaving: false,
        });
        expect(state.canSaveStatuses).toBe(false);
        expect(state.disabledReason).toBe("no_status_selected");
    });
});
