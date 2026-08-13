/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

describe("Alloy Operational Workspace Doctrine V2", () => {
    it("exports the frozen component barrel", () => {
        const barrel = read("components/workspace/doctrine.ts");
        for (const name of [
            "WorkspaceShell",
            "WorkspaceHeader",
            "WorkspaceModeNav",
            "WorkspaceModeTabs",
            "WorkspaceSubTabs",
            "WorkspaceMetricTiles",
            "WorkspaceOperationalHealth",
            "WorkspaceSurface",
            "WorkspaceCard",
            "WorkspaceZonePanel",
            "WorkspaceDivider",
            "WorkspaceSection",
        ]) {
            expect(barrel).toContain(name);
        }
    });

    it("WorkspaceShell owns inset stone field canvas (Layer 2)", () => {
        const shell = read("components/workspace/WorkspaceShell.tsx");
        expect(shell).toContain("WS_SHELL_INSET");
        expect(shell).toContain("WS_FIELD_CANVAS");
        expect(shell).toContain('data-workspace-shell-inset="true"');
    });

    it("Processing composes WorkspaceShell + WorkspaceOperationalHealth", () => {
        const shell = read("app/adminV2/pos/DigitalMailroomShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).not.toContain("OperationalModalHeader");
        expect(shell).toContain('<ProcessingKpiStrip mode={mode} />');
        const strip = read("app/adminV2/pos/ProcessingKpiStrip.tsx");
        expect(strip).toContain("WorkspaceOperationalHealth");
        expect(strip).not.toContain("WorkspaceMetricTiles");
    });

    it("Communications composes WorkspaceShell + WorkspaceOperationalHealth", () => {
        const shell = read("app/adminV2/communications/CommunicationsWorkspaceShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).not.toContain("OperationalModalHeader");
        expect(shell).not.toContain("CompactKpiStrip");
        const strip = read("app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx");
        expect(strip).toContain("WorkspaceOperationalHealth");
        expect(strip).not.toContain("WorkspaceMetricTiles");
        expect(strip).not.toContain("CompactKpiStrip");
    });

    it("Work Items composes WorkspaceShell + WorkspaceOperationalHealth + WorkspaceSurface", () => {
        const shell = read("app/adminV2/tasks/WorkItemsShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).toContain("WorkspaceSurface");
        expect(shell).toContain("WorkItemsKpiStrip");
        expect(shell).toContain("hideHeaderMetrics");
        expect(shell).not.toContain("OperationalModalHeader");
        const strip = read("app/adminV2/tasks/WorkItemsKpiStrip.tsx");
        expect(strip).toContain("WorkspaceOperationalHealth");
        expect(strip).not.toContain("WorkspaceMetricTiles");
    });

    it("Processing queue workspace uses shared zone panel and tokens", () => {
        const workspace = read("app/adminV2/pos/PosProcessingWorkspace.tsx");
        expect(workspace).toContain("WorkspaceZonePanel");
        expect(workspace).toContain("WS_QUEUE_RAIL");
        expect(workspace).not.toContain("ProcessingParentPanel");
    });

    it("workspace tokens define strengthened stone field and typography freeze", () => {
        const tokens = read("components/workspace/workspaceTokens.ts");
        expect(tokens).toContain('export const WS_FIELD = "bg-alloy-stone/[0.07]"');
        expect(tokens).toContain("export const WS_TEXT_SECONDARY = \"text-alloy-slate\"");
        expect(tokens).toContain("export const WS_TEXT_MUTED = \"text-alloy-midnight/40\"");
    });

    it("compact header and visible nav/content dividers are doctrine-owned", () => {
        const header = read("app/adminV2/components/OperationalModalHeader.tsx");
        expect(header).toContain('data-workspace-header-compact="true"');
        const shell = read("components/workspace/WorkspaceShell.tsx");
        expect(shell).toContain("WS_CONTROL_BAND_DIVIDER");
        const tokens = read("components/workspace/workspaceTokens.ts");
        expect(tokens).toContain("border-alloy-stone/30");
        const divider = read("components/workspace/WorkspaceDivider.tsx");
        expect(divider).toContain("WS_DIVIDER_FILL");
    });

    it("WorkspaceOperationalHealth supports flat operational health band", () => {
        const health = read("components/workspace/WorkspaceOperationalHealth.tsx");
        expect(health).toContain("data-workspace-operational-health");
        expect(health).toContain("WS_METRIC_EYEBROW");
        expect(health).not.toContain("SurfaceHeaderKpiCard");
        const processing = read("app/adminV2/pos/ProcessingKpiStrip.tsx");
        expect(processing).toContain('"Today\'s activity"');
        expect(processing).toContain('"Studio health"');
    });

    it("Processing operational health is contextual by mode", () => {
        const strip = read("app/adminV2/pos/ProcessingKpiStrip.tsx");
        expect(strip).toContain('label: "Active Work"');
        expect(strip).toContain('label: "Needs Review"');
        expect(strip).toContain('label: "Ready to Publish"');
        expect(strip).toContain('label: "Published"');
        expect(strip).toContain('label: "Forms"');
        expect(strip).toContain('label: "Draft"');
        expect(strip).toContain('label: "Generated"');
        expect(strip).toContain("WORK_TRENDS");
        expect(strip).toContain("STUDIO_TRENDS");
    });

    it("WorkspaceShell separates nav chrome from workspace body", () => {
        const shell = read("components/workspace/WorkspaceShell.tsx");
        expect(shell).toContain("WS_CONTROL_BAND_DIVIDER");
        expect(shell).toContain("data-workspace-control-band");
        const tokens = read("components/workspace/workspaceTokens.ts");
        expect(tokens).toContain("export const WS_CONTROL_BAND_DIVIDER");
    });

    it("Processing uses artifact viewport with zoom controls", () => {
        const viewport = read("app/adminV2/pos/ProcessingSourceDocumentViewport.tsx");
        expect(viewport).toContain("WorkspaceArtifactZoomControls");
        expect(viewport).toContain("data-workspace-artifact-viewport");
        const setup = read("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(setup).toContain("ProcessingSourceDocumentViewport");
    });

    it("Processing uses artifact canvas containment for source document", () => {
        const setup = read("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(setup).toContain("ProcessingSourceDocumentViewport");
        const tokens = read("components/workspace/workspaceTokens.ts");
        expect(tokens).toContain("export const WS_ARTIFACT_CANVAS");
    });

    it("Processing uses artifact viewport and queue doctrine primitives", () => {
        const setup = read("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(setup).toContain("ProcessingSourceDocumentViewport");
        const viewport = read("app/adminV2/pos/ProcessingSourceDocumentViewport.tsx");
        expect(viewport).toContain("WS_ARTIFACT_CANVAS");
        expect(viewport).toContain('data-workspace-artifact-viewport="true"');
        const workspace = read("app/adminV2/pos/PosProcessingWorkspace.tsx");
        expect(workspace).toContain("WS_QUEUE_RAIL");
        const tokens = read("lib/pos/processingPresentationTokens.ts");
        expect(tokens).toContain("PROCESSING_QUEUE_ROW_TITLE");
    });

    /**
     * Roster is the fifth operational workspace. It must be indistinguishable in
     * chrome from Communications / Processing / Work Items / Assignments — the
     * operator learns the grammar once. This asserts the structural contract, not
     * the appearance: same modal shell, same `WorkspaceShell`, same canonical
     * header inputs, same data-attribute markers, same sidebar nav primitive.
     */
    it("Roster mirrors the operational workspace grammar", () => {
        const shell = read("app/adminV2/roster/RosterWorkspaceShell.tsx");
        expect(shell).toContain('from "@/components/workspace/WorkspaceShell"');
        // Canonical header inputs, and the site picker uses the shared control.
        expect(shell).toContain("titleId");
        expect(shell).toContain('title: "Roster"');
        expect(shell).toContain("AlloySelect");
        expect(shell).toContain('aria-label="Site"');
        // Section tabs + the control-band health column, like every peer.
        expect(shell).toContain("sectionTabs={ROSTER_SECTION_TABS}");
        expect(shell).toContain("metricsColumn={metricsColumn}");
        expect(shell).toContain('navDataAttr="roster"');
        expect(shell).toContain('sectionsDataAttr="roster"');
        expect(shell).toContain('dataTestId="roster-workspace-shell"');

        // Mounted as a center-workspace modal in the shared BOS modal shell.
        const modal = read("app/adminV2/components/RosterModal.tsx");
        expect(modal).toContain("AdminV2WorkspaceBosModalShell");
        expect(modal).toContain('ariaLabelledBy="roster-workspace-title"');

        // Health lives in the control band and uses the shared band component —
        // never a Roster-local metric layout, and never in the body.
        const kpi = read("app/adminV2/roster/RosterKpiStrip.tsx");
        expect(kpi).toContain("WorkspaceOperationalHealth");

        // Sidebar entry uses the same nav primitive as the other four.
        const nav = read("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(nav).toContain("SidebarRosterNavItem");
        expect(nav).toContain('dataAttr="roster"');
    });

    /**
     * Suppressing the mode rail is OPT-IN. Inferring it from `modes.length` would
     * silently change Work Items, which also declares exactly one mode.
     */
    it("the mode rail is opt-out, never inferred from the mode count", () => {
        const nav = read("components/workspace/WorkspaceModeNav.tsx");
        expect(nav).toContain("showModeRail = true");
        expect(nav).not.toMatch(/modes\.length\s*>\s*1/);
        const workItems = read("app/adminV2/tasks/workItemsSections.ts");
        expect(workItems).toContain("WORK_ITEMS_MODES");
        // Work Items keeps its rail: it never opts out.
        const workItemsShell = read("app/adminV2/tasks/WorkItemsShell.tsx");
        expect(workItemsShell).not.toContain("showModeRail");
    });

    it("WorkspaceModeNav is canonical; OperationalWorkspaceModeNav re-exports", () => {
        const legacy = read("app/adminV2/components/OperationalWorkspaceModeNav.tsx");
        expect(legacy).toContain('from "@/components/workspace/WorkspaceModeNav"');
        const nav = read("components/workspace/WorkspaceModeNav.tsx");
        expect(nav).toContain("WorkspaceModeTabs");
        expect(nav).toContain("WorkspaceSubTabs");
    });

    it("Processing operational health follows semantic color doctrine", () => {
        const strip = read("app/adminV2/pos/ProcessingKpiStrip.tsx");
        expect(strip).toContain('tone: "pine"');
        expect(strip).toContain('tone: "ember"');
        expect(strip).toContain('tone: "gold"');
        expect(strip).toContain('tone: "midnight"');
        expect(strip).not.toContain('label: "Ready"');
    });

    it("operational health reserves trend line spacing", () => {
        const health = read("components/workspace/WorkspaceOperationalHealth.tsx");
        expect(health).toContain("data-workspace-operational-health-trend");
        expect(health).toContain("text-transparent");
    });

    it("artifact viewport uses bounded scroll and dual-axis fit-page scale", () => {
        const viewport = read("app/adminV2/pos/ProcessingSourceDocumentViewport.tsx");
        expect(viewport).toContain("resolveArtifactScale");
        expect(viewport).toContain("ResizeObserver");
        expect(viewport).toContain("basis-0");
        expect(viewport).toContain("data-workspace-artifact-scale-mode");
        expect(viewport).toContain("data-workspace-artifact-effective-scale");
        expect(viewport).toContain("zoom: effectiveScale");
        const scale = read("lib/workspace/artifactViewportScale.ts");
        expect(scale).toContain("computeFitPageScale");
        expect(scale).toContain("Math.min(scaleW, scaleH, 1)");
    });

    it("Processing is the certified reference implementation", () => {
        const doc = read("../docs/platform/core/navigation-and-workspace-doctrine.md");
        expect(doc).toContain("Reference implementation");
        expect(doc).toContain("Digital Mailroom");
        expect(doc).toContain("Operational health doctrine");
        expect(doc).toContain("WorkspaceOperationalHealth");
        expect(doc).toContain("Alloy Operational Workspace Doctrine V3");
        expect(doc).toContain("Metrics are section-scoped");
        expect(doc).toContain("Needs Reply");
        const mailroom = read("app/adminV2/pos/DigitalMailroomShell.tsx");
        expect(mailroom).toContain("WorkspaceShell");
        expect(mailroom).toContain("ProcessingKpiStrip");
        const overview = read("app/adminV2/pos/ProcessingOverviewLanding.tsx");
        expect(overview).toContain("ProcessingLandingActionCard");
        expect(overview).toContain("WorkspaceSurface");
        const queue = read("app/adminV2/pos/PosProcessingWorkspace.tsx");
        expect(queue).toContain("WorkspaceZonePanel");
        expect(queue).toContain("PosTemplateSetupColumn");
        const barrel = read("components/workspace/doctrine.ts");
        expect(barrel).toContain("reference implementation");
    });
});
