import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle Builder UX consolidation", () => {
    it("uses lifecycle dropdown selector without legacy badges", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        const select = read("components/adminV2/settings/lifecycle/LifecycleCatalogSelect.tsx");
        expect(primary).toContain("LifecycleCatalogSelect");
        expect(primary).not.toContain("LifecycleCatalogList");
        expect(primary).not.toContain("LifecycleCatalogRail");
        expect(select).toContain("lifecycle-catalog-dropdown");
        expect(select).not.toContain("lifecycle-catalog-rail");
    });

    it("test cleanup is debug-gated only", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("isLifecycleDebugUiEnabled() ? (");
        expect(primary).toMatch(
            /isLifecycleDebugUiEnabled\(\) \? \([\s\S]*LifecycleTestCleanupButton[\s\S]*\) : null/
        );
    });

    it("board uses stage tabs and guided configuration grid", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const nav = read("components/adminV2/settings/lifecycle/LifecycleStageNav.tsx");
        const config = read("components/adminV2/settings/lifecycle/LifecycleStageConfiguration.tsx");
        expect(board).toContain("LifecycleStageNav");
        expect(board).toContain("LifecycleStageConfiguration");
        expect(config).toContain("LifecycleStageGuidedBoard");
        expect(nav).toContain("lifecycle-stage-tabs");
        expect(board).not.toContain("lifecycle-activation-card-grid");
        expect(board).not.toContain("LifecycleActivationWizardNav");
        expect(board).not.toContain("lifecycle-legacy-manage-hint");
    });

    it("add stage lives in stage tab rail", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const nav = read("components/adminV2/settings/lifecycle/LifecycleStageNav.tsx");
        expect(nav).toContain("lifecycle-stage-tab-add");
        expect(board).not.toContain("lifecycle-activation-header-add-stage");
    });

    it("header exposes rename and gated delete for selected lifecycle", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain('data-testid="lifecycle-rename"');
        expect(board).toContain("canDeleteLifecycle");
        expect(board).toContain('data-testid="lifecycle-activation-delete-disabled"');
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

    it("stage configuration uses guided cards for each setup area", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain("lifecycle-guided-card-");
        expect(guided).toContain('stepId="required"');
        expect(guided).toContain('stepId="statuses"');
        expect(guided).toContain('stepId="queue"');
        expect(guided).toContain('stepId="actions"');
        expect(guided).not.toContain('stepId="forms"');
    });
});
