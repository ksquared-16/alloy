/**
 * Status row activation + board draft wiring (no RTL).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    resolveLifecycleStatusesSaveState,
    resolveLifecycleStatusRowToggleSelected,
    type LifecycleStatusesSaveState,
} from "@/lib/lifecycle/lifecycleStatusesCardState";
import {
    applyLifecycleStatusDraftAction,
    INITIAL_LIFECYCLE_STATUS_DRAFT_STATE,
} from "@/lib/lifecycle/lifecycleStatusDraftReducer";
import { statusDraftKeysForStage } from "@/lib/lifecycle/lifecycleStatusStepDraft";

const repoRoot = join(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(join(repoRoot, rel), "utf8");
}

function simulateRowClick(
    draftState: typeof INITIAL_LIFECYCLE_STATUS_DRAFT_STATE,
    stageKey: string,
    statusKey: string,
    currentlyChecked: boolean
): typeof INITIAL_LIFECYCLE_STATUS_DRAFT_STATE {
    const selected = resolveLifecycleStatusRowToggleSelected(currentlyChecked);
    return applyLifecycleStatusDraftAction(draftState, {
        type: "toggle",
        stageKey,
        statusKey,
        selected,
    });
}

function simulateSaveHandler(
    draftState: typeof INITIAL_LIFECYCLE_STATUS_DRAFT_STATE,
    stageKey: string,
    stageLabel: string
): { saveState: LifecycleStatusesSaveState; patchKeys: string[] } {
    const saveState = resolveLifecycleStatusesSaveState({
        stageKey,
        stageLabel,
        statusDraftByStageKey: draftState.draftByStage,
        statusDraftDirtyByStage: draftState.dirtyByStage,
        statusesLoading: false,
        statusesSaving: false,
    });
    return { saveState, patchKeys: saveState.saveDraftKeys };
}

describe("lifecycleStatusesCardInteraction", () => {
    it("click status option row — checkbox checked, Save enabled", () => {
        let draftState = INITIAL_LIFECYCLE_STATUS_DRAFT_STATE;
        const stageKey = "enrolled";
        const statusKey = "new_inquiry";

        const before = resolveLifecycleStatusesSaveState({
            stageKey,
            stageLabel: "Enrolled",
            statusDraftByStageKey: draftState.draftByStage,
            statusDraftDirtyByStage: draftState.dirtyByStage,
            statusesLoading: false,
            statusesSaving: false,
        });
        expect(before.canSaveStatuses).toBe(false);

        draftState = simulateRowClick(draftState, stageKey, statusKey, false);

        const afterClick = resolveLifecycleStatusesSaveState({
            stageKey,
            stageLabel: "Enrolled",
            statusDraftByStageKey: draftState.draftByStage,
            statusDraftDirtyByStage: draftState.dirtyByStage,
            statusesLoading: false,
            statusesSaving: false,
        });
        expect(afterClick.checkboxSelectedKeys).toEqual([statusKey]);
        expect(afterClick.saveDraftKeys).toEqual([statusKey]);
        expect(afterClick.canSaveStatuses).toBe(true);
        expect(afterClick.dirty).toBe(true);

        const { patchKeys, saveState } = simulateSaveHandler(draftState, stageKey, "Enrolled");
        expect(patchKeys).toEqual([statusKey]);
        expect(saveState.checkboxSelectedKeys).toEqual(saveState.saveDraftKeys);
        expect(statusDraftKeysForStage(draftState.draftByStage, stageKey)).toEqual([statusKey]);
    });

    it("LifecycleStatusesCard uses button rows without debug panel", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleStatusesCard.tsx");
        expect(card).toContain("lifecycle-activation-status-row-");
        expect(card).toContain('type="button"');
        expect(card).not.toContain("lifecycle-status-step-debug-panel");
        expect(card).not.toContain("isLifecycleDebugUiEnabled");
    });

    it("board uses status draft reducer with ref dispatch", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("lifecycleStatusDraftReducer");
        expect(board).toContain("dispatchStatusDraft");
        expect(board).toContain("statusDraftRef");
        expect(board).toContain("keysToSave");
        expect(board).not.toContain("statusDraftRef.current = statusDraft");
        expect(board).not.toContain("statuses-payload-effect");
    });
});
