import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    buildWorkUnitAboveFoldPlaceholder,
    buildWorkUnitRoutePipelineState,
    buildWorkUnitRouteShellPlaceholder,
    workUnitAboveFoldAtomicPaintReady,
    workUnitAboveFoldStructureKeys,
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
        expect(m.kpis).toEqual([]);
        expect(m.aiSummary?.headline).toBe("Enrollment");
    });

    it("work-unit queue lane must not use metric Total row skeleton copy", () => {
        const skel = read("components/admin/workspace/WorkUnitQueueCompactRowSkeleton.tsx");
        const loader = read("components/admin/workspace/WorkspaceQuietLoadingReserve.tsx");
        const queueBlock = read("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        const workspace = read("app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx");
        expect(skel).toContain("WorkUnitQueueLaneRowSkeleton");
        expect(loader).toContain("WorkUnitQueueLaneRowSkeletonList");
        expect(queueBlock).toContain("WorkUnitQueueLaneRowSkeleton");
        expect(workspace).toContain("aboveFold");
        expect(workspace).toContain("WorkUnitAboveFoldActionsRail");
        expect(workspace).not.toContain("WorkUnitOperationalLaneLoader");
        const laneBlock = skel.slice(
            skel.indexOf("export function WorkUnitQueueLaneRowSkeleton"),
            skel.indexOf("function DeptOperBucketRowSkeleton")
        );
        expect(laneBlock).not.toMatch(/>\s*Total\s*</);
    });

    it("above-fold placeholder includes header, actions, and queue slots before data", () => {
        const m = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: true });
        expect(workUnitAboveFoldStructureKeys(m)).toEqual(["header", "actions_rail", "queue_lane"]);
        expect(workUnitAboveFoldAtomicPaintReady(m)).toBe(true);
        expect(m.header.state).toBe("skeleton");
        expect(m.actions_rail.state).toBe("skeleton");
        expect(m.queue_lane.state).toBe("skeleton");
    });

    it("pipeline oper lane loading tracks shell identity only (rows hydrate in-lane)", () => {
        const aboveFold = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: true });
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
            work_unit_above_fold: aboveFold,
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
            work_unit_above_fold: aboveFold,
        });
        expect(pending.above_fold.queue_lane.oper_lane_loading).toBe(true);
        expect(ready.above_fold.queue_lane.oper_lane_loading).toBe(false);
        expect(ready.shell.breadcrumbs.map((b) => b.label)).toEqual(["Workspace", "Dept", "WU"]);
    });

    it("operator slug route hides department breadcrumb", () => {
        const aboveFold = buildWorkUnitAboveFoldPlaceholder({ reserve_actions_rail: true });
        const operator = buildWorkUnitRoutePipelineState({
            department_id: "d1",
            work_unit_id: "wu-1",
            department_title: "Enrollment",
            work_unit_title: "New Leads",
            operator_slug_route: true,
            shell_identity_ready: true,
            oper_lane_loading: false,
            kpi_placeholder: false,
            primary_loaded: true,
            full_complete: true,
            work_unit_above_fold: aboveFold,
        });
        expect(operator.shell.breadcrumbs.map((b) => b.label)).toEqual(["Workspace", "New Leads"]);
        expect(operator.shell.breadcrumbs.some((b) => b.label === "Enrollment")).toBe(false);
    });

    it("slug layout keeps work-unit host mounted across record segment", () => {
        const layout = read("app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx");
        const page = read("app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx");
        const recordPage = read("app/adminV2/workspace/work-unit/[workUnitSlug]/[recordId]/page.tsx");
        expect(layout).toContain("WorkUnitSlugRouteHost");
        expect(page).toMatch(/return null/);
        expect(recordPage).toMatch(/return null/);
    });

    it("page has a single WorkspaceChrome owner; cold shell renders inside it, not as an early return", () => {
        // Canonical: loading-and-reveal-contract.md §5 — the cold shell is page-owned, rendered inside
        // the single WorkspaceChrome owner, gated by content readiness (not a pre-chrome early return).
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).not.toMatch(/if \(workUnitPageBlockingLoad\)[\s\S]{0,120}WorkUnitWorkspaceColdShell/);
        expect(page).toContain("buildWorkUnitRouteShellPlaceholder");
        expect(page).toContain("workUnitRouteShellPlaceholder");
        expect(page).toContain("markRouteShellVisible");
        expect(page).toMatch(/WorkspaceChrome[\s\S]*!workUnitPageContentReady[\s\S]*WorkUnitWorkspaceColdShell/);
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
        expect(page).toContain("lifecycleCardsPending={lifecycleCardsPending}");
    });
});
