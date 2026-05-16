import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("AdminV2 shell navigation helpers", () => {
    it("adminV2BeforeRouteNavigation never calls preventDefault", () => {
        const src = read("lib/adminV2/shellNavigation.ts");
        expect(src).toContain("markWorkUnitNavigationStart");
        expect(src).not.toMatch(/\bpreventDefault\s*\(/);
    });

    it("dept queue row Link uses adminV2BeforeRouteNavigation without preventDefault", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(src).toContain("function DeptOperConsoleQueueRow");
        expect(src).toMatch(
            /DeptOperConsoleQueueRow[\s\S]*?adminV2BeforeRouteNavigation\(\{ closeDrawer/
        );
        const rowBlock = src.match(/function DeptOperConsoleQueueRow[\s\S]*?^}/m)?.[0] ?? "";
        expect(rowBlock).not.toContain("preventDefault");
    });

    it("sidebar shell links close drawer via adminV2BeforeRouteNavigation", () => {
        const src = read("app/adminV2/components/Sidebar.tsx");
        expect(src).toContain("adminV2BeforeRouteNavigation");
        expect(src).toMatch(/onShellNavigate[\s\S]*?adminV2BeforeRouteNavigation/);
        expect(src).not.toContain("markWorkUnitNavigationStart");
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

    it("AdminV2NavLink always renders Link and suppresses only same-href clicks", () => {
        const src = read("app/adminV2/components/navigation/AdminV2NavLink.tsx");
        expect(src).toContain("isCurrentRoute");
        expect(src).toContain("if (isCurrentRoute)");
        expect(src).not.toContain('return (\n            <span');
        expect(src).not.toMatch(/\buseLinkStatus\s*\(/);
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
    it("sidebar and top nav use z-75 while drawer backdrop is lower", () => {
        expect(read("app/adminV2/components/Sidebar.tsx")).toContain("z-[75]");
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain("z-[75]");
        expect(read("components/admin/Drawer.tsx")).toContain("ADMINV2_DRAWER_BACKDROP_Z");
        expect(read("components/admin/Drawer.tsx")).toContain("ADMINV2_SHELL_CHROME_Z");
    });
});
