/**
 * Configuration Runtime QA Fix 2 — browser style + UX drift prevention.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_PROCESS_QUEUE_SECTIONS } from "@/lib/adminV2/configurationModeDoctrine";
import { CONFIGURATION_MODE_NAV_ITEMS } from "@/lib/adminV2/configurationModeNav";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime QA Fix 2", () => {
    it("/settings renders configuration hub tiles", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("SettingsConfigurationHub");
        const hub = read("app/adminV2/settings/SettingsConfigurationHub.tsx");
        expect(hub).toContain('data-testid="settings-index-page"');
        expect(hub).toContain("CONFIGURATION_MODE_NAV_GROUPS");
        expect(CONFIGURATION_MODE_NAV_ITEMS.length).toBeGreaterThanOrEqual(11);
    });

    it("settings rail uses Lucide icons and Home entry", () => {
        const nav = read("app/adminV2/components/SidebarConfigurationModeNav.tsx");
        expect(nav).toContain("configurationModeNavLucideIcon");
        expect(nav).toContain('data-testid="config-mode-nav-home"');
        expect(nav).not.toMatch(/>\s*[A-Z]\s*</);
        expect(nav).not.toContain('icon: "P"');
    });

    it("process configuration nav uses Lucide icons not letter placeholders", () => {
        const nav = read("components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx");
        expect(nav).toContain("from \"lucide-react\"");
        expect(nav).not.toContain('icon: "◎"');
        expect(nav).not.toContain("business-process-nav-presentation");
    });

    it("Ready Check absent from stage workspace", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).not.toContain("Ready Check");
        expect(workspace).not.toContain("ready_check");
        expect(workspace).not.toContain("BUSINESS_PROCESS_CARD_READY");
        expect(workspace).not.toContain("defaultOpen");
    });

    it("Presentation absent as top-level Processes nav item", () => {
        expect(CONFIGURATION_PROCESS_QUEUE_SECTIONS).not.toContain("presentation");
    });

    it("Work View editor supports multi-sort and condensed presentation", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        const sortEditor = read("components/adminV2/settings/businessProcess/WorkViewSortRulesEditor.tsx");
        const sectionState = read("components/adminV2/settings/businessProcess/useWorkViewEditorSectionState.ts");
        const summaries = read("lib/lifecycle/workViewEditorSummaries.ts");
        expect(card).toContain("WorkViewSortRulesEditor");
        expect(card).toContain("useWorkViewEditorSectionState");
        expect(card).toContain("workViewEditorSummaries");
        expect(summaries).toContain("formatWorkViewConditionsSummary");
        expect(sectionState).toContain("basics: true");
        expect(sectionState).toContain("conditions: false");
        expect(sortEditor).toContain("-add-sort");
        expect(sortEditor).toContain("Newest first");
        expect(card).not.toContain("lg:grid-cols-[minmax(0,1fr)_16rem]");
        expect(card).toContain("LayoutAssignmentCard");
        expect(card).not.toContain("LayoutPresentationPreview");
        expect(card).toContain('testId="work-view-section-basics"');
    });

    it("Configuration Health is process-level, not stage readiness", () => {
        const health = read("components/adminV2/settings/businessProcess/BusinessProcessHealthQueueWorkspace.tsx");
        expect(health).toContain("Configuration Health");
        expect(health).toContain("business-process-health-process-item");
        expect(health).toContain("BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY");
        const labels = read("lib/lifecycle/businessProcessUiLabels.ts");
        expect(labels).toContain('BUSINESS_PROCESS_NAV_HEALTH = "Configuration Health"');
    });

    it("settings active nav uses Bend Pine not mint/cyan", () => {
        const css = read("app/adminV2/adminV2.css");
        expect(css).not.toContain("#7ee8cc");
        expect(css).toContain("#00a283");
    });

    it("relative date controls remain in condition value control", () => {
        const control = read("components/adminV2/settings/businessProcess/WorkViewConditionValueControl.tsx");
        expect(control).toContain("WORK_VIEW_DATE_PRESET_OPTIONS");
        expect(control).toContain("work-view-condition-date-relative");
    });

    it("Actions workspace uses queue/workspace model with pine controls", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BusinessProcessActionsListColumn");
        expect(board).toContain("BusinessProcessActionsSetupWorkspace");
        expect(board).not.toContain("<LifecycleActionsMatrix");
        const actions = read("components/adminV2/settings/businessProcess/BusinessProcessActionsQueueWorkspace.tsx");
        expect(actions).toContain("config-mode-control");
    });

    it("configurationRuntime.css enforces white canvas and pine accent controls", () => {
        const css = read("app/adminV2/settings/configurationRuntime.css");
        expect(css).toContain("background: #ffffff");
        expect(css).toContain("accent-color: rgb(0, 162, 131)");
        expect(css).toContain("rgba(0, 162, 131, 0.08)");
        expect(css).not.toContain("alloy-blue");
    });

    it("playwright QA fix 2 spec captures required screenshots", () => {
        expect(read("playwright/tests/configuration-runtime-qa-fix-2.spec.ts")).toContain(
            "configuration-runtime-qa-fix-2",
        );
    });
});
