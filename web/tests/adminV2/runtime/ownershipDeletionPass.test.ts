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

    it("runtime Focus Panel cannot fall back to legacy drawerTitle — title is null while subject selected", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("const drawerTitleNode = focusPanelActive && drawer.id ? null : drawerTitle;");
    });

    it("seed header is sole identity owner until focusPanelSubjectResolved (not gated on opening/pending flags)", () => {
        const runtime = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const pendingHeader = runtime.slice(
            runtime.indexOf("const focusPanelPendingHeader"),
            runtime.indexOf("const composedProofHeader"),
        );
        expect(pendingHeader).toContain("focusPanelSubjectResolved");
        expect(pendingHeader).not.toContain("focusPanelPayloadPending");
        const proofHeader = runtime.slice(
            runtime.indexOf("const composedProofHeader"),
            runtime.indexOf("const drawerTitleNode"),
        );
        expect(proofHeader).toContain("if (!focusPanelSubjectResolved) return focusPanelPendingHeader");
    });
});

describe("Ownership deletion — queue presentation (WU-05)", () => {
    it("full-width queue row renderer is unreachable when ALLOY_OS_RUNTIME_ENABLED", () => {
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).toContain(
            "const compressedRowPresentation =\n    ALLOY_OS_RUNTIME_ENABLED || splitRenderActive || runtimeQueuePresentationLocked;",
        );
    });
});

describe("Ownership deletion — work-unit cold shell", () => {
    it("cold shell is unreachable after first committed surface or warm cache seed", () => {
        const page = readSrc("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("showWorkUnitColdShell");
        expect(page).toContain("!workUnitPageSeededFromCache");
        expect(page).toContain("!workUnitSurfaceEverCommitted");
        expect(page).toContain(") : showWorkUnitColdShell ? (");
    });
});

describe("Ownership deletion — KPI single renderer path", () => {
    it("WU-02 runtime branch: platform placement only — no OIP emptyFallback owner, dead flag branches gone", () => {
        const src = readSrc("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        // Both the runtime guard and the legacy v1Fallback must be absent
        expect(src).not.toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(src).not.toContain("v1Fallback");
        expect(src).not.toContain("AlloyOsInlineKpiStrip");
        // MetricPlacementRenderer for work_unit_header uses loadingReserve, never emptyFallback
        const block = src.slice(src.indexOf('surface="work_unit_header"'));
        expect(block).toContain("loadingReserve={<WorkspaceQuietKpiReserve");
        expect(block).not.toContain("emptyFallback");
    });

    it("WS-04 OIP pulse fallback retired — PulseSlotReserve is the only loading path", () => {
        const src = readSrc("components/admin/workspace/layout/WorkspaceOperationalPulseStrip.tsx");
        expect(src).not.toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(src).not.toContain("legacyOipFallback");
        const secondary = src.slice(src.indexOf('placementZone="secondary_metrics"'));
        expect(secondary).toContain("loadingReserve={<PulseSlotReserve />}");
    });

    it("MetricPlacementRenderer never replaces populated value-bearing cache with value-less fresh items", () => {
        const src = readSrc("components/admin/metrics/MetricPlacementRenderer.tsx");
        expect(src).toContain("if (freshHasValues || !currentHasValues)");
        expect(src).toContain("metricRenderItemsHaveValues");
    });
});
