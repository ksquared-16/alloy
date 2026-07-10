/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

describe("Alloy Operational Health Doctrine V3", () => {
    it("exports WorkspaceOperationalHealthStrip from doctrine barrel", () => {
        const barrel = read("components/workspace/doctrine.ts");
        expect(barrel).toContain("WorkspaceOperationalHealthStrip");
        expect(barrel).toContain("WorkspaceOperationalHealthItem");
    });

    it("flat strip uses hairline separators — not boxed KPI cards", () => {
        const strip = read("components/workspace/WorkspaceOperationalHealthStrip.tsx");
        expect(strip).toContain("divide-x");
        expect(strip).toContain("WS_OPERATIONAL_HEALTH_STRIP");
        expect(strip).not.toContain("SurfaceHeaderKpiCard");
        expect(strip).not.toContain("WS_KPI_CARD_CHROME");
        expect(strip).not.toContain("shadow");
    });

    it("includes trend placeholders on every signal", () => {
        const strip = read("components/workspace/WorkspaceOperationalHealthStrip.tsx");
        expect(strip).toContain("data-operational-health-trend");
        expect(strip).toContain("data-operational-health-trend-placeholder");
        expect(strip).toContain('trendPlaceholder = "—"');
    });

    it("Processing composes WorkspaceOperationalHealthStrip", () => {
        const adapter = read("app/adminV2/pos/ProcessingKpiStrip.tsx");
        expect(adapter).toContain("WorkspaceOperationalHealthStrip");
        expect(adapter).not.toContain("WorkspaceMetricTiles");
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
});
