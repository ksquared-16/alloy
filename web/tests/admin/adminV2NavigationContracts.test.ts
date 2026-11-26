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
        expect(src).toContain("clearDeptOperNavClickAck");
        expect(src).not.toMatch(/\bpreventDefault\s*\(/);
    });

    it("dept oper queue hrefs use configured queue nav helper", () => {
        const dept = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(dept).toContain("workspaceDeptQueueNavHref");
        expect(dept).not.toMatch(/markDeptOperNavClickAck\(clickedKey\)[\s\S]*?onPointerDown/);
    });

    it("dept queue row uses adminV2CommitNavigation", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("function DeptOperConsoleQueueRow");
        expect(src).toMatch(/DeptOperConsoleQueueRow[\s\S]*?adminV2CommitNavigation\(href/);
    });

    it("sidebar uses AdminV2NavLink without duplicate navigation handlers", () => {
        const src = read("app/adminV2/components/Sidebar.tsx");
        expect(src).toContain("AdminV2NavLink");
        expect(src).toContain("Home");
        expect(src).toContain("Forms");
        expect(src).toContain('FORMS_HREF = "/adminV2/forms"');
        expect(src).toContain("onForms");
        expect(src).toContain("loadWorkspaceNavTree");
        expect(src).toContain("getInitialWorkspaceNavTreeState");
        expect(src).not.toContain("scheduleAdminV2BackgroundWork");
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain("prefetchWorkspaceNavTree");
        expect(src).toContain("readExpandedDeptIds");
        expect(src).toContain("toggleDeptExpanded");
        expect(src).not.toContain("onShellNavigate");
        expect(src).not.toMatch(/\brouter\.push\s*\(/);
    });

    it("sidebar nests work units under expandable department rows", () => {
        const src = read("app/adminV2/components/Sidebar.tsx");
        expect(src).toContain("ChevronRight");
        expect(src).toContain("expandedDeptIds.has");
        expect(src).toMatch(/hasChildren && isExpanded/);
        expect(src).toContain("buildWorkspaceNavDeptChildren");
        expect(src).toContain("workspaceNavChildHref");
    });

    it("tasks modal opens from header without waiting on fetch in TopNavBar", () => {
        const topNav = read("app/adminV2/components/TopNavBar.tsx");
        expect(topNav).toContain("prefetchWorkspaceOperationalTasks");
        expect(topNav).toContain("openTasksModal");
        const panel = read("app/adminV2/components/MyTasksPanel.tsx");
        expect(panel).toContain("getCachedWorkspaceOperationalTasks");
        expect(panel).toMatch(/loading && tasks\.length === 0/);
    });

    it("profile menu is avatar-only in header with dropdown account details", () => {
        const profile = read("app/adminV2/components/AdminV2ProfileMenu.tsx");
        expect(profile).toContain("rounded-full");
        expect(profile).toContain("h-9 w-9");
        const triggerOnly = profile.slice(0, profile.indexOf("{open ?"));
        expect(triggerOnly).not.toContain("text-alloy-midnight/60");
        expect(profile).toContain("Sign out");
        expect(profile).toContain("Organization");
        const topNav = read("app/adminV2/components/TopNavBar.tsx");
        expect(topNav).not.toContain("signOut");
        expect(topNav).toContain("h-[3.75rem]");
        expect(topNav).toContain("text-[15px]");
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
    it("queue tabs sync lane query via shallow replaceState (no useSearchParams subscription)", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("scheduleWorkUnitLaneUrlSync");
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

    it("TopNavBar shell IA: site filter and profile on the right; perspective tabs removed", () => {
        const src = read("app/adminV2/components/TopNavBar.tsx");
        expect(src).toContain("AdminV2ProfileMenu");
        expect(src).toContain("WorkspaceSiteFilterStrip");
        expect(src).not.toContain(">Overview<");
        expect(src).not.toContain(">Queue<");
        expect(src).not.toContain("AI log");
    });

    it("AdminV2NavLink uses hard nav by default and soft nav when flag enabled", () => {
        const src = read("app/adminV2/components/navigation/AdminV2NavLink.tsx");
        expect(src).toContain("commitAdminV2NavLinkNavigation");
        const commit = read("lib/adminV2/navigation/adminV2SoftNavLinkCommit.ts");
        expect(commit).toContain("adminV2SoftSidebarNavEnabled");
        expect(commit).toContain("adminV2CommitNavigation");
        expect(commit).toContain("router.push");
        const shell = read("lib/adminV2/shellNavigation.ts");
        expect(shell).toContain("NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV");
        expect(shell).toContain("isAdminV2SoftNavEligibleHref");
    });

    it("shell navigation uses location.assign as hard-nav fallback", () => {
        const src = read("lib/adminV2/shellNavigation.ts");
        expect(src).toContain("window.location.assign");
        expect(src).not.toContain("queueMicrotask");
    });
});

describe("AdminV2 click debug utility", () => {
    it("is gated by localStorage alloy_click_debug", () => {
        const src = read("lib/debug/adminV2ClickDebug.ts");
        expect(src).toContain('ADMINV2_CLICK_DEBUG_STORAGE_KEY = "alloy_click_debug"');
        expect(src).toContain("installAdminV2ClickDebug");
        expect(src).toContain('addEventListener("click", handler, true)');
    });

    it("drawer scope wraps persistent command rail and route children", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        const scope = read("app/adminV2/components/AdminV2ShellDrawerScope.tsx");
        expect(shell).toContain("AdminV2ShellDrawerScope");
        expect(shell).toContain("AdminV2PersistentCommandRail");
        expect(scope).toContain("AdminDrawerProvider");
        expect(scope).not.toMatch(/import AdminEntityDrawer|<AdminEntityDrawer/);
        expect(read("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx")).toContain("AdminEntityDrawer");
        expect(read("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx")).not.toContain("AdminDrawerProvider");
    });

    it("click debug installer remains in workspace client tree", () => {
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
