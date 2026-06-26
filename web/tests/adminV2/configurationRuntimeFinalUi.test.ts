/**
 * Configuration Runtime final UI — layout drift prevention.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_PROCESS_QUEUE_SECTIONS } from "@/lib/adminV2/configurationModeDoctrine";
import {
    CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES,
} from "@/lib/adminV2/configurationWorkspaceDomains";
import {
    BUSINESS_PROCESS_NAV_WORK_VIEWS,
    BUSINESS_PROCESS_SETTINGS_PAGE_TITLE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { isPublicMarketingChromeSuppressedPath } from "@/lib/admin/canonicalAdminRoutes";

const root = resolve(__dirname, "../..");
const mockupDir = resolve(root, "../docs/sprints/06_2026/configuration-runtime-bp-ux-redesign");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime final Processes UI", () => {
    it("processes page uses two-column configuration shell layout", () => {
        const page = read("app/adminV2/settings/processes/page.tsx");
        expect(page).toContain('data-testid="settings-processes-page"');
        expect(page).toContain("process-config-page");
        expect(page).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE");

        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const shell = read("components/adminV2/settings/businessProcess/BusinessProcessConfigurationShell.tsx");
        expect(board).toContain("BusinessProcessConfigurationShell");
        expect(shell).toContain('data-testid="business-process-configuration-shell"');
        expect(board).not.toContain("BusinessProcessWorkspaceNav");
    });

    it("uses Processes label and Work Views in configuration nav", () => {
        expect(BUSINESS_PROCESS_SETTINGS_PAGE_TITLE).toBe("Processes");
        expect(BUSINESS_PROCESS_NAV_WORK_VIEWS).toBe("Work Views");
        expect(CONFIGURATION_PROCESS_QUEUE_SECTIONS).not.toContain("presentation");

        const nav = read("components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx");
        expect(nav).toContain("CONFIGURATION_PROCESS_QUEUE_GROUPS");
        expect(nav).toContain('`business-process-nav-${sectionId}`');
        expect(nav).not.toContain("business-process-nav-presentation");
    });

    it("stages section uses list column pattern", () => {
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessStagesListColumn.tsx")).toContain(
            'data-testid="business-process-stages-list-column"',
        );
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BusinessProcessStagesListColumn");
    });

    it("process selector strip supports dropdown/chips and create", () => {
        const strip = read("components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx");
        expect(strip).toContain("process-config-selector-dropdown");
        expect(strip).toContain("lifecycle-catalog-create-new");
        expect(strip).toContain("process-config-process-card--active");
    });

    it("work views split into list column and setup workspace", () => {
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessWorkViewsListColumn.tsx")).toContain(
            'data-testid="business-process-work-views-list-column"',
        );
        expect(read("components/adminV2/settings/businessProcess/BusinessProcessWorkViewsSetupWorkspace.tsx")).toContain(
            "WorkViewProcessEditorCard",
        );
        const editor = read("components/adminV2/settings/businessProcess/WorkViewConditionEditor.tsx");
        expect(editor).toContain("WorkViewConditionValueControl");
        expect(editor).not.toContain('placeholder="Value"');
    });

    it("presentation assignment cards explain surface default", () => {
        const card = read("components/adminV2/settings/configurationRuntime/LayoutAssignmentCard.tsx");
        expect(card).toContain("BUSINESS_PROCESS_PRESENTATION_SURFACE_DEFAULT_LABEL");
        expect(card).toContain("-assignment-card");
    });

    it("settings processes route suppresses marketing chrome", () => {
        expect(isPublicMarketingChromeSuppressedPath("/settings/processes")).toBe(true);
    });

    it("forbids legacy builder settings routes", () => {
        expect(CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES).toContain("/settings/queue-builder");
        expect(CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES).toContain("/settings/focus-panel-builder");
    });

    it("BOS rail mount remains in AdminV2 shell", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("AdminV2PersistentCommandRail");
        expect(shell).toContain("CommandRailBosMount");
    });

    it("references approved mockup assets", () => {
        for (const file of ["mockup-business-processes-page.png", "mockup-perspective-card.png"]) {
            expect(() => readFileSync(resolve(mockupDir, file))).not.toThrow();
        }
    });
});
