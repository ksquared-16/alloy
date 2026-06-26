/**
 * Configuration Runtime core interaction — drift prevention.
 * @see docs/sprints/06_2026/configuration_runtime_core_interaction_doctrine.md
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_MODE_DEFAULT_SURFACE,
    CONFIGURATION_MODE_NAV_ITEMS,
} from "@/lib/adminV2/configurationModeNav";
import { CONFIGURATION_PROCESS_QUEUE_GROUPS } from "@/lib/adminV2/configurationModeDoctrine";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime core interaction", () => {
    it("/settings renders configuration hub tiles", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("SettingsConfigurationHub");
        expect(page).not.toContain("SettingsIndexRedirect");
        const hub = read("app/adminV2/settings/SettingsConfigurationHub.tsx");
        expect(hub).toContain('data-testid="settings-index-page"');
    });

    it("settings providers omit duplicate SettingsWorkspaceNav sidebar", () => {
        const providers = read("app/adminV2/settings/AdminV2SettingsClientProviders.tsx");
        expect(providers).not.toContain("SettingsWorkspaceNav");
    });

    it("sidebar renders Configuration Mode nav on settings routes", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("SidebarConfigurationModeNav");
        const nav = read("app/adminV2/components/SidebarConfigurationModeNav.tsx");
        expect(nav).toContain('data-testid="configuration-mode-sidebar-nav"');
        expect(nav).toContain("item.testId");
    });

    it("registers configuration mode nav surfaces", () => {
        expect(CONFIGURATION_MODE_DEFAULT_SURFACE).toBe("/settings/processes");
        expect(CONFIGURATION_MODE_NAV_ITEMS.map((item) => item.label)).toEqual([
            "Processes",
            "Layouts",
            "Fields",
            "Statuses",
            "Actions",
            "Automation",
            "Operational Intelligence",
            "Integrations",
            "Security / Roles",
        ]);
    });

    it("process queue uses grouped Configure / Process / Health sections", () => {
        expect(CONFIGURATION_PROCESS_QUEUE_GROUPS.map((g) => g.label)).toEqual([
            "Configure",
            "Process",
            "Health",
        ]);
        const nav = read("components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx");
        expect(nav).toContain("CONFIGURATION_PROCESS_QUEUE_GROUPS");
        expect(nav).not.toContain("presentation");
    });

    it("auto-selects a process when catalog loads", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("selectCatalogEntry(catalog[0]!");
    });

    it("uses searchable dropdown when many processes exist", () => {
        const strip = read("components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx");
        expect(strip).toContain("process-config-selector-dropdown");
        expect(strip).toContain("VISIBLE_CHIP_LIMIT");
    });

    it("stages use stacked cards and operating plan work item queue", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("configuration-runtime-stage-card-grid");
        expect(workspace).not.toContain("ready_check");
        const operatingPlan = read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx");
        expect(operatingPlan).toContain("stage-operating-plan-work-queue");
        expect(operatingPlan).toContain("stage-operating-plan-work-workspace");
    });

    it("actions use queue list and setup workspace instead of matrix table", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BusinessProcessActionsListColumn");
        expect(board).toContain("BusinessProcessActionsSetupWorkspace");
        expect(board).not.toContain("<LifecycleActionsMatrix");
    });

    it("health uses process-level Configuration Health queue item", () => {
        const health = read("components/adminV2/settings/businessProcess/BusinessProcessHealthQueueWorkspace.tsx");
        expect(health).toContain("business-process-health-list-column");
        expect(health).toContain("Configuration Health");
        expect(health).toContain("business-process-health-process-item");
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BUSINESS_PROCESS_CONFIGURATION_HEALTH_SUMMARY");
    });

    it("work views default collapsed sections except basics", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("useWorkViewEditorSectionState");
        expect(card).toContain("work-view-section-basics");
        expect(card).toContain("work-view-section-conditions");
        expect(card).toContain("work-view-section-sort");
        expect(card).toContain("work-view-section-presentation");
    });

    it("settings rail includes Home entry in configuration mode", () => {
        const nav = read("app/adminV2/components/SidebarConfigurationModeNav.tsx");
        expect(nav).toContain('data-testid="config-mode-nav-home"');
        expect(nav).toContain("configurationModeNavLucideIcon");
    });

    it("work views use condensed single-column editor with presentation below sort", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("WorkViewSortRulesEditor");
        expect(card).not.toContain("lg:grid-cols-[minmax(0,1fr)_16rem]");
        expect(card).toContain("LayoutAssignmentCard");
    });

    it("ConfigurationModeShell exports shared layout primitives and Processes shell", () => {
        const shell = read("components/adminV2/settings/configurationRuntime/ConfigurationModeShell.tsx");
        expect(shell).toContain("ConfigurationContext");
        expect(shell).toContain("ConfigurationShell");
        expect(shell).toContain("BusinessProcessConfigurationShell");
    });

    it("core interaction doctrine doc forbids blue/gray admin styling", () => {
        const doc = readFileSync(
            resolve(root, "../docs/sprints/06_2026/configuration_runtime_core_interaction_doctrine.md"),
            "utf8",
        );
        expect(doc).toContain("Context → Configuration Queue → Configuration Workspace → BOS");
        expect(doc).toMatch(/No blue|Do not use.*blue/i);
        expect(doc).toContain("Presentation is not a top-level queue item");
    });
});
