import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Card 3B — department loading alignment + WU prefetch seam", () => {
    it("dept loading.tsx uses DepartmentWorkspaceColdShell only", () => {
        const loading = read("app/adminV2/workspace/dept/[departmentId]/loading.tsx");
        expect(loading).toContain("DepartmentWorkspaceColdShell");
        expect(loading).not.toContain("DeptPairedOperQueuesSkeleton");
        expect(loading).not.toContain("DepartmentRouteSkeletonBody");
    });

    it("dept page uses shell-first blocking gate", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toMatch(/departmentPageBlockingLoad[\s\S]*deptLoading && !dept\?\.id/);
        expect(page).toContain("DeptOperationalRegionLoader");
    });

    it("dept oper cards keep hard nav and add prefetch + click ack seam", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("adminV2CommitNavigation(href");
        expect(page).not.toContain("runAdminV2NavigationTransition");
        expect(page).toContain("prefetchWorkUnitOperationalBootstrap");
        expect(page).toContain("markDeptOperNavClickAck");
        expect(page).toContain("deptOperNavClickAckProps");
        expect(page).toContain("warmWorkUnitBootstrapFromDeptOperHref");
    });

    it("workspace Card 2 and work-unit Card 3A contracts unchanged", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).toContain("runAdminV2NavigationTransition");
        const wuPage = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(wuPage).toContain("WorkUnitWorkspaceColdShell");
        expect(wuPage).toMatch(/workUnitPageBlockingLoad = loading && !workUnitShellReady/);
    });
});
