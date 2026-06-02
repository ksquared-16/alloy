import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle Activation Path", () => {
    it("keeps existing Lifecycle Builder UI", () => {
        const shell = read("components/adminV2/settings/LifecycleSettingsShell.tsx");
        expect(shell).toContain("LifecycleHubClient");
        expect(shell).toContain("lifecycle-mode-builder");
        expect(read("components/adminV2/settings/LifecycleHubClient.tsx")).toContain("lifecycle-hub");
    });

    it("activation flow exists separately", () => {
        const shell = read("components/adminV2/settings/LifecycleSettingsShell.tsx");
        expect(shell).toContain("Lifecycle Builder");
        expect(shell).toContain("LifecycleActivationClient");
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "lifecycle-builder-board"
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationClient.tsx")).toContain(
            "LifecycleActivationBoard"
        );
    });

    it("add stage has no starting status in activation", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain("lifecycle-add-stage-status");
        expect(board).not.toContain("LifecycleNeedsAttentionCard");
    });

    it("activation queue uses work unit card without sync button", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "LifecycleStageWorkUnitCard"
        );
        expect(read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx")).not.toContain(
            "lifecycle-sync-queue-statuses"
        );
    });

    it("activation action uses placement checkboxes", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("placement_ids");
        expect(board).toContain("lifecycle-activation-action-placements");
        expect(board).toContain("lifecycle-activation-action-base");
        expect(board).not.toContain("activation_overflow_only");
    });

    it("builder actions card still supports multi placement", () => {
        const builder = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessActionsCard.tsx");
        expect(builder).toContain("lifecycle-add-action-placements");
    });

    it("validation checklist API and UI exist", () => {
        expect(read("app/api/admin/departments/[departmentId]/lifecycle-activation/validate/route.ts")).toContain(
            "validateLifecycleActivationRuntime"
        );
        const validationUi = read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx");
        expect(validationUi).toContain("lifecycle-activation-check-");
        expect(validationUi).toContain("lifecycle-activation-validation");
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain("drawer_actions");
    });

    it("activation metadata key is additive", () => {
        expect(read("lib/lifecycle/lifecycleActivationConfig.ts")).toContain("lifecycle_activation_v1");
        expect(read("lib/lifecycle/lifecycleBuilderConfig.ts")).toContain("lifecycle_builder_v1");
    });

    it("stage actions POST supports activation overflow flag", () => {
        const route = read("app/api/admin/enrollment-process/stage-actions/route.ts");
        expect(route).toContain("activation_overflow_only");
    });

    it("scratch hub has no hardcoded enrollment stage order", () => {
        expect(read("components/adminV2/settings/LifecycleHubClient.tsx")).not.toContain("LIFECYCLE_STAGE_ORDER");
    });

    it("activation step 3 uses dedicated statuses step with preload", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("LifecycleActivationStatusesStep");
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationStatusesStep.tsx")).toContain(
            "lifecycle-activation-statuses-loading"
        );
        expect(board).not.toContain("EnrollmentProcessStageStatusesCard");
    });
});
