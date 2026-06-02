import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canConfirmStatusesStep } from "@/lib/lifecycle/lifecycleActivationStep3";

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

    it("PATCH status-stages sends runtime department and stage", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("department_id: runtimeDepartmentId");
        expect(board).toContain("stage: stageKey");
        expect(board).toContain("LIFECYCLE_ACTIVATION_STATUS_STAGES_PATH");
    });

    it("no duplicate Save button in statuses step component", () => {
        const step = read("components/adminV2/settings/lifecycle/LifecycleActivationStatusesStep.tsx");
        const saveButtons = (step.match(/<button/g) ?? []).length;
        expect(saveButtons).toBe(0);
        expect(step).not.toContain("onSave");
    });

    it("work unit card reads stageStatusDisplayLabels from board state", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("stageStatusDisplayLabels={statusDisplayLabels}");
    });
});
