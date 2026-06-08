import { describe, expect, it } from "vitest";
import {
    mergeStatusDraftToggle,
    shouldSyncStatusDraftForStage,
    statusDraftKeysForStage,
    writeStatusDraftForStage,
} from "@/lib/lifecycle/lifecycleStatusStepDraft";
import { shouldSyncStatusDraftFromServer } from "@/lib/lifecycle/lifecycleActivationStep3";

describe("lifecycleStatusStepDraft", () => {
    it("stores draft per stage key independently", () => {
        let draft = writeStatusDraftForStage({}, "lead", ["new_inquiry"]);
        draft = mergeStatusDraftToggle(draft, "tour", "tour_scheduled", true);
        expect(statusDraftKeysForStage(draft, "lead")).toEqual(["new_inquiry"]);
        expect(statusDraftKeysForStage(draft, "tour")).toEqual(["tour_scheduled"]);
    });

    it("blocks server sync when stage draft is dirty", () => {
        expect(shouldSyncStatusDraftForStage({ lead: true }, "lead")).toBe(false);
        expect(shouldSyncStatusDraftForStage({ lead: true }, "tour")).toBe(true);
        expect(
            shouldSyncStatusDraftFromServer({
                statusDraftDirty: false,
                stageKey: "lead",
                statusDraftDirtyByStage: { lead: true },
            })
        ).toBe(false);
    });

    it("toggle adds and removes keys for the same stage", () => {
        let draft = mergeStatusDraftToggle({}, "nurture_lane", "contacted", true);
        draft = mergeStatusDraftToggle(draft, "nurture_lane", "contacted", false);
        expect(statusDraftKeysForStage(draft, "nurture_lane")).toEqual([]);
    });
});
