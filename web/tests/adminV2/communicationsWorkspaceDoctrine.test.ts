import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Operational Workspace Doctrine V2 — Communications certification contract. */

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

const PRIMITIVES = [
    "WorkspaceShell",
    "WorkspaceHeader",
    "WorkspaceModeTabs",
    "WorkspaceSubTabs",
    "WorkspaceMetricTiles",
    "WorkspaceSurface",
    "WorkspaceCard",
    "WorkspaceZonePanel",
    "WorkspaceDivider",
];

describe("Operational Workspace Doctrine V2 primitives", () => {
    it("exports all certified workspace components", () => {
        const index = read("components/workspace/operational/index.ts");
        for (const name of PRIMITIVES) {
            expect(index).toContain(name);
        }
    });
});

describe("Communications doctrine adoption", () => {
    it("CommunicationsWorkspaceShell composes doctrine stack", () => {
        const shell = read("app/adminV2/communications/CommunicationsWorkspaceShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).toContain("WorkspaceHeader");
        expect(shell).toContain("WorkspaceSurface");
        expect(shell).toContain('version="doctrine-v2"');
    });

    it("KPI strip uses WorkspaceMetricTiles", () => {
        const kpi = read("app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx");
        expect(kpi).toContain("WorkspaceMetricTiles");
        expect(kpi).not.toContain("CompactKpiStrip");
    });

    it("mode nav composes WorkspaceModeTabs and WorkspaceSubTabs", () => {
        const nav = read("app/adminV2/components/OperationalWorkspaceModeNav.tsx");
        expect(nav).toContain("WorkspaceModeTabs");
        expect(nav).toContain("WorkspaceSubTabs");
        expect(nav).toContain("WorkspaceDivider");
    });
});
