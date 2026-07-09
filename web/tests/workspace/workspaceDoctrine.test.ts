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

    it("WorkspaceModeNav is canonical; OperationalWorkspaceModeNav re-exports", () => {
        const legacy = read("app/adminV2/components/OperationalWorkspaceModeNav.tsx");
        expect(legacy).toContain('from "@/components/workspace/WorkspaceModeNav"');
        const nav = read("components/workspace/WorkspaceModeNav.tsx");
        expect(nav).toContain("WorkspaceModeTabs");
        expect(nav).toContain("WorkspaceSubTabs");
    });
});
