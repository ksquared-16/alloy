import { describe, expect, it } from "vitest";
import {
    WorkspaceOverviewActionRow,
    WorkspaceOverviewActivityBand,
    WorkspaceOverviewInfoGrid,
    WorkspaceOverviewInfoPrimary,
    WorkspaceOverviewStack,
} from "@/components/workspace/WorkspaceOverviewLayout";
import {
    WS_OVERVIEW_ACTION_GRID,
    WS_OVERVIEW_ACTIVITY_GRID,
    WS_OVERVIEW_CONTENT,
    WS_OVERVIEW_INFO_GRID,
    WS_OVERVIEW_INFO_PRIMARY,
    WS_OVERVIEW_INFO_SPLIT,
    WS_OVERVIEW_LAUNCH_GRID,
} from "@/components/workspace/workspaceTokens";
import * as doctrine from "@/components/workspace/doctrine";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

describe("workspace overview responsive layout primitives", () => {
    it("exports overview layout from doctrine barrel", () => {
        expect(doctrine.WorkspaceOverviewStack).toBe(WorkspaceOverviewStack);
        expect(doctrine.WS_OVERVIEW_CONTENT).toBe(WS_OVERVIEW_CONTENT);
        expect(doctrine.WS_OVERVIEW_INFO_SPLIT).toBe(WS_OVERVIEW_INFO_SPLIT);
        expect(doctrine.WS_OVERVIEW_LAUNCH_GRID).toBe(WS_OVERVIEW_LAUNCH_GRID);
    });

    it("overview tokens expand at xl/2xl and keep action/activity/info grids", () => {
        expect(WS_OVERVIEW_CONTENT).toContain("max-w-6xl");
        expect(WS_OVERVIEW_CONTENT).toContain("xl:max-w-[80rem]");
        expect(WS_OVERVIEW_CONTENT).toContain("2xl:max-w-[90rem]");
        expect(WS_OVERVIEW_ACTION_GRID).toContain("md:grid-cols-3");
        expect(WS_OVERVIEW_ACTIVITY_GRID).toContain("lg:grid-cols-4");
        expect(WS_OVERVIEW_INFO_GRID).toContain("xl:grid-cols-[minmax(0,1.75fr)");
        expect(WS_OVERVIEW_INFO_PRIMARY).toContain("lg:col-span-2");
    });

    it("Processing, Communications, Scheduling, and Work Items compose shared overview primitives", () => {
        const processing = readSrc("app/adminV2/pos/ProcessingOverviewLanding.tsx");
        const comms = readSrc("app/adminV2/communications/CommunicationsOverviewLanding.tsx");
        const scheduling = readSrc("components/adminV2/scheduling/screens/SchedulingOverview.tsx");
        const workItems = readSrc("app/adminV2/tasks/WorkItemsOverviewLanding.tsx");
        const oi = readSrc("components/adminV2/intelligence/OperationalIntelligencePanel.tsx");

        for (const src of [processing, comms, workItems]) {
            expect(src).toContain("WorkspaceOverviewStack");
            expect(src).toContain("WorkspaceOverviewActionRow");
            expect(src).toContain("WorkspaceOverviewInfoGrid");
            expect(src).toContain("WorkspaceOverviewInfoPrimary");
            expect(src).not.toContain("max-w-6xl space-y-5");
            expect(src).not.toContain("max-w-6xl space-y-7");
        }

        expect(scheduling).toContain("WorkspaceOverviewStack");
        expect(scheduling).toContain("WS_OVERVIEW_INFO_SPLIT");
        expect(scheduling).toContain("WS_OVERVIEW_LAUNCH_GRID");
        expect(scheduling).not.toContain("max-w-[1180px]");

        expect(oi).toContain("WS_OVERVIEW_CONTENT");
        expect(oi).toContain("data-workspace-overview-width");
    });

    it("layout components expose stable data markers", () => {
        expect(WorkspaceOverviewStack).toBeTypeOf("function");
        expect(WorkspaceOverviewActionRow).toBeTypeOf("function");
        expect(WorkspaceOverviewActivityBand).toBeTypeOf("function");
        expect(WorkspaceOverviewInfoGrid).toBeTypeOf("function");
        expect(WorkspaceOverviewInfoPrimary).toBeTypeOf("function");
    });
});
