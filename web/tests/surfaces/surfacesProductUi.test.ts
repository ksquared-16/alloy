import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildSurfacesLandingModel,
    buildSurfacesLandingSections,
    SURFACES_LANDING_HREF,
    surfacesSectionHref,
} from "@/lib/configRuntime/surfacesLandingModel";
import { SURFACE_CONFIG_SECTIONS } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import { SURFACE_WORKSPACE_TABS } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";
import { isExperienceBuilderStudioActive } from "@/lib/layout/experienceBuilderStudioMode";
import {
    CANONICAL_ORGANIZATION_ACCESS_HREF,
    CANONICAL_ORGANIZATION_FINANCIALS_HREF,
    CANONICAL_ORGANIZATION_PROCESSES_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF,
    CANONICAL_ORGANIZATION_SURFACES_HREF,
    adminSettingsSubpathHref,
} from "@/lib/admin/canonicalAdminRoutes";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../..");
function readSrc(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Surfaces product UI — landing tiles → Collection → Selected Surface", () => {
    const page = readSrc("app/adminV2/settings/surfaces/page.tsx");
    const shell = readSrc("components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx");
    const workspace = readSrc("components/adminV2/settings/surfaces/SurfacesPublicationWorkspace.tsx");

    it("canonical Surfaces URL is under /organization/surfaces", () => {
        expect(SURFACES_LANDING_HREF).toBe("/organization/surfaces");
        expect(CANONICAL_ORGANIZATION_SURFACES_HREF).toBe("/organization/surfaces");
        expect(adminSettingsSubpathHref("surfaces")).toBe("/organization/surfaces");
        expect(surfacesSectionHref("focus-panels")).toBe(
            "/organization/surfaces?section=focus-panels",
        );
    });

    it("Organization productized domains resolve under /organization", () => {
        expect(CANONICAL_ORGANIZATION_PROGRAMS_LOCATIONS_HREF).toBe("/organization/programs-locations");
        expect(CANONICAL_ORGANIZATION_FINANCIALS_HREF).toBe("/organization/financials");
        expect(CANONICAL_ORGANIZATION_ACCESS_HREF).toBe("/organization/access");
        expect(CANONICAL_ORGANIZATION_PROCESSES_HREF).toBe("/organization/processes");
        expect(adminSettingsSubpathHref("users-roles")).toBe("/organization/access");
        expect(adminSettingsSubpathHref("processes")).toBe("/organization/processes");
        expect(adminSettingsSubpathHref("financials")).toBe("/organization/financials");
    });

    it("bare Surfaces route mounts the Financials-style tile landing", () => {
        expect(page).toContain("SurfacesPublicationWorkspace");
        expect(workspace).toContain("CompactGroupedLandingShell");
        expect(workspace).toContain("SurfacesLanding");
        expect(workspace).toContain("hideCategoryRail");
        const model = buildSurfacesLandingModel();
        expect(model.summaryCards).toEqual([]);
        expect(buildSurfacesLandingSections().map((s) => s.id)).toEqual([
            "focus-panels",
            "queue-rows",
            "workspaces",
            "work-units",
            "operational-intelligence",
        ]);
    });

    it("category drill-in omits the category rail (tiles own category navigation)", () => {
        expect(shell).toContain("hideCategoryRail");
        expect(shell).toContain("hideCategoryRail ? undefined");
    });

    it("never navigates to a detached full-bleed standalone builder as the primary Edit journey", () => {
        expect(shell).not.toContain("enterFocusPanelStudio");
        expect(shell).not.toContain("exitStudio");
        expect(shell).not.toContain("isFullBleedWorkspaceEditor");
        expect(shell).not.toContain('params.set("editor", "1")');
        expect(shell).toContain("syncSurfacesUrl");
        expect(shell).toContain("router.replace");
        expect(shell).not.toMatch(/router\.replace\([^)]*editor=1/);
    });

    it("`?editor=1&layout=` resolves INTO embedded Edit mode inside this same shell", () => {
        expect(page).toContain("initialSurfaceId");
        expect(page).toContain("initialTab");
        expect(shell).toContain("openSurface(layout)");
        expect(shell).toContain('setTabState("edit")');
        expect(shell).toContain("listColumn=");
    });

    it("disables the full-bleed Experience Builder studio chrome for Surfaces specifically", () => {
        const params = new URLSearchParams("editor=1&layout=abc");
        expect(isExperienceBuilderStudioActive("/organization/surfaces", params)).toBe(false);
        expect(isExperienceBuilderStudioActive("/settings/surfaces", params)).toBe(false);
        expect(isExperienceBuilderStudioActive("/settings/layouts", params)).toBe(true);
    });

    it("category keys are present in both the shell and the section registry", () => {
        const keys = SURFACE_CONFIG_SECTIONS.map((s) => s.key);
        expect(keys).toEqual([
            "focus-panels",
            "queue-rows",
            "workspaces",
            "work-units",
            "operational-intelligence",
        ]);
        expect(shell).toContain("SurfacesCategoryNav");
    });

    it("Selected Surface workspace starts on Edit (builder) — Commands tab for exposure", () => {
        const tabKeys = SURFACE_WORKSPACE_TABS.map((t) => t.key);
        expect(tabKeys).toEqual(["edit", "commands", "assignments", "versions", "health", "history"]);
        expect(tabKeys).not.toContain("overview");
        expect(shell).toContain("surfaceWorkspaceTabsForSection");
        expect(shell).toContain("SURFACE_WORKSPACE_DEFAULT_TAB");
        expect(shell).toContain("ConfigWorkspaceTabBar");
        expect(shell).toContain('testIdPrefix="surfaces-tab"');
        expect(shell).toContain("setTabState(SURFACE_WORKSPACE_DEFAULT_TAB)");
        expect(shell).toContain("SurfaceCommandExposureEditor");
        expect(shell).not.toContain("SurfacesOverviewPanel");
        expect(shell).toContain("syncSurfacesUrl");
    });

    it("embedded editors clear selection via the Surfaces collection (no inner ← Surfaces chrome)", () => {
        expect(shell).toContain("onBack={clearSelection}");
        for (const editorRel of [
            "components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx",
            "components/adminV2/settings/surfaces/QueueRowSurfaceEditor.tsx",
            "components/adminV2/settings/surfaces/WorkspaceHeaderSurfaceEditor.tsx",
            "components/adminV2/settings/surfaces/WorkUnitHeaderSurfaceEditor.tsx",
            "components/adminV2/settings/surfaces/WorkspaceProcessesSurfaceEditor.tsx",
        ]) {
            expect(readSrc(editorRel)).not.toContain("← Surfaces");
        }
    });

    it("Surface builders wrap the right configuration rail in a collapsible panel (default collapsed)", () => {
        expect(readSrc("components/adminV2/settings/surfaces/SurfaceBuilderInspectorRail.tsx")).toContain(
            "defaultCollapsed = true",
        );
        expect(readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx")).toContain(
            "SurfaceBuilderInspectorRail",
        );
        expect(readSrc("components/adminV2/settings/surfaces/WorkspaceHeaderSurfaceEditor.tsx")).toContain(
            "SurfaceBuilderInspectorRail",
        );
        expect(readSrc("components/adminV2/settings/surfaces/WorkUnitHeaderSurfaceEditor.tsx")).toContain(
            "SurfaceBuilderInspectorRail",
        );
        expect(readSrc("components/adminV2/settings/surfaces/WorkspaceProcessesSurfaceEditor.tsx")).toContain(
            "SurfaceBuilderInspectorRail",
        );
        expect(readSrc("components/adminV2/settings/surfaces/NestedSurfaceEditor.tsx")).toContain(
            "SurfaceBuilderInspectorRail",
        );
    });

    it("lifts Save/Publish/Undo/Reset onto the tab row and keeps version in the collection list", () => {
        expect(shell).toContain("SurfaceEditTabActions");
        expect(shell).toContain("SurfaceBuilderChromeProvider");
        expect(shell).toContain("publicationBySurfaceId");
        expect(shell).toContain('trailing={tab === "edit" ? <SurfaceEditTabActions /> : null}');
        expect(readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx")).toContain(
            "useRegisterSurfaceBuilderChrome",
        );
        expect(readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx")).not.toContain(
            "surface-publish-toolbar",
        );
        expect(readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx")).not.toContain(
            "FocusPanelSummaryEditBar",
        );
        expect(readSrc("components/adminV2/settings/configurationRuntime/workspace/ConfigWorkspaceTabBar.tsx")).toContain(
            "trailing",
        );
    });

    it("marks History (and other not-yet-real surfaces) as Planned, never a fabricated fetch", () => {
        expect(shell).toContain("renderHistoryTab");
        expect(shell).toContain("A verified change history for this Surface is planned");
        expect(shell).toContain('data-capability="planned"');
    });

    it("embeds every wired editor inline in the Edit tab (rehosted, not routed)", () => {
        for (const editor of [
            "FocusPanelSummarySurfaceEditor",
            "QueueRowSurfaceEditor",
            "WorkspaceHeaderSurfaceEditor",
            "WorkspaceProcessesSurfaceEditor",
            "WorkUnitHeaderSurfaceEditor",
            "OperationalIntelligenceSurfaceBuilder",
            "NestedSurfaceEditor",
        ]) {
            expect(shell).toContain(editor);
        }
        expect(shell).toContain("onBack={clearSelection}");
    });
});
