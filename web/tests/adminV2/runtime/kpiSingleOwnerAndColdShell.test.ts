import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());
function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("KPI single-owner wiring", () => {
    it("MetricPlacementRenderer shows loadingReserve only while loading, emptyFallback only when resolved-empty", () => {
        const src = readSrc("components/admin/metrics/MetricPlacementRenderer.tsx");
        expect(src).toContain("loadingReserve");
        // Distinct loading vs resolved-empty branches (reserve never persists on a resolved-empty slot).
        expect(src).toContain(
            "if (!items.length) return loading ? (loadingReserve ?? emptyFallback ?? null) : (emptyFallback ?? null);",
        );
        // No-blank revalidate guard.
        expect(src).toContain("metricRenderItemsHaveValues");
        expect(src).toContain("if (freshHasValues || !currentHasValues)");
    });

    it("WU-02 KPI strip: platform placement is sole owner — no OIP emptyFallback, no dead flag branch", () => {
        const src = readSrc("components/admin/workspace/layout/WorkUnitCommandSurface.tsx");
        // Dead-branch guard and legacy fallback must be absent (runtime unconditionally on)
        expect(src).not.toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(src).not.toContain("v1Fallback");
        expect(src).not.toContain("AlloyOsInlineKpiStrip");
        // The MetricPlacementRenderer for WU-02 uses loadingReserve, never emptyFallback
        const block = src.slice(src.indexOf('surface="work_unit_header"'));
        expect(block).toContain("loadingReserve={<WorkspaceQuietKpiReserve");
        expect(block).not.toContain("emptyFallback");
    });

    it("WS-04 primary_metrics and secondary_metrics both use stable reserve — no legacy OIP fallback", () => {
        const src = readSrc("components/admin/workspace/layout/WorkspaceOperationalPulseStrip.tsx");
        expect(src).not.toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(src).not.toContain("legacyOipFallback");
        expect(src).toContain("function PulseSlotReserve()");
        const primary = src.slice(src.indexOf('placementZone="primary_metrics"'), src.indexOf('placementZone="secondary_metrics"'));
        expect(primary).toContain("loadingReserve={<PulseSlotReserve />}");
        expect(primary).not.toContain("emptyFallback");
        const secondary = src.slice(src.indexOf('placementZone="secondary_metrics"'));
        expect(secondary).toContain("loadingReserve={<PulseSlotReserve />}");
    });
});

describe("Work-unit cold-shell gate", () => {
    const src = readSrc("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");

    it("cold shell renders only on true cold entry (no warm seed, no prior committed surface)", () => {
        expect(src).toContain("const [workUnitSurfaceEverCommitted, setWorkUnitSurfaceEverCommitted] = useState(false)");
        expect(src).toContain("setWorkUnitSurfaceEverCommitted(true)");
        expect(src).toContain(
            "const showWorkUnitColdShell =\n        !workUnitSurfaceReady && !workUnitPageSeededFromCache && !workUnitSurfaceEverCommitted;",
        );
    });

    it("JSX gates WorkUnitWorkspaceColdShell on showWorkUnitColdShell, not raw !workUnitSurfaceReady", () => {
        expect(src).toContain(") : showWorkUnitColdShell ? (");
        const coldShellRegion = src.slice(src.indexOf("showWorkUnitColdShell ? ("), src.indexOf("showWorkUnitColdShell ? (") + 200);
        expect(coldShellRegion).toContain("WorkUnitWorkspaceColdShell");
    });
});
