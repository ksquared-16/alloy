/**
 * Configuration Mode doctrine — visual + interaction drift prevention.
 * @see docs/system/configuration-mode-doctrine.md
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_MODE_BRAND_TOKENS,
    CONFIGURATION_MODE_FORBIDDEN_STYLING_PATTERNS,
    CONFIGURATION_PROCESS_QUEUE_SECTIONS,
} from "@/lib/adminV2/configurationModeDoctrine";
import { CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES } from "@/lib/adminV2/configurationWorkspaceDomains";
import {
    BUSINESS_PROCESS_NAV_WORK_VIEWS,
    BUSINESS_PROCESS_SETTINGS_PAGE_TITLE,
} from "@/lib/lifecycle/businessProcessUiLabels";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const DOCTRINE_DOCS = [
    "../docs/system/configuration-mode-doctrine.md",
    "../docs/system/configuration-runtime-design-alignment.md",
    "../docs/system/configuration-workspace-v1-doctrine.md",
    "../docs/sprints/archive/06_2026/configuration_runtime_final_ui_review.md",
    "../docs/sprints/archive/06_2026/configuration_runtime_business_processes_ux_redesign.md",
];

describe("Configuration Mode doctrine", () => {
    it("registers forbidden blue/gray admin styling patterns", () => {
        expect(CONFIGURATION_MODE_FORBIDDEN_STYLING_PATTERNS).toContain("blue selected states");
        expect(CONFIGURATION_MODE_FORBIDDEN_STYLING_PATTERNS).toContain("alloy-blue");
        expect(CONFIGURATION_MODE_FORBIDDEN_STYLING_PATTERNS).toContain("slate selected");
    });

    it("registers Alloy brand tokens for Configuration Mode", () => {
        expect(CONFIGURATION_MODE_BRAND_TOKENS).toContain("alloy-pine");
        expect(CONFIGURATION_MODE_BRAND_TOKENS).toContain("alloy-midnight");
        expect(CONFIGURATION_MODE_BRAND_TOKENS).toContain("rgba(0, 162, 131, 0.08)");
    });

    it("process queue excludes Presentation and Participation as top-level nav items", () => {
        expect(CONFIGURATION_PROCESS_QUEUE_SECTIONS).toEqual([
            "stages",
            "work-views",
            "actions",
            "automation",
            "health",
        ]);
        expect(CONFIGURATION_PROCESS_QUEUE_SECTIONS).not.toContain("presentation");
        // Participation is a compact card at the top of Stages, not a nav section.
        expect(CONFIGURATION_PROCESS_QUEUE_SECTIONS).not.toContain("participation");

        const nav = read("components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx");
        expect(nav).toContain("CONFIGURATION_PROCESS_QUEUE_GROUPS");
        expect(nav).not.toContain("business-process-nav-presentation");
        expect(nav).not.toContain('id: "presentation"');
        expect(nav).not.toContain("business-process-nav-participation");
    });

    it("uses Processes title and Work Views label", () => {
        expect(BUSINESS_PROCESS_SETTINGS_PAGE_TITLE).toBe("Processes");
        expect(BUSINESS_PROCESS_NAV_WORK_VIEWS).toBe("Work Views");

        const strip = read("components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx");
        expect(strip).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_TITLE");
        const surface = read("components/adminV2/settings/businessProcess/ProcessesConfigurationPage.tsx");
        expect(surface).toContain('data-testid="settings-processes-page"');
    });

    it("Work View editor uses Purpose label, not Mission", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("BUSINESS_PROCESS_SECTION_PURPOSE");
        expect(card).not.toContain("BUSINESS_PROCESS_LENS_MISSION");
    });

    it("technical ids stay inside collapsed Advanced", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY");
        expect(card).toContain("<details");

        const stagesList = read("components/adminV2/settings/businessProcess/BusinessProcessStagesListColumn.tsx");
        expect(stagesList).toContain("{stage.label}");
        expect(stagesList).not.toMatch(/>\s*\{stage\.key\}\s*</);
    });

    it("forbids legacy builder settings routes", () => {
        expect(CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES).toContain("/settings/queue-builder");
        expect(CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES).toContain("/settings/focus-panel-builder");
    });

    it("keeps BOS rail in AdminV2 shell", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("AdminV2PersistentCommandRail");
        expect(shell).toContain("CommandRailBosMount");
    });

    it("configuration runtime CSS avoids alloy-blue on primary surfaces", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).not.toContain("alloy-blue");
        expect(css).not.toContain("bg-blue-");
        expect(css).toContain("config-mode-selected");
        expect(css).toContain("rgba(0, 162, 131, 0.08)");
    });

    it("business process configuration components avoid alloy-blue", () => {
        const files = [
            "components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx",
            "components/adminV2/settings/businessProcess/BusinessProcessConfigurationShell.tsx",
            "components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx",
            "components/adminV2/settings/businessProcess/BusinessProcessWorkViewsListColumn.tsx",
            "components/adminV2/settings/businessProcess/BusinessProcessWorkViewsSetupWorkspace.tsx",
            "components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx",
            "components/adminV2/settings/businessProcess/WorkViewConditionEditor.tsx",
            "components/adminV2/settings/businessProcess/WorkViewConditionValueControl.tsx",
            "components/adminV2/settings/configurationRuntime/LayoutAssignmentCard.tsx",
        ];
        for (const file of files) {
            const src = read(file);
            expect(src, file).not.toMatch(/alloy-blue|bg-blue-|text-blue-|slate-/);
        }
    });

    it("doctrine docs forbid blue/gray admin styling as acceptable primary styling", () => {
        for (const rel of DOCTRINE_DOCS) {
            const doc = readFileSync(resolve(root, rel), "utf8");
            expect(doc, rel).toMatch(/do not use|Do not use|forbidden|must not/i);
            expect(doc, rel).toMatch(/blue|slate|gray admin|Configuration Mode/i);
            expect(doc, rel).toMatch(/alloy-pine|pine|Configuration Mode/i);
        }
    });

    it("LifecycleActivationBoard no longer mounts top-level Presentation workspace", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain("BusinessProcessPresentationWorkspace");
        expect(board).not.toContain('processSection === "presentation"');
        expect(board).toContain("BusinessProcessStagesListColumn");
    });
});
