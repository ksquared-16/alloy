import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("prefetchAdminV2AboveFold", () => {
    it("prefetch module logs via logPrefetchAdminV2", () => {
        const mod = read("lib/adminV2/prefetchAdminV2AboveFold.ts");
        expect(mod).toContain("logPrefetchAdminV2");
        const instr = read("lib/adminV2/adminV2PrefetchInstrumentation.ts");
        expect(instr).toContain("perfPrefetch");
        expect(mod).toContain("prefetchVisibleDepartmentAboveFoldBundles");
        expect(mod).toContain("workspace_visible_dept_prefetch");
    });

    it("workspace grid uses pointer prefetch", () => {
        const grid = read("components/admin/workspace/WorkspaceRootDepartmentGrid.tsx");
        expect(grid).toContain("prefetchDeptAboveFoldOnIntent");
        expect(grid).toContain('reason: "pointer"');
    });

    it("dept oper console preserves work-unit prefetch", () => {
        const wu = read("lib/adminV2/workUnitBootstrapPrefetchFromDept.ts");
        expect(wu).toContain("logPrefetchAdminV2");
        expect(wu).toContain('"work_unit"');
    });

    it("drawer row intent logs drawer_primary prefetch", () => {
        const drawer = read("lib/admin/opportunityDrawerIntentPrefetch.ts");
        expect(drawer).toContain("logPrefetchAdminV2");
        expect(drawer).toContain("drawer_primary");
    });
});
