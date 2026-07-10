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
    it("exports all certified workspace components from doctrine barrel", () => {
        const index = read("components/workspace/doctrine.ts");
        for (const name of PRIMITIVES) {
            expect(index).toContain(name);
        }
    });
});

describe("Communications doctrine adoption", () => {
    it("CommunicationsWorkspaceShell composes canonical WorkspaceShell", () => {
        const shell = read("app/adminV2/communications/CommunicationsWorkspaceShell.tsx");
        expect(shell).toContain("WorkspaceShell");
        expect(shell).toContain("data-comms-modal-version");
        expect(shell).not.toContain("OperationalModalHeader");
    });

    it("KPI strip uses WorkspaceMetricTiles", () => {
        const kpi = read("app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx");
        expect(kpi).toContain("WorkspaceMetricTiles");
        expect(kpi).toContain('rules: "Rules"');
    });
});
