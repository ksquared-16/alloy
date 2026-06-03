/**
 * Regression: async selectStage/hydrate must not wipe draft after user toggles during await.
 */
import { describe, expect, it } from "vitest";
import {
    mergeStatusDraftToggle,
    shouldSyncStatusDraftForStage,
    statusDraftKeysForStage,
    type StatusDraftByStageKey,
} from "@/lib/lifecycle/lifecycleStatusStepDraft";

describe("lifecycleStatusDraftSyncRace", () => {
    it("re-check dirty ref after simulated await before sync", () => {
        const dirtyRef: Record<string, boolean> = {};
        let draftByStage: StatusDraftByStageKey = {};
        const sk = "enrolled";
        const statusKey = "active";

        const canSyncFromServer = () => shouldSyncStatusDraftForStage(dirtyRef, sk);

        expect(canSyncFromServer()).toBe(true);

        // selectStage starts sync path (no payload — would await loadStatusStages)
        const wouldSyncBeforeAwait = canSyncFromServer();

        // user toggles while loadStatusStages in flight
        dirtyRef[sk] = true;
        draftByStage = mergeStatusDraftToggle(draftByStage, sk, statusKey, true);

        expect(wouldSyncBeforeAwait).toBe(true);
        expect(canSyncFromServer()).toBe(false);
        expect(statusDraftKeysForStage(draftByStage, sk)).toEqual([statusKey]);

        // after await: must NOT apply stale sync
        if (canSyncFromServer()) {
            draftByStage = mergeStatusDraftToggle(draftByStage, sk, statusKey, false);
        }

        expect(statusDraftKeysForStage(draftByStage, sk)).toEqual([statusKey]);
    });
});
