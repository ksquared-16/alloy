import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    ADMINV2_DEPT_KPI_QUIET_RESERVE_MIN_H,
    ADMINV2_DEPT_PAIRED_OPER_PANEL_MIN_H,
    ADMINV2_DEPT_ATTENTION_LOADING_ROW_COUNT,
    ADMINV2_DRAWER_OPPORTUNITY_BOOTSTRAP_BODY_MIN_H,
    ADMINV2_KPI_STRIP_CELL_COUNT,
    ADMINV2_QUIET_RESERVE_PANEL_CLASS,
    ADMINV2_WORK_UNIT_QUEUE_LANE_MIN_H,
    ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT,
    adminV2DeptKpiQuietReserveStyle,
    adminV2DeptPairedOperPanelReserveStyle,
    adminV2WorkUnitQueueLaneReserveStyle,
} from "@/lib/ui-v2/adminV2LoadingGeometry";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("adminV2LoadingGeometry", () => {
    it("exports stable queue and KPI placeholder counts", () => {
        expect(ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT).toBe(6);
        expect(ADMINV2_KPI_STRIP_CELL_COUNT).toBe(5);
        expect(ADMINV2_DEPT_ATTENTION_LOADING_ROW_COUNT).toBe(3);
    });

    it("exports dept quiet reserve geometry shared by cold shell and client revisit", () => {
        expect(ADMINV2_DEPT_PAIRED_OPER_PANEL_MIN_H).toBe("11.5rem");
        expect(ADMINV2_DEPT_KPI_QUIET_RESERVE_MIN_H).toBe("4.25rem");
        expect(adminV2DeptPairedOperPanelReserveStyle()).toEqual({ minHeight: "11.5rem" });
        expect(adminV2DeptKpiQuietReserveStyle()).toEqual({ minHeight: "4.25rem" });
        expect(ADMINV2_QUIET_RESERVE_PANEL_CLASS).toContain("border-alloy-stone/12");
    });

    it("uses drawer bootstrap body reserve shorter than legacy workflow block", () => {
        expect(ADMINV2_DRAWER_OPPORTUNITY_BOOTSTRAP_BODY_MIN_H).toBe("10.5rem");
    });

    it("exports work-unit queue lane quiet reserve geometry (PERF-A-03)", () => {
        expect(ADMINV2_WORK_UNIT_QUEUE_LANE_MIN_H).toBe("14rem");
        expect(adminV2WorkUnitQueueLaneReserveStyle()).toEqual({ minHeight: "14rem" });
    });
});

describe("Work-unit loader alignment (PERF-A-03 / Card 3A shell-first)", () => {
    it("route loading.tsx uses WorkUnitWorkspaceColdShell", () => {
        const loading = read(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/loading.tsx"
        );
        expect(loading).toContain("WorkUnitWorkspaceColdShell");
        expect(loading).not.toContain("WorkUnitRouteSkeletonBody");
        expect(loading).not.toContain("AdminV2RouteLoadingState");
    });

    it("in-page blocking uses cold shell; oper lane uses WorkUnitOperationalLaneLoader", () => {
        const reserve = read("components/admin/workspace/WorkspaceQuietLoadingReserve.tsx");
        expect(reserve).toContain("adminV2WorkUnitQueueLaneReserveStyle");
        expect(reserve).toContain("WorkUnitOperationalLaneLoader");
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("WorkUnitWorkspaceColdShell");
        expect(page).toContain("operLaneLoading={workUnitOperLanePending}");
    });
});

describe("Dept loader alignment (PERF-A-02 / PR-4.6)", () => {
    it("cold shell uses bridge + oper-region loader + KPI quiet reserve", () => {
        const cold = read("components/admin/workspace/DepartmentWorkspaceColdShell.tsx");
        expect(cold).toContain("DepartmentWorkspaceBridgeShell");
        expect(cold).toContain("DeptOperationalRegionLoader");
        expect(cold).toContain("WorkspaceQuietKpiReserve");
        expect(cold).not.toContain("AdminV2RouteLoadingState");
        expect(cold).not.toContain("DeptPairedOperQueuesSkeleton");
        expect(cold).not.toContain("KpiStripSkeleton");
    });

    it("exports DeptOperationalRegionLoader with paired panel geometry", () => {
        const reserve = read("components/admin/workspace/WorkspaceQuietLoadingReserve.tsx");
        expect(reserve).toContain("DeptOperationalRegionLoader");
        expect(reserve).toContain('data-adminv2-dept-oper-region-loading="true"');
        expect(reserve).toContain("adminV2DeptPairedOperPanelReserveStyle");
    });

    it("quiet reserve uses shared geometry constants", () => {
        const reserve = read("components/admin/workspace/WorkspaceQuietLoadingReserve.tsx");
        expect(reserve).toContain("adminV2DeptPairedOperPanelReserveStyle");
        expect(reserve).toContain("adminV2DeptKpiQuietReserveStyle");
        expect(reserve).toContain("ADMINV2_QUIET_RESERVE_PANEL_CLASS");
        expect(reserve).toContain('data-adminv2-dept-oper-reserve="true"');
    });

    it("dept page locks throughput shape before oper reveal (PERF-B-01 / PR-4.5)", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain('setDeptThroughputPresentation("pipeline_lanes")');
        expect(page).toContain("deptOperationalSurfaceReady");
        expect(page).toContain("deptThroughputBodyReady");
        expect(page).not.toContain("deptThroughputRevealReady");
    });

    it("dept page uses oper-region loader under split readiness gates (PR-4.6+)", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("deptOperationalRegionReady");
        expect(page).toContain("DeptOperationalRegionLoader");
        expect(page).not.toContain("deptPageOperationalReady");
        expect(page).not.toContain("AdminV2RouteLoadingState");
        expect(page).toContain("data-adminv2-dept-oper-revealed");
        const operBlock = page.match(/const throughputPairedPanels = [\s\S]*?;\n\n    if \(departmentPageBlockingLoad\)/)?.[0] ?? "";
        expect(operBlock).not.toContain("adminv2-ws-soft-content-reveal");
    });
});
