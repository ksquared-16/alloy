import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);
const pageSource = readFileSync(pagePath, "utf8");

describe("work-unit lane local state (no URL churn)", () => {
    it("does not use useSearchParams or shallow URL writers", () => {
        expect(pageSource).not.toMatch(/import[\s\S]*useSearchParams/);
        expect(pageSource).not.toMatch(/\buseSearchParams\s*\(/);
        expect(pageSource).not.toContain("scheduleWorkUnitLaneUrlSync");
        expect(pageSource).not.toContain("commitWorkUnitLaneQueryUrl");
        expect(pageSource).not.toContain("history.replaceState");
    });

    it("reads initial queue from frozen location ref only", () => {
        expect(pageSource).toContain("readWorkUnitInitialLocationParams");
        expect(pageSource).toContain("initialLocationRef");
    });

    it("queue tab handler does not call router navigation", () => {
        const handler = pageSource.match(
            /const handleQueueTabChange = useCallback\([\s\S]*?\[setSelectedQueueKeyTraced\]/
        )?.[0];
        expect(handler).toBeTruthy();
        expect(handler).not.toMatch(/router\.(push|replace|refresh)/);
        expect(handler).not.toContain("scheduleWorkUnitLaneUrlSync");
    });
});

describe("work-unit queue stability (PERF-C-01 / C-02)", () => {
    it("clears queue lane state on navigation even when session shell seeds", () => {
        expect(pageSource).toContain("setWuQueueLaneAuthorityReady(false)");
        expect(pageSource).toContain("setQueueSummaries(null)");
        expect(pageSource).toContain("queueRowsBufferWorkUnitIdRef");
        expect(pageSource).toMatch(/seededWorkUnitShellRef\.current = true[\s\S]*?setWorkUnit/);
    });

    it("prefers operational-bootstrap for critical oper data", () => {
        expect(pageSource).toContain("operational-bootstrap");
        expect(pageSource).toContain("work_unit_bootstrap_ready");
        expect(pageSource).toContain("setWuBootstrapAttentionBuckets");
    });

    it("uses single bootstrap primary row fetch authority", () => {
        expect(pageSource).toContain("resolveBootstrapPrimaryQueueKey");
        expect(pageSource).toContain("runBootstrapPrimaryRowFetch");
        expect(pageSource).toContain("suppressQueueFetchEffectOnceRef");
        expect(pageSource).not.toMatch(
            /qFromUrlEffective[\s\S]{0,400}void fetchQueueItems\(workUnitId, qFromUrlEffective/,
        );
        expect(pageSource).not.toMatch(
            /navRowKey[\s\S]{0,200}void fetchQueueItems\(workUnitId, navRowKey/,
        );
    });

    it("does not reveal queue from stale row buffer on another work unit", () => {
        expect(pageSource).toMatch(
            /queueRowsBufferWorkUnitIdRef\.current === workUnitId/,
        );
    });

    it("clears wrong-lane queue items when starting a foreground row fetch", () => {
        expect(pageSource).toMatch(/pk != null && pk !== queueKey\) return null/);
    });
});
