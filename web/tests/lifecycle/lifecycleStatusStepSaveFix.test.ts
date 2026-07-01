import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    canConfirmStatusesStep,
    shouldSyncStatusDraftFromServer,
} from "@/lib/lifecycle/lifecycleActivationStep3";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle status step save fix", () => {
    it("cannot continue without at least one draft status selected", () => {
        expect(
            canConfirmStatusesStep({
                statusesLoading: false,
                statusesSaving: false,
                draftCount: 0,
            })
        ).toBe(false);
    });

    it("can continue with selections before server save", () => {
        expect(
            canConfirmStatusesStep({
                statusesLoading: false,
                statusesSaving: false,
                draftCount: 1,
            })
        ).toBe(true);
    });

    it("unified save sends runtime department, stage, and status keys", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("department_id: runtimeDepartmentId");
        expect(board).toContain("stage_key: sk");
        expect(board).toContain("LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH");
        expect(board).toContain("selected_status_keys: selectedKeys");
    });

    it("no duplicate Save button in statuses card", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleStatusesCard.tsx");
        expect(card).not.toContain("Save statuses");
        expect(card).not.toContain("onSaveStatuses");
    });

    it("work unit step receives statusDisplayLabels from board state", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("statusDisplayLabels={statusDisplayLabels}");
    });

    it("preserves status draft when bootstrap reloads after checkbox selection", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("lifecycleStatusDraftReducer");
        expect(board).toContain("dispatchStatusDraft");
        expect(board).toContain("shouldSyncStatusDraftForStage");
        expect(board).toContain("statusDraftRef");
        expect(board).toContain("resolveLifecycleStatusesSaveState");
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("LifecycleStatusesCard");
    });

    it("reloads status-stages after custom stage create before selecting stage", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("const onStageCreated = useCallback");
        expect(board).toContain("const payload = await loadStatusStages()");
        expect(board).toContain("selectStage(stage, { statusesPayload: payload })");
    });

    it("custom stage save uses builder stage key from board state", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("stage_key: sk");
        expect(board).toContain("selected_status_keys: selectedKeys");
        expect(board).toContain("statusDraftRef.current.draftByStage");
    });

    it("shouldSyncStatusDraftFromServer blocks overwrite while user has selections", () => {
        expect(shouldSyncStatusDraftFromServer({ statusDraftDirty: true })).toBe(false);
        expect(
            canConfirmStatusesStep({
                statusesLoading: false,
                statusesSaving: false,
                draftCount: 1,
            })
        ).toBe(true);
    });
});
