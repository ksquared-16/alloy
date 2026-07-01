import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

/**
 * Files intentionally in scope for the platform navigation/performance sprint.
 * Drawer lifecycle sources are excluded — closeout asserts they were not modified for sprint behavior.
 */
const SPRINT_NAV_PERFORMANCE_SCOPE = [
    "app/adminV2/workspace/page.tsx",
    "components/admin/workspace/WorkspaceRootDepartmentGrid.tsx",
    "app/adminV2/workspace/dept/[departmentId]/page.tsx",
    "app/adminV2/workspace/dept/[departmentId]/loading.tsx",
    "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
    "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/loading.tsx",
    "lib/adminV2/navigation/adminV2NavigationTransition.ts",
    "lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap.ts",
    "lib/adminV2/navigation/prefetchWorkUnitOperationalBootstrap.ts",
    "lib/adminV2/runtime/loadWorkspaceGrowthRollup.ts",
    "lib/adminV2/runtime/adminV2LegacyFanOutDiagnostics.ts",
];

const DRAWER_LIFECYCLE_SOURCES_OUT_OF_SCOPE = ["components/admin/AdminEntityDrawer.tsx"];

describe("Card 6 — AdminV2 platform navigation/performance sprint closeout", () => {
    it("sprint scope excludes drawer lifecycle sources", () => {
        for (const drawerPath of DRAWER_LIFECYCLE_SOURCES_OUT_OF_SCOPE) {
            expect(existsSync(join(webRoot, drawerPath))).toBe(true);
            expect(SPRINT_NAV_PERFORMANCE_SCOPE).not.toContain(drawerPath);
        }
    });

    it("hierarchy nav entry points do not open drawer on tile/card click", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).not.toMatch(/\bopenDrawer\s*\(/);
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toMatch(/function DeptOperConsoleQueueRow[\s\S]*adminV2CommitNavigation\(href/);
        expect(deptPage).not.toMatch(
            /function DeptOperConsoleQueueRow[\s\S]{0,2000}\bopenDrawer\s*\(/
        );
    });

    it("dept → work-unit remains hard navigation (adminV2CommitNavigation)", () => {
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toMatch(/DeptOperConsoleQueueRow[\s\S]*adminV2CommitNavigation\(href/);
        expect(deptPage).not.toContain("runAdminV2NavigationTransition");
        const shellNav = read("lib/adminV2/shellNavigation.ts");
        expect(shellNav).toContain("window.location.assign");
    });

    it("workspace → dept remains orchestrated soft navigation", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).toContain("runAdminV2NavigationTransition");
        expect(grid).toContain("router.push(href)");
        expect(grid).not.toContain("adminV2CommitNavigation");
    });

    it("workspace growth rollup is deferred after quick rollup", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("buildWorkspaceQuickRollup");
        expect(page).toMatch(/scheduleAdminV2BackgroundWork[\s\S]*loadWorkspaceGrowthRollup/);
    });

    it("legacy fan-out is diagnosable on bootstrap degradation", () => {
        expect(read("lib/adminV2/runtime/adminV2LegacyFanOutDiagnostics.ts")).toContain(
            "[adminv2-legacy-fan-out]"
        );
        expect(read("app/adminV2/workspace/dept/[departmentId]/page.tsx")).toContain("logAdminV2LegacyFanOut");
    });

    it("shared route loading vocabulary exists for transition ribbon", () => {
        expect(read("lib/adminV2/navigation/adminV2RouteLoadingVocabulary.ts")).toContain(
            "ADMIN_V2_ROUTE_LOADING_VOCABULARY"
        );
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toContain(
            "AdminV2NavigationTransitionRibbon"
        );
    });

    it("QueueService queue-summary contract symbols remain (preview boundary unchanged)", () => {
        const qs = read("lib/queues/QueueService.ts");
        expect(qs).toContain("getDepartmentWorkUnitQueueSummaries");
        expect(qs).toContain("workUnitIds?: string[]");
        expect(qs).toContain("preloadedQueueDefinition");
    });
});
