/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

describe("Alloy Operational Health Doctrine V3 — Work Items", () => {
    it("exports WorkspaceOperationalHealth from doctrine barrel", () => {
        const barrel = read("components/workspace/doctrine.ts");
        expect(barrel).toContain("WorkspaceOperationalHealth");
        expect(barrel).toContain("WorkspaceOperationalHealthItem");
    });

    it("flat health band is not boxed KPI cards", () => {
        const health = read("components/workspace/WorkspaceOperationalHealth.tsx");
        expect(health).toContain("data-workspace-operational-health");
        expect(health).not.toContain("SurfaceHeaderKpiCard");
        expect(health).not.toContain("WS_KPI_CARD_CHROME");
    });

    it("includes trend placeholders on metrics", () => {
        const health = read("components/workspace/WorkspaceOperationalHealth.tsx");
        expect(health).toContain("data-workspace-operational-health-trend");
        expect(health).toContain("item.trend");
    });

    it("Work Items overview has no nav-band or in-content metric tiles", () => {
        const shell = read("app/adminV2/tasks/WorkItemsShell.tsx");
        expect(shell).toContain("hideHeaderMetrics");
        expect(shell).toContain('workView === "overview"');
        expect(shell).toContain("hideHeaderMetrics ? undefined");
        const overview = read("app/adminV2/tasks/WorkItemsOverviewLanding.tsx");
        expect(overview).not.toContain("WorkspaceOperationalHealth");
        expect(overview).not.toContain("WorkspaceMetricTiles");
        expect(overview).not.toContain("SurfaceHeaderKpiCard");
    });

    it("Work Items queue metrics: Tasks assigned, Waiting, Due Soon, Overdue", () => {
        const adapter = read("app/adminV2/tasks/WorkItemsKpiStrip.tsx");
        // R14: `Tasks assigned` names the population — this band counts operational tasks only,
        // while the view rail merges three sources. The metric key stays `assigned`.
        expect(adapter).toContain('label: "Tasks assigned"');
        expect(adapter).toContain('label: "Waiting"');
        expect(adapter).toContain('label: "Due Soon"');
        expect(adapter).toContain('label: "Overdue"');
        expect(adapter).not.toContain("overviewItems");
    });

    it("Work Items composes WorkspaceOperationalHealth on Queue only", () => {
        const adapter = read("app/adminV2/tasks/WorkItemsKpiStrip.tsx");
        expect(adapter).toContain("WorkspaceOperationalHealth");
        expect(adapter).not.toContain("WorkspaceMetricTiles");
    });

    it("Processing hides nav-band metrics on Work → Overview (reference)", () => {
        const shell = read("app/adminV2/pos/DigitalMailroomShell.tsx");
        expect(shell).toContain("hideHeaderMetrics");
        expect(shell).toContain('workView === "overview"');
    });
});

describe("Alloy Operational Health Doctrine V3 — Communications", () => {
    it("Communications Inbox metrics: Needs Reply, Unread, Scheduled, Needs Review", () => {
        const adapter = read("app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx");
        expect(adapter).toContain('label: "Needs Reply"');
        expect(adapter).toContain('label: "Unread"');
        expect(adapter).toContain('label: "Scheduled"');
        expect(adapter).toContain('label: "Needs Review"');
    });

    it("Communications composes WorkspaceOperationalHealth", () => {
        const adapter = read("app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx");
        expect(adapter).toContain("WorkspaceOperationalHealth");
        expect(adapter).not.toContain("WorkspaceMetricTiles");
    });

    it("CommunicationsWorkspaceShell omits nav metrics on Overview", () => {
        const shell = read("app/adminV2/communications/CommunicationsWorkspaceShell.tsx");
        expect(shell).toContain('activeTab !== "overview"');
        expect(shell).toContain("CommunicationsWorkspaceKpiStrip");
    });
});
