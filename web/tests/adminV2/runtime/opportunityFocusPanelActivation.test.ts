import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { alloyOsRuntimeSplitActive } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Opportunity Focus Panel activation wiring", () => {
    it("mounts AlloyOsRuntimeSplitController at admin shell drawer scope", () => {
        const shell = readSrc("app/adminV2/components/AdminV2ShellDrawerScope.tsx");
        expect(shell).toContain("AlloyOsRuntimeSplitController");
    });

    it("publishes runtime Perspective from the work-unit page", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        expect(page).toContain("setActiveRuntimePerspective");
        expect(page).toContain("deriveRuntimePerspective");
    });

    it("OpportunityDrawerVmRuntime gates Focus Panel on split active", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("useAlloyOsRuntimeSplitActive");
        expect(runtime).toContain("focusPanelActive");
        expect(runtime).toContain("OpportunityFocusPanelHeader");
        expect(runtime).toContain("OpportunityFocusPanelModeBody");
        expect(runtime).toContain("focusPanelMode");
        expect(runtime).toContain("focusPanelPresentation={focusPanelActive}");
        expect(runtime).toContain("!focusPanelActive");
        // Legacy tab strip and lifecycle rail only when Focus Panel is inactive.
        expect(runtime).toContain("{!layoutCutoverHeader && !focusPanelActive ?");
        expect(runtime).toContain('data-opportunity-drawer-tab-strip="true"');
        expect(runtime).toMatch(
            /\{focusPanelActive\s*\?\s*\n\s*<OpportunityFocusPanelModeBody/,
        );
    });

    it("Focus Panel header and mode switch expose regression markers", () => {
        const header = readSrc("components/admin/focusPanel/FocusPanelCompactHeader.tsx");
        expect(header).toContain('data-alloy-os-focus-panel-header="true"');
        const modeSwitch = readSrc("components/admin/focusPanel/FocusPanelModeSwitch.tsx");
        expect(modeSwitch).toContain('data-alloy-os-focus-panel-mode-switch="true"');
        expect(modeSwitch).toContain("Summary");
        expect(modeSwitch).toContain("Work");
        expect(modeSwitch).toContain("Activity");
    });

    it("Focus Panel body derives business-question card keys", () => {
        const cards = readSrc("lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts");
        for (const key of [
            "attention",
            "current_mission",
            "current_work",
            "health",
            "readiness_kpi",
        ]) {
            expect(cards).toContain(`"${key}"`);
        }
    });

    it("EntityDrawerOperatingShell marks focus panel scroll body", () => {
        const shell = readSrc("components/admin/drawer/EntityDrawerOperatingShell.tsx");
        expect(shell).toContain("focusPanelPresentation");
        expect(shell).toContain('data-alloy-os-focus-panel": "true"');
    });

    it("requires perspective + drawer + work-unit surface for State 2", () => {
        expect(
            alloyOsRuntimeSplitActive({
                perspectiveActive: true,
                drawerOpen: true,
                onWorkUnitSurface: true,
            }),
        ).toBe(true);
        expect(
            alloyOsRuntimeSplitActive({
                perspectiveActive: false,
                drawerOpen: true,
                onWorkUnitSurface: true,
            }),
        ).toBe(false);
    });

    it("sets focus panel dock left var when split geometry is active", () => {
        const geometry = readSrc("lib/bos/drawerWorkspaceGeometry.ts");
        expect(geometry).toContain("ALLOY_OS_FOCUS_PANEL_LEFT_CSS_VAR");
        expect(geometry).toContain("computeAlloyOsFocusPanelBounds");
        expect(geometry).toContain("isAlloyOsSplitGeometryActive");
    });

    it("Drawer watches split attribute for geometry remeasure", () => {
        const drawer = readSrc("components/admin/Drawer.tsx");
        expect(drawer).toContain("ALLOY_OS_RUNTIME_SPLIT_ATTR");
        expect(drawer).toContain("data-alloy-os-focus-panel-docked");
    });
});
