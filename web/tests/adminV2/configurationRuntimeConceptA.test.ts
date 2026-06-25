/**
 * Configuration Runtime Concept A — drift prevention tests.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const mockupDir = resolve(root, "../docs/sprints/06_2026/configuration-runtime-bp-ux-redesign");
const freezeDoc = resolve(root, "../docs/sprints/06_2026/configuration_runtime_concept_a_freeze.md");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime Concept A freeze", () => {
    it("freeze doc exists and references canonical mockups", () => {
        const doc = readFileSync(freezeDoc, "utf8");
        expect(doc).toContain("Configuration Runtime Concept A");
        expect(doc).toContain("mockup-business-processes-page.png");
        expect(doc).toContain("mockup-stage-workspace.png");
        expect(doc).toContain("mockup-perspective-card.png");
        expect(doc).toContain("mockup-presentation-assignment.png");
    });

    it("stage workspace uses Universal Card grid shell", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("ConfigurationRuntimeUniversalCard");
        expect(workspace).toContain("configuration-runtime-stage-card-grid");
        expect(workspace).toContain("LifecycleStagePresentationCard");
        expect(workspace).toContain("BUSINESS_PROCESS_PREVIEW_WORK_UNIT");
    });

    it("perspectives editor uses operational lens language not primary queue_key", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx");
        expect(editor).toContain("BUSINESS_PROCESS_LENS_OPERATORS_SEE");
        expect(editor).toContain("BUSINESS_PROCESS_LENS_WORK_INCLUDED");
        expect(editor).toContain("BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME");
        expect(editor).toContain("BUSINESS_PROCESS_LENS_ADVANCED_IDENTITY");
        expect(editor).not.toContain("perspectives-save-pending-note");
        expect(editor).not.toMatch(/Lane key:/);
    });

    it("presentation card includes visual previews", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleStagePresentationCard.tsx");
        expect(card).toContain("QueueLayoutPreviewThumbnail");
        expect(card).toContain("FocusPanelLayoutPreviewThumbnail");
        expect(card).toContain("lifecycle-stage-presentation-card");
    });

    it("forbidden builder routes remain absent", () => {
        const domains = read("lib/adminV2/configurationWorkspaceDomains.ts");
        expect(domains).toContain("queue-builder");
        expect(domains).toContain("focus-panel-builder");
        expect(domains).toContain("CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES");
    });

    it("canonical mockup PNGs exist on disk", () => {
        for (const file of [
            "mockup-business-processes-page.png",
            "mockup-stage-workspace.png",
            "mockup-perspective-card.png",
            "mockup-presentation-assignment.png",
        ]) {
            expect(() => readFileSync(resolve(mockupDir, file))).not.toThrow();
        }
    });
});
