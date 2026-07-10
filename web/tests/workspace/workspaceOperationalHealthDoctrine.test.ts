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

    it("Work Items overview metrics: Open, Due Today, Overdue, Completed Today", () => {
        const adapter = read("app/adminV2/tasks/WorkItemsKpiStrip.tsx");
        expect(adapter).toContain('label: "Open"');
        expect(adapter).toContain('label: "Due Today"');
        expect(adapter).toContain('label: "Overdue"');
        expect(adapter).toContain('label: "Completed Today"');
        expect(adapter).toContain("overviewItems");
    });

    it("Work Items queue metrics: Assigned, Waiting, Due Soon, Overdue", () => {
        const adapter = read("app/adminV2/tasks/WorkItemsKpiStrip.tsx");
        expect(adapter).toContain('label: "Assigned"');
        expect(adapter).toContain('label: "Waiting"');
        expect(adapter).toContain('label: "Due Soon"');
        expect(adapter).toContain("queueItems");
        expect(adapter).toContain("workView");
    });

    it("WorkItemsShell passes workView into the health strip", () => {
        const shell = read("app/adminV2/tasks/WorkItemsShell.tsx");
        expect(shell).toContain("<WorkItemsKpiStrip workView={workView} />");
    });

    it("Work Items composes WorkspaceOperationalHealth", () => {
        const adapter = read("app/adminV2/tasks/WorkItemsKpiStrip.tsx");
        expect(adapter).toContain("WorkspaceOperationalHealth");
        expect(adapter).not.toContain("WorkspaceMetricTiles");
    });
});
