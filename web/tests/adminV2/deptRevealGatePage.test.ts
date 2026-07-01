import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("department above-fold reveal gate (page)", () => {
    it("page holds DeptPageLoadingGate until above_fold_ready", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("deptRevealGate");
        expect(page).toContain("deptAboveFoldPageReady");
        expect(page).toContain("DeptPageLoadingGate");
        expect(page).toMatch(/!deptAboveFoldPageReady[\s\S]*DeptPageLoadingGate/);
        expect(page).not.toContain("DeptOperationalRegionLoader");
        expect(page).not.toContain("WorkspaceQuietKpiReserve");
    });

    it("enrollment rail fetch is not gated on oper region reveal", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("enrollmentDeptActionsSettled");
        expect(page).not.toMatch(/if \(!deptOperationalRegionReady\) return;[\s\S]*fetchWorkspaceRightRailResolvedActions/);
    });
});
