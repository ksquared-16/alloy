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

    it("publishes runtime Perspective via the canonical hook (page delegates, does not own derivation)", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        // The page delegates perspective derivation + publication to the canonical runtime hook
        // instead of owning the deriveRuntimePerspective/setActiveRuntimePerspective effect.
        expect(page).toContain("useWorkUnitRuntimePerspective(");
        expect(page).not.toContain("setActiveRuntimePerspective");
        expect(page).not.toContain("deriveRuntimePerspective");
        // The canonical hook owns the derivation + store publication.
        const hook = readSrc("lib/adminV2/runtime/perspective/useWorkUnitRuntimePerspective.ts");
        expect(hook).toContain("setActiveRuntimePerspective");
        expect(hook).toContain("deriveRuntimePerspective");
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

    it("bridges Focus Panel shell to synchronous split intent (atomic commit, no attr-lag flash)", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        // focusPanelActive must be the union of the async attribute and the synchronous intent so
        // the Focus Panel shell mounts + the centered opening overlay is suppressed in the SAME
        // commit the queue compresses — not a MutationObserver round-trip later.
        expect(runtime).toContain("focusPanelSplitIntent");
        expect(runtime).toMatch(
            /const focusPanelActive\s*=\s*useAlloyOsRuntimeSplitActive\(\)\s*\|\|\s*focusPanelSplitIntent/,
        );
        // The intent mirrors the controller's exact decision inputs (no divergence).
        expect(runtime).toContain("alloyOsRuntimeSplitActive({");
        expect(runtime).toContain("isWorkUnitQueueSurfacePath(pathname)");
        expect(runtime).toContain("runtimePerspectiveAttrValue(activeRuntimePerspective)");
        // Centered opening overlay stays quarantined from split (no centered record loader).
        expect(runtime).toContain("!focusPanelActive");
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
