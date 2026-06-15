import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle Builder UX consolidation", () => {
    it("uses process catalog cards instead of dropdown selector", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        const cards = read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx");
        expect(primary).toContain("LifecycleProcessCatalogCards");
        expect(primary).not.toContain("LifecycleCatalogList");
        expect(primary).not.toContain("LifecycleCatalogRail");
        expect(cards).toContain("lifecycle-process-catalog");
        expect(cards).toContain("lifecycle-process-card-");
        expect(cards).not.toContain("<select");
    });

    it("test cleanup is debug-gated only", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("isLifecycleDebugUiEnabled() ? (");
        expect(primary).toMatch(
            /isLifecycleDebugUiEnabled\(\) \? \([\s\S]*LifecycleTestCleanupButton[\s\S]*\) : null/
        );
    });

    it("board uses track-grouped stage nav and process workspace header", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const trackNav = read("components/adminV2/settings/lifecycle/LifecycleTrackStageNav.tsx");
        const config = read("components/adminV2/settings/lifecycle/LifecycleStageConfiguration.tsx");
        expect(board).toContain("LifecycleProcessWorkspaceHeader");
        expect(board).toContain("LifecycleTrackStageNav");
        expect(board).toContain("LifecycleStageNav");
        expect(board).toContain("LifecycleStageConfiguration");
        expect(config).toContain("LifecycleStageWorkspace");
        expect(trackNav).toContain("lifecycle-track-stage-nav");
        expect(board).not.toContain("lifecycle-activation-card-grid");
        expect(board).not.toContain("LifecycleActivationWizardNav");
        expect(board).not.toContain("lifecycle-legacy-manage-hint");
    });

    it("add stage lives in stage nav", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const trackNav = read("components/adminV2/settings/lifecycle/LifecycleTrackStageNav.tsx");
        expect(trackNav).toContain("lifecycle-stage-tab-add");
        expect(board).not.toContain("lifecycle-activation-header-add-stage");
    });

    it("header exposes rename and gated delete for selected lifecycle", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain('data-testid="lifecycle-rename"');
        expect(board).toContain("canDeleteLifecycle");
        expect(board).toContain('data-testid="lifecycle-activation-delete"');
        expect(board).toContain("LifecycleRenameModal");
    });

    it("hydration auto-selects first stage when activation has none", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("if (!nextKey && stagesList.length > 0)");
        expect(board).toContain("stagesList[0]!");
    });

    it("runtime validation lives inside guided board row 2", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain('stepId="validation"');
        expect(guided).toContain("validationSlot");
    });

    it("delete opens catalog confirmation from primary", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("setDeleteConfirmTarget(entry)");
        expect(primary).not.toContain("if (!entry.can_delete) return");
    });

    it("stage workspace uses Settings V2 section order", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain('id="membership"');
        expect(workspace).toContain('id="required"');
        expect(workspace).toContain('id="work_plan"');
        expect(workspace).toContain('id="actions"');
        expect(workspace).toContain('id="ready_check"');
        expect(workspace).toContain("lifecycle-stage-section-queue-advanced");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_MEMBERSHIP");
    });
});
