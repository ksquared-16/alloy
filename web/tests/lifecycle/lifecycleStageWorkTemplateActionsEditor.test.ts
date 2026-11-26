/**
 * Work Template action editor + Alloy picker static contracts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("LifecycleStageWorkTemplateActionsEditor", () => {
    it("uses AlloyConfigPicker instead of native select elements", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor.tsx");
        expect(editor).toContain("AlloyConfigPicker");
        expect(editor).not.toMatch(/<select[\s>]/);
    });

    it("authors commands once per stage, not per work item", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor.tsx");
        // The per-work-item Primary / Helpful command pickers are retired.
        expect(editor).not.toContain("Helpful Commands");
        expect(editor).not.toContain("Primary Command");
        expect(editor).not.toContain("addWorkTemplateHelpfulAction");
        expect(editor).toContain("work-template-commands-note");

        const stage = read("components/adminV2/settings/lifecycle/LifecycleStageCommandsEditor.tsx");
        expect(stage).toContain("Stage commands");
        expect(stage).toContain("resolveStageCommands");
        expect(stage).toContain("will not appear on the Process Card");

        const plan = read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx");
        expect(plan).toContain("<LifecycleStageCommandsEditor");
    });

    it("authors Available Outcomes and Outcome Definitions on the Work Template", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor.tsx");
        expect(editor).toContain("Actions &amp; Results");
        expect(editor).toContain("data-stage-actions-results");
        expect(editor).toContain("Available Outcomes");
        expect(editor).not.toContain("Available Results");
        // Direct Command / Outcome Led was the per-work-item primary command choice — retired with
        // stage commands, which are one flat list per stage.
        expect(editor).not.toContain("Direct Command");
        expect(editor).toContain("LifecycleStageOutcomeDefinitionsEditor");
        expect(editor).not.toContain("Completion Outcomes");
        expect(editor).not.toContain("work-template-alternate-paths");
        expect(editor).toContain("work-template-transitions-note");
        expect(editor).toContain("workTemplateActionAppliesToLabel");

        const definitions = read("components/adminV2/settings/lifecycle/LifecycleStageOutcomeDefinitionsEditor.tsx");
        expect(definitions).toContain("Outcome Definitions");
        expect(definitions).toContain("workTemplateKey");
        expect(definitions).toContain("Define what operators can record for this work");
        expect(definitions).toContain("filterGrainCompatibleStageDestinations");

        const operatingPlan = read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx");
        expect(operatingPlan).not.toContain("LifecycleStageOutcomeDefinitionsEditor");
        expect(operatingPlan).toContain("LifecycleStageOutgoingTransitionsEditor");

        const waysOut = read("components/adminV2/settings/lifecycle/LifecycleStageOutgoingTransitionsEditor.tsx");
        expect(waysOut).toContain("filterGrainCompatibleStageDestinations");

        const stageEditor = read("components/adminV2/settings/lifecycle/StageEditorV2.tsx");
        expect(stageEditor).toContain("...(stage.grain ? { grain: stage.grain } : {})");
    });
});

describe("AlloyConfigPicker", () => {
    it("applies Bend Pine focus/selected styling and keyboard dismissal", () => {
        const picker = read("components/adminV2/settings/shared/AlloyConfigPicker.tsx");
        expect(picker).toContain("ring-alloy-bend-pine/20");
        expect(picker).toContain("bg-alloy-bend-pine/[0.12]");
        expect(picker).toContain('event.key === "Escape"');
        expect(picker).toContain("data-alloy-config-picker-trigger");
        expect(picker).not.toContain("<select");
    });
});

describe("Current Work activity preview", () => {
    it("reuses canonical activity projection and portal anchoring", () => {
        const adapter = read("lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems.ts");
        expect(adapter).toContain("resolveLeadActivityPreview");

        const preview = read("components/admin/focusPanel/cards/CurrentWorkActivityPreview.tsx");
        expect(preview).toContain("ComposerFloatingPopover");
        expect(preview).toContain("No activity recorded yet.");
        expect(preview).toContain("Loading recent activity");
        expect(preview).toContain("View all activity");
    });

    it("does not use absolute in-card positioning for preview panel", () => {
        const css = read("app/adminV2/components/alloyOsRuntime.css");
        const start = css.indexOf(".alloy-os-currentwork__activity-preview {");
        const end = css.indexOf("}", start);
        const rule = css.slice(start, end + 1);
        expect(rule).not.toContain("position: absolute");
    });
});
