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

/**
 * The record-overlay router this sprint deliberately did not touch — and which a LATER sprint
 * deleted outright. The scope assertion below is now stronger than it was: the source is not merely
 * out of this sprint's scope, it does not exist.
 */
const DRAWER_LIFECYCLE_SOURCES_OUT_OF_SCOPE = ["components/admin/AdminEntityDrawer.tsx"];

describe("Card 6 — AdminV2 platform navigation/performance sprint closeout", () => {
    it("sprint scope excludes drawer lifecycle sources", () => {
        for (const drawerPath of DRAWER_LIFECYCLE_SOURCES_OUT_OF_SCOPE) {
            expect(existsSync(join(webRoot, drawerPath))).toBe(false);
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

});
