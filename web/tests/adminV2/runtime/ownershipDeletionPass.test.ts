import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());
function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Ownership deletion — Focus Panel subject identity (WU-07)", () => {
    it("model swap applies drawer id + seed synchronously before async preload (sole identity owner)", () => {
        const ctx = readSrc("contexts/AdminDrawerContext.tsx");
        const swapStart = ctx.slice(ctx.indexOf("const openDrawerModelSwap"), ctx.indexOf("const openDrawer ="));
        expect(swapStart).toContain("applyDrawerTargetNavigation(swapParams, { skipStackPush: true })");
        expect(swapStart.indexOf("applyDrawerTargetNavigation(swapParams")).toBeLessThan(
            swapStart.indexOf("prepareDrawerViewModelForOpen"),
        );
    });

});

describe("Ownership deletion — KPI single renderer path", () => {

    it("MetricPlacementRenderer never replaces populated value-bearing cache with value-less fresh items", () => {
        const src = readSrc("components/admin/metrics/MetricPlacementRenderer.tsx");
        expect(src).toContain("if (freshHasValues || !currentHasValues)");
        expect(src).toContain("metricRenderItemsHaveValues");
    });
});

describe("Runtime flag retirement — production source", () => {
    const sourceFiles = [
        "lib/adminV2/runtime/alloyOsRuntimeFlag.ts",
        "lib/adminV2/runtime/useAlloyOsRuntimeSplitActive.ts",
        "lib/adminV2/runtime/configurationRuntimeConvergenceFlag.ts",
        "lib/adminV2/runtime/operationalSubject/OperationalModeEntryContext.tsx",
        "lib/adminV2/runtime/perspective/useWorkUnitRuntimePerspective.ts",
        "lib/adminV2/runtime/preload/drawerVmPrewarmScheduler.ts",
        "lib/admin/opportunityDrawerOpenCoordinator.ts",
        "app/adminV2/components/AlloyOsRuntimeSplitController.tsx",
        "app/adminV2/components/AlloyOsLayoutSurfaceDiagnostics.tsx",
        "components/admin/workspace/layout/WorkspaceOperationalPulseStrip.tsx",
        "app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx",
        "components/admin/workspace/layout/WorkUnitCommandSurface.tsx",
        "app/adminV2/components/workspace/blocks/QueueBlock.tsx",
        "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
    ];
    it.each(sourceFiles)("%s has no ALLOY_OS_RUNTIME_ENABLED references", (file) => {
        expect(readSrc(file)).not.toContain("ALLOY_OS_RUNTIME_ENABLED");
    });
});
