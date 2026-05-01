import { describe, expect, it } from "vitest";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";
import { isKnownMetricKey, validateMetricForSurface } from "@/lib/kpi/registry";
import { buildDefaultWorkspaceKpis, buildDefaultDepartmentKpis } from "@/lib/kpi/baseline";
import { resolveKpisForDepartment, resolveKpisForWorkspace } from "@/lib/kpi/resolver";
import type { DepartmentLifecycleKpisPayload } from "@/lib/workspace/viewModels/workspaceRootRollup";

const orgId = "00000000-0000-0000-0000-000000000001";

function placement(partial: Partial<WorkspaceKpiPlacementRow> & Pick<WorkspaceKpiPlacementRow, "metric_key" | "surface">): WorkspaceKpiPlacementRow {
    return {
        id: partial.id ?? "00000000-0000-0000-0000-0000000000aa",
        org_id: partial.org_id ?? orgId,
        surface: partial.surface,
        department_id: partial.department_id ?? null,
        work_unit_id: partial.work_unit_id ?? null,
        metric_key: partial.metric_key,
        display_order: partial.display_order ?? 0,
        is_visible: partial.is_visible ?? true,
        label_override: partial.label_override ?? null,
        format_override: partial.format_override ?? null,
        lane_override: partial.lane_override ?? null,
        metadata: partial.metadata ?? null,
    };
}

describe("kpi registry", () => {
    it("rejects unknown keys", () => {
        expect(isKnownMetricKey("not.a.metric")).toBe(false);
        expect(isKnownMetricKey("org.structure.departments_count")).toBe(true);
    });

    it("validates surface allowlist", () => {
        expect(validateMetricForSurface("org.structure.departments_count", "workspace")).toBe(true);
        expect(validateMetricForSurface("org.structure.departments_count", "department")).toBe(false);
        expect(validateMetricForSurface("dept.wu_queue.total_per_work_unit", "department")).toBe(true);
    });
});

describe("resolveKpisForWorkspace", () => {
    const growthSnapshots: Array<{ departmentKey: string; kpis: DepartmentLifecycleKpisPayload | null }> = [];

    it("falls back to baseline when no placements exist for scope", () => {
        const metrics = { departments: 3, workUnits: 7 };
        const { items, warnings } = resolveKpisForWorkspace({
            placementRows: [],
            scopeHasPlacementRows: false,
            metrics,
            growthSnapshots,
        });
        expect(warnings).toEqual([]);
        expect(items).toEqual(buildDefaultWorkspaceKpis(metrics, growthSnapshots));
    });

    it("returns empty strip when placements exist but all hidden", () => {
        const { items, warnings } = resolveKpisForWorkspace({
            placementRows: [],
            scopeHasPlacementRows: true,
            metrics: { departments: 1, workUnits: 2 },
            growthSnapshots,
        });
        expect(warnings).toEqual([]);
        expect(items).toEqual([]);
    });

    it("orders by display_order and skips unknown keys with warnings", () => {
        const rows: WorkspaceKpiPlacementRow[] = [
            placement({
                surface: "workspace",
                metric_key: "bogus.key",
                display_order: 0,
            }),
            placement({
                surface: "workspace",
                metric_key: "org.structure.work_units_count",
                display_order: 2,
            }),
            placement({
                surface: "workspace",
                metric_key: "org.structure.departments_count",
                display_order: 1,
            }),
        ];
        const { items, warnings } = resolveKpisForWorkspace({
            placementRows: rows,
            scopeHasPlacementRows: true,
            metrics: { departments: 2, workUnits: 4 },
            growthSnapshots,
        });
        expect(warnings.some((w) => w.startsWith("unknown_metric_key:"))).toBe(true);
        expect(items.map((k) => k.id)).toEqual(["org.structure.departments_count", "org.structure.work_units_count"]);
    });

    it("with configured scope, invalid visible rows resolve to empty strip — no baseline", () => {
        const rows: WorkspaceKpiPlacementRow[] = [
            placement({
                surface: "workspace",
                metric_key: "dept.wu_queue.total_per_work_unit",
                display_order: 0,
            }),
        ];
        const metrics = { departments: 1, workUnits: 1 };
        const { items, warnings } = resolveKpisForWorkspace({
            placementRows: rows,
            scopeHasPlacementRows: true,
            metrics,
            growthSnapshots,
        });
        expect(warnings.some((w) => w.startsWith("surface_mismatch:"))).toBe(true);
        expect(items).toEqual([]);
    });
});

describe("resolveKpisForDepartment", () => {
    const wu = (i: number) => ({ id: `wu-${i}`, name: `Unit ${i}`, key: null as string | null });

    it("expands facet up to 12 work units and warns beyond cap", () => {
        const workUnits = Array.from({ length: 14 }, (_, i) => wu(i));
        const summaries: Record<string, { total: number; needs_attention: number | null }> = {};
        for (const u of workUnits) summaries[u.id] = { total: 1, needs_attention: 0 };

        const rows: WorkspaceKpiPlacementRow[] = [
            placement({
                surface: "department",
                metric_key: "dept.wu_queue.total_per_work_unit",
                department_id: "dept-1",
                display_order: 0,
            }),
        ];

        const { items, warnings } = resolveKpisForDepartment({
            placementRows: rows,
            scopeHasPlacementRows: true,
            departmentSurface: "department",
            deptWorkUnits: workUnits,
            deptWorkUnitSummaries: summaries,
            deptQueueSummariesLoading: false,
            deptQueueSummariesError: null,
        });

        expect(warnings).toContain("facet_cap_exceeded");
        expect(items).toHaveLength(12);
        expect(items[0]?.id.startsWith("dept.wu_queue.total_per_work_unit:")).toBe(true);
    });

    it("matches queue loading / error semantics for facet values", () => {
        const rows: WorkspaceKpiPlacementRow[] = [
            placement({
                surface: "department",
                metric_key: "dept.wu_queue.total_per_work_unit",
                department_id: "dept-1",
                display_order: 0,
            }),
        ];
        const workUnits = [wu(0)];
        const { items } = resolveKpisForDepartment({
            placementRows: rows,
            scopeHasPlacementRows: true,
            departmentSurface: "department",
            deptWorkUnits: workUnits,
            deptWorkUnitSummaries: { "wu-0": { total: 5, needs_attention: 1 } },
            deptQueueSummariesLoading: true,
            deptQueueSummariesError: null,
        });
        expect(items[0]?.value).toBe("—");
    });

    it("no visible rows but scope configured → empty, not baseline", () => {
        const workUnits = [wu(0)];
        const { items } = resolveKpisForDepartment({
            placementRows: [],
            scopeHasPlacementRows: true,
            departmentSurface: "department",
            deptWorkUnits: workUnits,
            deptWorkUnitSummaries: { "wu-0": { total: 3, needs_attention: null } },
            deptQueueSummariesLoading: false,
            deptQueueSummariesError: null,
        });
        expect(items).toEqual([]);
    });

    it("no placement config → baseline facet strip", () => {
        const workUnits = [wu(0)];
        const { items } = resolveKpisForDepartment({
            placementRows: [],
            scopeHasPlacementRows: false,
            departmentSurface: "department",
            deptWorkUnits: workUnits,
            deptWorkUnitSummaries: { "wu-0": { total: 3, needs_attention: null } },
            deptQueueSummariesLoading: false,
            deptQueueSummariesError: null,
        });
        expect(items).toEqual(
            buildDefaultDepartmentKpis({
                deptWorkUnits: workUnits,
                deptWorkUnitSummaries: { "wu-0": { total: 3, needs_attention: null } },
                deptQueueSummariesLoading: false,
                deptQueueSummariesError: null,
            })
        );
    });
});
