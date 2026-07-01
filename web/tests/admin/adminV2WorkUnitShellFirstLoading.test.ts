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

    it("page owns the single WorkspaceChrome shell and renders the cold shell inside it (canonical)", () => {
        // Canonical: loading-and-reveal-contract.md §5 — one WorkspaceChrome owner; the cold shell is
        // rendered INSIDE it while content is not ready — never a pre-chrome early return.
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).not.toContain("workUnitPageBlockingLoad");
        expect(page).toContain("buildWorkUnitRouteShellPlaceholder");
        expect(page).toContain("workUnitRouteShellPlaceholder");
        expect(page).toContain("<WorkspaceChrome");
        expect(page).toContain("<WorkUnitWorkspace");
        expect(page).toMatch(/WorkspaceChrome[\s\S]*!workUnitPageContentReady[\s\S]*WorkUnitWorkspaceColdShell/);
        expect(page).not.toMatch(/return \([\s\S]{0,200}WorkUnitWorkspaceColdShell/);
    });

    it("exports WorkUnitOperationalLaneLoader with quiet lane reserve", () => {
        const reserve = read("components/admin/workspace/WorkspaceQuietLoadingReserve.tsx");
        expect(reserve).toContain("WorkUnitOperationalLaneLoader");
        expect(reserve).toContain('data-adminv2-wu-oper-region-loading="true"');
        expect(reserve).toContain("Loading work unit");
    });

    it("dept route uses single WorkspaceChrome with in-region oper loader", () => {
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toContain("DeptOperationalRegionLoader");
        expect(deptPage).toContain("departmentPageBlockingLoad");
        expect(deptPage).not.toMatch(/if \(departmentPageBlockingLoad\)[\s\S]{0,80}DepartmentWorkspaceColdShell/);
        const deptLoading = read("app/adminV2/workspace/dept/[departmentId]/loading.tsx");
        expect(deptLoading).toMatch(/return null/);
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
