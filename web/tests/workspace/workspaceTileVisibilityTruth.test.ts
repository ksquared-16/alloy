import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    departmentIdInRenderedWorkspaceTiles,
    traceWorkspaceRootDepartmentTiles,
    transformWorkspaceApiDepartmentsToTiles,
    workspaceRenderedTileFailureReason,
} from "@/lib/workspace/workspaceRootTilePipeline";
import type { WorkspaceRootDepartmentRow } from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const rows: WorkspaceRootDepartmentRow[] = [
    { id: "dept-a", key: "enrollment", name: "Enrollment", is_active: true },
    { id: "dept-b", key: "admissions", name: "Admissions", is_active: true },
    { id: "dept-off", key: "off", name: "Off", is_active: false },
];

describe("workspaceRootTilePipeline", () => {
    it("includes activation-owned department when API returns it (active)", () => {
        const trace = traceWorkspaceRootDepartmentTiles(rows);
        expect(departmentIdInRenderedWorkspaceTiles(trace, "dept-b")).toBe(true);
        expect(trace.renderedTileIds).toContain("dept-b");
    });

    it("does not filter out zero-work-unit lifecycle departments", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).not.toMatch(/workUnitCount\s*===\s*0/);
        expect(grid).not.toMatch(/workUnitCount\s*>\s*0/);
        const tiles = transformWorkspaceApiDepartmentsToTiles([
            { id: "lifecycle-dept", key: "sales", name: "Sales", is_active: true },
        ]);
        expect(tiles).toHaveLength(1);
    });

    it("excludes inactive departments from rendered tiles", () => {
        const trace = traceWorkspaceRootDepartmentTiles(rows);
        expect(departmentIdInRenderedWorkspaceTiles(trace, "dept-off")).toBe(false);
        expect(workspaceRenderedTileFailureReason(trace, "dept-off")).toMatch(/active filter/i);
    });

    it("fails rendered check when API has department but active filter removes it", () => {
        const trace = traceWorkspaceRootDepartmentTiles([
            { id: "x", key: "x", name: "X", is_active: false },
        ]);
        expect(trace.apiDepartmentIds).toContain("x");
        expect(trace.renderedTileIds).not.toContain("x");
    });
});

describe("workspace tile visibility integration", () => {
    it("validation includes rendered workspace tile list check", () => {
        const validate = read("lib/lifecycle/validateLifecycleActivationRuntime.ts");
        expect(validate).toContain("workspace_rendered_tiles");
        expect(validate).toContain("traceWorkspaceRootDepartmentTiles");
    });

    it("workspace page uses shared tile pipeline and busts cache on departments-changed", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("transformWorkspaceApiDepartmentsToTiles");
        expect(page).toContain("alloy:workspace-departments-changed");
        expect(page).toContain("bustWorkspaceDepartmentsFetchDedupe");
        expect(page).toContain('cache: "no-store"');
    });

    it("notify busts session cache and fetch dedupe", () => {
        const notify = read("lib/workspace/notifyWorkspaceDepartmentsChanged.ts");
        expect(notify).toContain("invalidateAdminV2WorkspaceSessionCache");
        expect(notify).toContain("bustWorkspaceDepartmentsFetchDedupe");
    });

    it("lifecycle validation compares browser cache vs network", () => {
        expect(read("lib/workspace/workspaceBrowserTileTruth.ts")).toContain("evaluateWorkspaceBrowserTileTruth");
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx")).toContain(
            "evaluateWorkspaceBrowserTileTruth"
        );
    });

    it("dev debug panel is development-only", () => {
        expect(read("components/admin/workspace/WorkspaceTileDebugPanel.tsx")).toContain(
            "isLifecycleDebugUiEnabled"
        );
    });
});
