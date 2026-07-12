/**
 * Configuration Runtime Concept A — drift prevention tests.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const mockupDir = resolve(root, "../docs/sprints/archive/06_2026/configuration-runtime-bp-ux-redesign");
const freezeDoc = resolve(root, "../docs/sprints/archive/06_2026/configuration_runtime_concept_a_freeze.md");
const realignmentDoc = resolve(
    root,
    "../docs/sprints/archive/06_2026/configuration_runtime_process_work_views_realignment.md",
);

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime Concept A freeze", () => {
    it("freeze doc exists and references canonical mockups", () => {
        const doc = readFileSync(freezeDoc, "utf8");
        expect(doc).toContain("Configuration Runtime Concept A");
        expect(doc).toContain("mockup-business-processes-page.png");
        expect(doc).toContain("mockup-perspective-card.png");
    });

    it("documents process-level Work Views realignment", () => {
        const doc = readFileSync(realignmentDoc, "utf8");
        expect(doc).toContain("work_views_v1");
        expect(doc).toContain("Paused");
    });

    it("stage workspace no longer embeds Work Views card", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("ConfigurationRuntimeUniversalCard");
        expect(workspace).not.toContain("WorkViewOperationalLensCard");
        expect(workspace).not.toContain('id="work-views"');
    });

    it("process board exposes Work Views workspace navigation", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BusinessProcessConfigurationShell");
        expect(board).toContain("BusinessProcessWorkViewsSetupWorkspace");
        expect(board).toContain('processSection === "work-views"');
    });

    it("work views editor includes typed condition value controls", () => {
        const editor = read("components/adminV2/settings/businessProcess/WorkViewConditionEditor.tsx");
        expect(editor).toContain("work-view-add-condition");
        expect(editor).toContain("WorkViewConditionValueControl");
        expect(editor).not.toContain('placeholder="Value"');
    });

    it("process work view card uses layout assignment cards", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("LayoutAssignmentCard");
        expect(card).toContain("queue_layout_id");
        expect(card).toContain("focus_panel_layout_id");
        expect(card).toContain("BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME");
        expect(card).toContain("process-work-view-preview");
    });

    it("settings home renders configuration hub tiles", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("SettingsConfigurationHub");
        expect(page).not.toContain("SettingsIndexRedirect");
    });

    it("processes page uses Processes title and test id", () => {
        const page = read("app/adminV2/settings/processes/page.tsx");
        expect(page).toContain("ProcessesConfigurationPage");
        const strip = read("components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx");
        expect(strip).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_TITLE");
        const surface = read("components/adminV2/settings/businessProcess/ProcessesConfigurationPage.tsx");
        expect(surface).toContain('data-testid="settings-processes-page"');
    });

    it("legacy business-processes route redirects to processes", () => {
        const page = read("app/adminV2/settings/business-processes/page.tsx");
        expect(page).toContain("redirect");
        expect(page).toContain("ADMIN_V2_SETTINGS_PROCESSES_PATH");
    });

    it("layouts gallery exposes Lead Summary card blueprint", () => {
        const client = read("app/adminV2/settings/layouts/LayoutsSettingsPageClient.tsx");
        expect(client).toContain("LeadSummaryCardBlueprintEditor");
        expect(client).toContain("layout-blueprint-lead-summary");
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
