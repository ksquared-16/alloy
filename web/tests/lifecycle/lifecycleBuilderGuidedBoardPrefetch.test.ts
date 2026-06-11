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

describe("lifecycle builder stage workspace and prefetch", () => {
    it("stage workspace orders operational sections before queue view", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain('id="membership"');
        expect(workspace).toContain('id="required"');
        expect(workspace).toContain('id="actions"');
        expect(workspace).toContain("lifecycle-stage-section-queue-advanced");
        expect(workspace).toContain('id="ready_check"');
        expect(workspace.indexOf('id="membership"')).toBeLessThan(
            workspace.indexOf("lifecycle-stage-section-queue-advanced")
        );
        expect(workspace.indexOf('id="required"')).toBeLessThan(
            workspace.indexOf("lifecycle-stage-section-queue-advanced")
        );
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_READY");
        expect(workspace).not.toContain("defaultOpen");
    });

    it("stage workspace has sticky header save bar only", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).not.toContain("lifecycle-stage-save-sticky-bar");
        expect(workspace).toContain("sticky top-0");
        expect(workspace).toContain("lifecycle-stage-save");
    });

    it("unified save is the single stage entry point", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(workspace).toContain('"lifecycle-stage-save"');
        expect(workspace).toContain("BUSINESS_PROCESS_SAVE_STAGE");
        expect(board).toContain("saveStageUnified");
        expect(board).toContain("LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH");
    });

    it("stage bootstrap API route exists", () => {
        expect(read("app/api/admin/lifecycle-builder/stage-bootstrap/route.ts")).toContain(
            "buildLifecycleStageBootstrap"
        );
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("statuses");
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("field_requirements");
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("actions");
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain("entity_display_labels");
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

    it("statuses card does not show loading when bootstrap hydrated in workspace", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("loading={false}");
    });

    it("actions matrix persists enabled rows after save", () => {
        const matrix = read("components/adminV2/settings/lifecycle/LifecycleActionsMatrix.tsx");
        expect(matrix).toContain("enabled");
        expect(matrix).toContain("display_order");
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "LifecycleActionsMatrix"
        );
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
