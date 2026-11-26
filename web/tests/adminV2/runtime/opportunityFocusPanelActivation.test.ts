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

    it("the inline Focus Panel region is the one record surface — there is no gate any more", () => {
        // These two tests certified a BRANCH: `OpportunityDrawerVmRuntime` chose between the Focus
        // Panel body and the legacy tab/overview body depending on whether the split was active.
        // Both sides of that branch lived inside the modal shell, and the shell is gone. The inline
        // region renders unconditionally on a work-unit surface, so there is nothing left to gate.
        const inline = readSrc("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");
        expect(inline).toContain("OpportunityFocusPanelHeader");
        expect(inline).toContain("OpportunityFocusPanelBody");
        // No shell chrome: no portal, no backdrop, no modal.
        expect(inline).not.toContain("EntityDrawerOperatingShell");
        expect(inline).not.toContain("createPortal");
    });

    it("Focus Panel header and mode switch expose regression markers", () => {
        const header = readSrc("components/admin/focusPanel/FocusPanelCompactHeader.tsx");
        expect(header).toContain('data-alloy-os-focus-panel-header="true"');
        const modeSwitch = readSrc("components/admin/focusPanel/FocusPanelModeSwitch.tsx");
        expect(modeSwitch).toContain('data-alloy-os-focus-panel-mode-switch="true"');
        // Two-mode model: Work (Core Four surface) + Activity. Legacy split Work merged.
        expect(modeSwitch).toContain("FOCUS_PANEL_SWITCH_MODES");
        const modeDefs = readSrc("lib/adminV2/runtime/focusPanel/focusPanelMode.ts");
        expect(modeDefs).toContain('summary: "Work"');
        expect(modeDefs).toContain('FOCUS_PANEL_SWITCH_MODES: readonly FocusPanelMode[] = ["summary", "activity"]');
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
