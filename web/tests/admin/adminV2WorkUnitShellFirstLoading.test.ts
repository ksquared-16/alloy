import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Work-unit shell-first loading (Card 3A)", () => {
    it("route loading.tsx defers to page shell owner (no segment cold shell)", () => {
        const loading = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/loading.tsx");
        expect(loading).not.toContain("WorkUnitWorkspaceColdShell");
        expect(loading).not.toContain("WorkUnitRouteSkeletonBody");
        expect(loading).toMatch(/return null/);
    });

    it("page owns single cold shell early return; oper lane loads in-region", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("WorkUnitWorkspaceColdShell");
        expect(page).not.toContain("WorkUnitRouteSkeletonBody");
        expect(page).toMatch(/if \(workUnitPageBlockingLoad\)[\s\S]{0,120}return \([\s\S]{0,80}WorkUnitWorkspaceColdShell/);
        expect(page).toMatch(/workUnitPageBlockingLoad = loading && !workUnitShellReady/);
        expect(page).not.toMatch(
            /<WorkspaceChrome[\s\S]{0,400}workUnitPageBlockingLoad[\s\S]{0,400}WorkUnitWorkspaceColdShell/
        );
        expect(page).toContain("operLaneLoading={workUnitOperLanePending}");
        expect(page).toContain("workUnitRenderableModel");
    });

    it("exports WorkUnitOperationalLaneLoader with quiet lane reserve", () => {
        const reserve = read("components/admin/workspace/WorkspaceQuietLoadingReserve.tsx");
        expect(reserve).toContain("WorkUnitOperationalLaneLoader");
        expect(reserve).toContain('data-adminv2-wu-oper-region-loading="true"');
        expect(reserve).toContain("Loading work unit");
    });

    it("dept route oper-region pattern is unchanged", () => {
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toContain("DeptOperationalRegionLoader");
        expect(deptPage).toContain("departmentPageBlockingLoad");
    });

    it("workspace → dept transition from Card 2 is unchanged", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).toContain("runAdminV2NavigationTransition");
        expect(grid).toContain("prefetchDepartmentOperationalBootstrap");
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("AdminV2NavigationTransitionRibbon");
    });

    it("dept → work-unit still uses hard adminV2CommitNavigation", () => {
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toMatch(/DeptOperConsoleQueueRow[\s\S]*?adminV2CommitNavigation\(href/);
    });
});
