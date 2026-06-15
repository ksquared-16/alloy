import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Operating plan honest UI copy", () => {
    it("attention section states stage rules are not active", () => {
        const attention = read("components/adminV2/settings/lifecycle/LifecycleStageAttentionSection.tsx");
        const labels = read("lib/lifecycle/businessProcessUiLabels.ts");
        expect(attention).toContain("lifecycle-stage-attention-inactive-note");
        expect(attention).toContain("BUSINESS_PROCESS_SECTION_ATTENTION_INACTIVE_NOTE");
        expect(labels).toContain("are not active yet");
        expect(attention).not.toContain("Add off-track criteria in Expected work above");
    });

    it("operating plan editor documents primary work runtime", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx");
        const labels = read("lib/lifecycle/businessProcessUiLabels.ts");
        expect(editor).toContain("OPERATING_PLAN_EDITOR_RUNTIME_NOTE");
        expect(editor).toContain("Primary (drawer Work card)");
        expect(editor).toContain("BUSINESS_PROCESS_SECTION_SUCCESS");
        expect(labels).toContain("Work outcomes");
        expect(editor).toContain("No automation attached");
    });

    it("spawn path passes explicit operating plan into primary intent resolver", () => {
        const spawn = read("lib/lifecycle/onStageEntrySpawnWorkIntent.ts");
        expect(spawn).toContain("resolvePrimaryWorkIntentForStage(stageKey, explicitPlan)");
        expect(spawn).toContain("operating_plan_template");
        expect(spawn).toContain("template_key");
    });

    it("projection resolves primary intent from operating plan", () => {
        const projection = read("lib/lifecycle/projectWorkIntentRuntime.ts");
        expect(projection).toContain("resolvePrimaryWorkIntentForStage(stageKey, explicitPlan)");
        expect(projection).toContain("description");
    });
});
