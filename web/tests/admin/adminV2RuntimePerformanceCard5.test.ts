import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Card 5 — AdminV2 runtime performance pass", () => {
    it("defers workspace growth rollup after quick rollup via idle scheduler", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("scheduleAdminV2BackgroundWork");
        expect(page).toContain("loadWorkspaceGrowthRollup");
        expect(page).not.toContain("async function loadWorkspaceRollup");
        expect(page).toMatch(/scheduleAdminV2BackgroundWork[\s\S]*loadWorkspaceGrowthRollup/);
        expect(page).toContain("buildWorkspaceQuickRollup");
    });

    it("extracts growth rollup fan-out into dedicated helper", () => {
        const helper = read("lib/adminV2/runtime/loadWorkspaceGrowthRollup.ts");
        expect(helper).toContain("opportunity-lifecycle-kpis");
        expect(helper).toContain("pipeline-exact-count");
        expect(helper).toContain("mapWithConcurrency");
        expect(helper).toContain("dedupeAdminFetch");
    });

    it("department bootstrap success returns before legacy fan-out", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        const bootstrapIdx = page.indexOf("operational-bootstrap");
        const legacyIdx = page.indexOf("legacy fan-out");
        const returnAfterBootstrap = page.indexOf('phase: "bootstrap_ready"');
        expect(bootstrapIdx).toBeGreaterThan(-1);
        expect(legacyIdx).toBeGreaterThan(bootstrapIdx);
        expect(returnAfterBootstrap).toBeGreaterThan(bootstrapIdx);
        expect(returnAfterBootstrap).toBeLessThan(legacyIdx);
        expect(page).toContain("logAdminV2LegacyFanOut");
        expect(page).not.toMatch(
            /legacy fan-out[\s\S]{0,400}void fetchDeptAttentionPreview\(cacheNaWuId\)/
        );
    });

    it("work-unit bootstrap success returns before legacy fan-out", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        const bootstrapIdx = page.indexOf("operational-bootstrap");
        const legacyIdx = page.indexOf("legacy fan-out");
        const bootstrapReturn = page.indexOf("requestWorkUnitDeferredSupplement");
        expect(bootstrapIdx).toBeLessThan(legacyIdx);
        expect(page.indexOf("return;", bootstrapReturn)).toBeGreaterThan(bootstrapIdx);
        expect(page.indexOf("return;", bootstrapReturn)).toBeLessThan(legacyIdx);
        expect(page).toContain("logAdminV2LegacyFanOut");
    });

    it("preserves Card 2 workspace transition and Card 3 hard dept→WU nav", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).toContain("runAdminV2NavigationTransition");
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toContain("adminV2CommitNavigation(href");
        expect(deptPage).not.toContain("runAdminV2NavigationTransition");
    });

    it("preserves Card 3A work-unit shell-first gate", () => {
        const wuPage = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(wuPage).toMatch(/workUnitPageBlockingLoad = loading && !workUnitShellReady/);
        expect(wuPage).toContain("WorkUnitWorkspaceColdShell");
    });

    it("preserves Card 3B department shell-first gate", () => {
        const deptPage = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(deptPage).toMatch(/departmentPageBlockingLoad[\s\S]*deptLoading && !dept\?\.id/);
    });
});
