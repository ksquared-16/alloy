import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Workspace V2 layout system", () => {
    it("uses unified command banner surfaces", () => {
        expect(read("components/admin/workspace/layout/WorkUnitCommandSurface.tsx")).toContain(
            'data-ws-command-banner="true"'
        );
        expect(read("components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx")).toContain(
            'data-ws-command-banner="true"'
        );
    });

    it("work unit command surface uses KPI tiles in banner", () => {
        const surface = read("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        expect(surface).toContain("OipPerformanceKpiRow");
        expect(surface).toContain('layout="command"');
        expect(surface).not.toContain("rowStageTitle");
        expect(surface).not.toContain("work-unit-stage-title");
    });

    it("inline header chips use equal-width pill grid", () => {
        const chips = read("app/adminV2/components/workspace/WorkUnitAboveFoldHeaderChips.tsx");
        expect(chips).toContain("computeEqualStagePillGrid");
        expect(chips).toContain("adminv2-ws-queue-pill-scroll--equal-width");
        expect(chips).toContain("gridTemplateColumns");
    });

    it("CSS forces four KPI tiles in one row inside command banner", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain('[data-ws-command-banner="true"]');
        expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    });

    it("process nav tiles target destination sizing", () => {
        expect(read("lib/workspace/workspaceLayoutSystem.ts")).toContain("min-h-[10rem]");
        expect(read("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx")).toContain("max-w-[25rem]");
    });

    it("O.I. overview uses insight summary distinct from workspace banner", () => {
        const overview = read("components/admin/workspace/OipOverviewStructure.tsx");
        expect(overview).toContain("data-oip-overview-command");
        expect(overview).toContain("overviewSummary");
        expect(overview).toContain("Needs Attention Summary");
    });

    it("work unit banner stacks business process title above stage pills", () => {
        const surface = read("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        const layout = read("lib/workspace/workspaceLayoutSystem.ts");
        expect(surface).toContain("rowProcessHeader");
        expect(surface).toContain("commandRowProcessTitle");
        expect(surface).toContain("data-work-unit-process-label");
        expect(surface).not.toContain("work-unit-stage-title");
        expect(surface).not.toContain("stageName");
        expect(layout).toContain("flex-col");
        expect(layout).not.toContain("rowStageTitle");
    });

    it("business process tiles show up to three preview metrics", () => {
        const grid = read("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("selectTilePreviewMetrics");
        expect(grid).toContain("previewShowsAttention");
    });
});
