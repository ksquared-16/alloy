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

    it("Processing composes WorkspaceShell + WorkspaceMetricTiles", () => {
        const shell = read("app/adminV2/pos/DigitalMailroomShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).not.toContain("OperationalModalHeader");
        const strip = read("app/adminV2/pos/ProcessingKpiStrip.tsx");
        expect(strip).toContain("WorkspaceMetricTiles");
    });

    it("Communications composes WorkspaceShell + WorkspaceMetricTiles", () => {
        const shell = read("app/adminV2/communications/CommunicationsWorkspaceShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).not.toContain("OperationalModalHeader");
        expect(shell).not.toContain("CompactKpiStrip");
        const strip = read("app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx");
        expect(strip).toContain("WorkspaceMetricTiles");
        expect(strip).not.toContain("CompactKpiStrip");
    });

    it("Work Items composes WorkspaceShell + WorkspaceMetricTiles + WorkspaceSurface", () => {
        const shell = read("app/adminV2/tasks/WorkItemsShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).toContain("WorkspaceSurface");
        expect(shell).toContain("WorkItemsKpiStrip");
        expect(shell).not.toContain("OperationalModalHeader");
        const strip = read("app/adminV2/tasks/WorkItemsKpiStrip.tsx");
        expect(strip).toContain("WorkspaceMetricTiles");
    });

    it("Processing queue workspace uses shared zone panel and tokens", () => {
        const workspace = read("app/adminV2/pos/PosProcessingWorkspace.tsx");
        expect(workspace).toContain("WorkspaceZonePanel");
        expect(workspace).toContain("WorkspaceDivider");
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
        expect(header).toContain("py-1.5");
        const nav = read("components/workspace/WorkspaceModeNav.tsx");
        expect(nav).toContain("WS_NAV_CONTENT_DIVIDER");
        const divider = read("components/workspace/WorkspaceDivider.tsx");
        expect(divider).toContain("WS_DIVIDER_FILL");
    });

    it("WorkspaceMetricTiles supports stacked metric band eyebrow", () => {
        const tiles = read("components/workspace/WorkspaceMetricTiles.tsx");
        expect(tiles).toContain("eyebrow?: string");
        expect(tiles).toContain("data-workspace-metric-band");
        expect(tiles).toContain("WS_METRIC_EYEBROW");
        const processing = read("app/adminV2/pos/ProcessingKpiStrip.tsx");
        expect(processing).toContain('eyebrow="Today\'s activity"');
        expect(processing).not.toContain("WS_METRIC_EYEBROW_INLINE");
    });

    it("Processing uses artifact canvas containment for source document", () => {
        const setup = read("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(setup).toContain("WS_ARTIFACT_CANVAS");
        expect(setup).toContain('data-workspace-artifact-canvas="true"');
        const tokens = read("components/workspace/workspaceTokens.ts");
        expect(tokens).toContain("export const WS_ARTIFACT_CANVAS");
    });

    it("Processing uses artifact viewport and queue doctrine primitives", () => {
        const setup = read("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(setup).toContain("WS_ARTIFACT_CANVAS");
        expect(setup).toContain('data-workspace-artifact-viewport="true"');
        const workspace = read("app/adminV2/pos/PosProcessingWorkspace.tsx");
        expect(workspace).toContain("WorkspaceDivider");
        expect(workspace).toContain("WS_QUEUE_RAIL");
        const tokens = read("lib/pos/processingPresentationTokens.ts");
        expect(tokens).toContain("PROCESSING_QUEUE_ROW_TITLE");
    });

    it("WorkspaceModeNav is canonical; OperationalWorkspaceModeNav re-exports", () => {
        const legacy = read("app/adminV2/components/OperationalWorkspaceModeNav.tsx");
        expect(legacy).toContain('from "@/components/workspace/WorkspaceModeNav"');
        const nav = read("components/workspace/WorkspaceModeNav.tsx");
        expect(nav).toContain("WorkspaceModeTabs");
        expect(nav).toContain("WorkspaceSubTabs");
    });
});
