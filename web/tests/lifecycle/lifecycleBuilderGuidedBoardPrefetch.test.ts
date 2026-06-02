import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLifecycleFieldPaletteDisplayLabel } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import {
    buildLifecycleActionConditionConfig,
    defaultActionScopeForBaseKey,
    LIFECYCLE_ACTION_SCOPE_LABELS,
    placementMatchesStageBootstrap,
} from "@/lib/lifecycle/lifecycleStageActionScope";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle builder guided board and prefetch", () => {
    it("guided board renders Required, Statuses, and Queue in row 1", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(board).toContain('data-testid="lifecycle-guided-row-1"');
        expect(board).toContain("md:grid-cols-3");
        expect(board).toContain('stepId="required"');
        expect(board).toContain('stepId="statuses"');
        expect(board).toContain('stepId="queue"');
        expect(board).toContain("Required Information");
        expect(board).toContain("Work Unit Queue");
    });

    it("row 2 includes Actions and Runtime Validation only", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(board).toContain('data-testid="lifecycle-guided-row-2"');
        expect(board).toContain('stepId="actions"');
        expect(board).toContain('stepId="validation"');
        expect(board).not.toContain('stepId="forms"');
        expect(board).not.toContain("EnrollmentProcessFormsCoverageCard");
    });

    it("each card exposes one primary Save action", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(board).toContain("Save Required Information");
        expect(board).toContain("Save Statuses");
        expect(board).toContain("Save Work Unit Queue");
        expect(board).toContain('primaryLabel="Save Action"');
        expect(board).toContain("lifecycle-guided-save-${stepId}");
        expect(board).not.toContain("Save Actions");
        expect(board).not.toContain("Save Form Coverage");
    });

    it("confirmStep advances to next card after save", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(board).toContain("nextStepAfter");
        expect(board).toContain("scrollToStep");
        expect(board).toContain("confirmStep");
    });

    it("stage bootstrap API route exists", () => {
        expect(read("app/api/admin/lifecycle-builder/stage-bootstrap/route.ts")).toContain(
            "buildLifecycleStageBootstrap"
        );
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("statuses");
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("field_requirements");
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("actions");
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("forms");
    });

    it("useLifecycleStageBootstrap caches by department and stage", () => {
        const hook = read("lib/lifecycle/useLifecycleStageBootstrap.ts");
        expect(hook).toContain("cache.set");
        expect(hook).toContain("stage-bootstrap");
        expect(hook).not.toContain("lifecycle-requirements");
    });

    it("activation board uses single bootstrap hook per stage", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("useLifecycleStageBootstrap");
        expect(board).toContain("refreshStageBootstrap");
        expect(board).not.toContain("lifecycle-runtime-validation-section");
    });

    it("statuses step does not show loading when bootstrap hydrated", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain("loading={false}");
    });

    it("multiple actions list persists after save and form resets", () => {
        const actions = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(actions).toContain("lifecycle-actions-list");
        const activation = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(activation).toContain("setBaseActionKey(\"\")");
        expect(activation).toContain("action_scope");
    });

    it("action scope and placements render in actions card", () => {
        const actions = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(actions).toContain("lifecycle-action-scope-lifecycle");
        expect(actions).toContain("LIFECYCLE_ACTION_SCOPE_LABELS");
        expect(LIFECYCLE_ACTION_SCOPE_LABELS.lifecycle).toBe("Lifecycle-wide");
        expect(actions).toContain("Placements:");
        expect(actions).toContain("lifecycle-add-action-placements");
    });

    it("create_record defaults to lifecycle scope in API condition config", () => {
        expect(defaultActionScopeForBaseKey("create_record")).toBe("lifecycle");
        const cfg = buildLifecycleActionConditionConfig("lifecycle", []);
        expect(cfg.lifecycle_action_scope).toBe("lifecycle");
        expect(placementMatchesStageBootstrap(cfg, "qualification")).toBe(true);
    });

    it("field labels prefer Phone over legacy Mobile org label for phone key", () => {
        expect(resolveLifecycleFieldPaletteDisplayLabel("Phone", "phone", "Mobile")).toBe("Phone");
        expect(resolveLifecycleFieldPaletteDisplayLabel("Phone", "phone", "Work Phone")).toBe("Work Phone");
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain("field.field_label");
        expect(editor).toContain("lifecycle-field-label-");
    });
});
