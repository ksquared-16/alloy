/**
 * Configuration Runtime QA fix — drift prevention.
 * @see docs/sprints/archive/06_2026/configuration-runtime-qa-fix/
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_MODE_NAV_ITEMS } from "@/lib/adminV2/configurationModeNav";
import { CONFIGURATION_PROCESS_QUEUE_GROUPS } from "@/lib/adminV2/configurationModeDoctrine";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const CONFIG_SURFACE_PATHS = [
    "app/adminV2/settings/SettingsConfigurationHub.tsx",
    "app/adminV2/settings/configurationRuntime.css",
    "components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx",
    "components/adminV2/settings/businessProcess/BusinessProcessActionsQueueWorkspace.tsx",
    "components/adminV2/settings/configurationRuntime/LayoutAssignmentCard.tsx",
    "components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx",
    "components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx",
];

describe("Configuration Runtime QA fix", () => {
    it("/settings renders configuration hub tiles", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("SettingsConfigurationHub");
        expect(page).not.toContain("SettingsIndexRedirect");
        const hub = read("app/adminV2/settings/SettingsConfigurationHub.tsx");
        expect(hub).toContain('data-testid="settings-configuration-hub"');
        expect(hub).toContain('data-testid="settings-configuration-sections"');
        expect(CONFIGURATION_MODE_NAV_ITEMS.length).toBe(11);
    });

    it("settings mode rail uses Lucide icons, not letter placeholders", () => {
        const nav = read("app/adminV2/components/SidebarConfigurationModeNav.tsx");
        expect(nav).toContain("configurationModeNavLucideIcon");
        expect(nav).not.toMatch(/>\s*[A-Z]\s*</);
        const icons = read("lib/adminV2/configurationModeNavIcons.tsx");
        expect(icons).toContain("lucide-react");
    });

    it("Home icon remains visible in settings mode sidebar", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("{homeLink}");
        expect(sidebar).toContain("SidebarConfigurationModeNav");
        expect(sidebar).not.toMatch(/onSettings\s*\?\s*null\s*:\s*\{homeLink\}/);
    });

    it("Configuration Mode rail stays mounted on /organization/* product paths", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("path.startsWith(`${CANONICAL_ORGANIZATION_BASE}/`)");
        expect(sidebar).toContain("SidebarConfigurationModeNav");
        const providers = read("app/adminV2/settings/AdminV2SettingsClientProviders.tsx");
        expect(providers).toContain('path === "/organization/processes"');
        const lastSurface = read("lib/adminV2/configurationModeLastSurface.ts");
        expect(lastSurface).toContain('path.startsWith("/organization/")');
    });

    it("configuration surfaces avoid blue/slate selected-state classes", () => {
        for (const rel of CONFIG_SURFACE_PATHS) {
            const src = read(rel);
            expect(src, rel).not.toMatch(/\b(text|bg|border|ring)-blue-/);
            expect(src, rel).not.toMatch(/\b(text|bg|border|ring)-slate-/);
            expect(src, rel).not.toMatch(/\b(text|bg|border|ring)-sky-/);
        }
        const breadcrumb = read("app/adminV2/settings/SettingsHierarchyBreadcrumb.tsx");
        expect(breadcrumb).toContain("text-alloy-pine");
        expect(breadcrumb).not.toContain("text-alloy-blue");
    });

    it("Ready Check removed from Stages workspace", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).not.toContain("ready_check");
        expect(workspace).not.toContain("BUSINESS_PROCESS_CARD_READY");
        expect(workspace).not.toContain("stage-configuration-tab-ready_check");
    });

    it("Presentation is not a top-level process queue item", () => {
        const flatIds = CONFIGURATION_PROCESS_QUEUE_GROUPS.flatMap((group) => [...group.sections]);
        expect(flatIds).not.toContain("presentation");
        const nav = read("components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx");
        expect(nav).not.toContain('"presentation"');
    });

    it("Work View dynamic date controls render", () => {
        const control = read("components/adminV2/settings/businessProcess/WorkViewConditionValueControl.tsx");
        expect(control).toContain("WORK_VIEW_DATE_PRESET_OPTIONS");
        expect(control).toContain("work-view-condition-date-preset");
        expect(control).toContain("work-view-condition-date-relative");
        expect(control).toContain("work-view-condition-date-custom");
    });

    it("Work View presentation selectors render without preview thumbnails", () => {
        const card = read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx");
        expect(card).toContain("process-work-view-presentation-");
        expect(card).not.toContain("LayoutPresentationPreview");
        expect(card).not.toContain("PreviewThumbnail");
        const assignment = read("components/adminV2/settings/configurationRuntime/LayoutAssignmentCard.tsx");
        expect(assignment).toContain("-status-chip");
        expect(assignment).toContain("-select");
    });

    it("Actions queue/workspace renders without matrix default", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BusinessProcessActionsListColumn");
        expect(board).toContain("BusinessProcessActionsSetupWorkspace");
        expect(board).not.toContain("<LifecycleActionsMatrix");
        const actions = read("components/adminV2/settings/businessProcess/BusinessProcessActionsQueueWorkspace.tsx");
        expect(actions).toContain("business-process-actions-list-column");
        expect(actions).toContain("business-process-actions-workspace");
        expect(actions).toContain("accent-alloy-pine");
    });

    it("BOS rail remains in settings layout shell", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("adminv2-sidebar");
        expect(sidebar).toContain("settingsLink");
    });

    it("Stages operating plan uses collapsible work items and attention queue workspace", () => {
        const operatingPlan = read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx");
        expect(operatingPlan).toContain("stage-operating-plan-work-items-collapsible");
        expect(operatingPlan).toContain("stage-operating-plan-attention-collapsible");
        expect(operatingPlan).toContain('layout="queue_workspace"');
        const attention = read("components/adminV2/settings/lifecycle/LifecycleStageAttentionRulesEditor.tsx");
        expect(attention).toContain("stage-operating-plan-attention-queue-workspace");
    });

    it("misplaced stage More menu removed from stages workspace", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain('data-testid="lifecycle-board-more-menu"');
        expect(board).toContain('data-testid="lifecycle-process-context-actions"');
    });
});
