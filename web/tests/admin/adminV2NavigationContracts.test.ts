import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Workspace → dept transition (no root skeleton flash)", () => {
    it("does not use workspace/loading.tsx — cold shell only from workspace page client gate", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("WorkspaceRootColdShell");
        const loadingPath = join(webRoot, "app/adminV2/workspace/loading.tsx");
        expect(() => readFileSync(loadingPath, "utf8")).toThrow();
    });

    it("dept route keeps DepartmentWorkspaceColdShell in dept loading.tsx", () => {
        const deptLoading = read("app/adminV2/workspace/dept/[departmentId]/loading.tsx");
        expect(deptLoading).toContain("DepartmentWorkspaceColdShell");
    });

    it("dept bootstrap requests bundled KPI and right-rail extras", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("right_rail_work_unit_id");
        expect(page).toContain("kpi_placements");
        expect(page).toContain("enrollmentRightRailPrefetchRef");
        expect(page).toContain("synthesizeDeptKpiWorkUnitSummaries");
        expect(page).toContain("mergeDeptWorkUnitSummariesForKpis");
    });

    it("workspace root dept tiles use orchestrated soft nav (router.push, not location.assign)", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).toContain("runAdminV2NavigationTransition");
        expect(grid).toContain("router.push(href)");
        expect(grid).toContain("/dept/");
        expect(grid).toContain('<a');
        expect(grid).not.toContain('from "next/link"');
        expect(grid).not.toContain("adminV2CommitNavigation");
    });
});

describe("AdminV2 shell navigation helpers", () => {
    it("adminV2BeforeRouteNavigation never calls preventDefault", () => {
        const src = read("lib/adminV2/shellNavigation.ts");
        expect(src).toContain("markWorkUnitNavigationStart");
        expect(src).not.toMatch(/\bpreventDefault\s*\(/);
    });

    it("dept queue row uses adminV2CommitNavigation", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("function DeptOperConsoleQueueRow");
        expect(src).toMatch(/DeptOperConsoleQueueRow[\s\S]*?adminV2CommitNavigation\(href/);
    });

    it("sidebar uses AdminV2NavLink without duplicate navigation handlers", () => {
        const src = read("app/adminV2/components/Sidebar.tsx");
        expect(src).toContain("AdminV2NavLink");
        expect(src).not.toContain("onShellNavigate");
        expect(src).not.toMatch(/\brouter\.push\s*\(/);
    });

    it("config assist review CTA uses adminV2CommitNavigation like other shell links", () => {
        const src = read("app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx");
        expect(src).toContain("onReviewConfigProposal");
        expect(src).toMatch(/onReviewConfigProposal[\s\S]*?adminV2CommitNavigation/);
        expect(src).toContain("configProposalReviewHrefForId");
    });
});

describe("AdminDrawerProvider pathname close", () => {
    it("skips close on initial mount and only reacts to pathname changes", () => {
        const src = read("contexts/AdminDrawerContext.tsx");
        expect(src).toContain("drawerCloseMountedRef");
        expect(src).toMatch(/if \(!drawerCloseMountedRef\.current\)[\s\S]*?return;/);
        expect(src).toMatch(/if \(pathnameRef\.current === pathname\) return;/);
    });
});

describe("Work-unit queue tab shallow routing", () => {
    it("queue tabs are local state only (no shallow URL sync on work-unit page)", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).not.toContain("scheduleWorkUnitLaneUrlSync");
        expect(page).not.toMatch(/\buseSearchParams\s*\(/);
        expect(page).toContain("readWorkUnitInitialLocationParams");
    });

    it("bootstrap effect does not depend on Next searchParams identity", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        const bootstrapDeps = src.match(
            /bootstrapWuRef\.current = wu;[\s\S]*?markFirstUsefulPaintOnce,\s*\]\);/
        )?.[0];
        expect(bootstrapDeps).toBeTruthy();
        expect(bootstrapDeps).not.toMatch(/searchParams/);
    });

    it("does not sync selectedQueueKey from URL after mount", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).not.toContain("wuLaneSearchRev");
        expect(src).not.toMatch(/addEventListener\s*\(\s*["']popstate["']/);
        expect(src).toContain("laneUnmappedOnly");
    });

    it("TopNavBar queue tab is a no-op span when already on work-unit route", () => {
        const src = read("app/adminV2/components/TopNavBar.tsx");
        expect(src).toContain("isQueueContext ?");
        expect(src).toContain('aria-current="page"');
    });

    it("AdminV2NavLink commits navigation via location.assign", () => {
        const src = read("app/adminV2/components/navigation/AdminV2NavLink.tsx");
        expect(src).toContain("adminV2CommitNavigation");
        expect(src).not.toMatch(/\brouter\.push\s*\(/);
        expect(src).not.toMatch(/\buseLinkStatus\s*\(/);
        expect(src).not.toMatch(/\bfrom \"next\/link\"/);
    });

    it("shell navigation uses location.assign (no router.push)", () => {
        const src = read("lib/adminV2/shellNavigation.ts");
        expect(src).toContain("window.location.assign");
        expect(src).not.toContain("queueMicrotask");
        expect(src).not.toMatch(/\brouter\.push\s*\(/);
    });
});

describe("AdminV2 click debug utility", () => {
    it("is gated by localStorage alloy_click_debug", () => {
        const src = read("lib/debug/adminV2ClickDebug.ts");
        expect(src).toContain('ADMINV2_CLICK_DEBUG_STORAGE_KEY = "alloy_click_debug"');
        expect(src).toContain("installAdminV2ClickDebug");
        expect(src).toContain('addEventListener("click", handler, true)');
    });

    it("is installed inside AdminDrawerProvider workspace tree", () => {
        const src = read("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");
        expect(src).toContain("AdminV2ClickDebugInstaller");
    });
});

describe("AdminV2 shell chrome above drawer backdrop", () => {
    it("sidebar and top nav use z-100 while drawer backdrop is lower", () => {
        expect(read("app/adminV2/components/Sidebar.tsx")).toContain("z-[100]");
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain("z-[100]");
        expect(read("components/admin/Drawer.tsx")).toContain("ADMINV2_DRAWER_BACKDROP_Z");
        expect(read("components/admin/Drawer.tsx")).toContain("ADMINV2_SHELL_CHROME_Z");
    });
});
