import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    buildWorkUnitRoutePipelineState,
    buildWorkUnitRouteShellPlaceholder,
} from "@/lib/adminV2/routeShellPipeline";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("work-unit route shell", () => {
    it("placeholder model reserves queue lane without reshaping", () => {
        const m = buildWorkUnitRouteShellPlaceholder({
            workUnitId: "wu-1",
            workUnitTitle: "Enrollment",
            departmentTitle: "Admissions",
        });
        expect(m.primaryQueue.rowsLoading).toBe(true);
        expect(m.primaryQueue.items).toEqual([]);
        expect(m.aiSummary?.headline).toBe("Enrollment");
    });

    it("pipeline keeps oper lane loading until shell identity ready", () => {
        const pending = buildWorkUnitRoutePipelineState({
            department_id: "d1",
            work_unit_id: "wu-1",
            department_title: "Dept",
            work_unit_title: "WU",
            shell_identity_ready: false,
            oper_lane_loading: true,
            kpi_placeholder: true,
            primary_loaded: false,
            full_complete: false,
        });
        const ready = buildWorkUnitRoutePipelineState({
            department_id: "d1",
            work_unit_id: "wu-1",
            department_title: "Dept",
            work_unit_title: "WU",
            shell_identity_ready: true,
            oper_lane_loading: false,
            kpi_placeholder: false,
            primary_loaded: true,
            full_complete: true,
        });
        expect(pending.above_fold.queue_lane.oper_lane_loading).toBe(true);
        expect(ready.above_fold.queue_lane.oper_lane_loading).toBe(false);
        expect(ready.shell.breadcrumbs.map((b) => b.label)).toEqual(["Workspace", "Dept", "WU"]);
    });

    it("page has single WorkspaceChrome owner (no WorkUnitWorkspaceColdShell early return)", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).not.toMatch(/if \(workUnitPageBlockingLoad\)[\s\S]{0,120}WorkUnitWorkspaceColdShell/);
        expect(page).toContain("buildWorkUnitRouteShellPlaceholder");
        expect(page).toContain("workUnitRouteShellPlaceholder");
        expect(page).toContain("markRouteShellVisible");
        expect(page).not.toContain("WorkUnitWorkspaceColdShell");
    });

    it("segment loading.tsx defers to page shell owner", () => {
        const loading = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/loading.tsx");
        expect(loading).toMatch(/return null/);
    });

    it("dept segment loading.tsx defers to page", () => {
        const loading = read("app/adminV2/workspace/dept/[departmentId]/loading.tsx");
        expect(loading).toMatch(/return null/);
        expect(loading).not.toContain("DepartmentWorkspaceColdShell");
    });

    it("workspace page uses single WorkspaceRootShell (no cold shell swap)", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).not.toContain("WorkspaceRootColdShell");
        expect(page).toContain("departmentsPending={loading && departments.length === 0}");
    });
});
