import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
);
const pageSource = readFileSync(pagePath, "utf8");
// fetchQueueItems orchestration now lives in the canonical useWorkUnitQueueRuntime hook; queue-fetch
// internal assertions read the page + hook together.
const hookPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../lib/adminV2/runtime/queue/useWorkUnitQueueRuntime.ts"
);
const queueRuntimeSource = pageSource + readFileSync(hookPath, "utf8");

describe("work-unit lane local state (no URL churn)", () => {
    it("does not use useSearchParams; lane writes use shallow replaceState only", () => {
        expect(pageSource).not.toMatch(/import[\s\S]*useSearchParams/);
        expect(pageSource).not.toMatch(/\buseSearchParams\s*\(/);
        expect(pageSource).toContain("scheduleWorkUnitLaneUrlSync");
        expect(pageSource).not.toContain("commitWorkUnitLaneQueryUrl");
    });

    it("reads initial queue from frozen location ref only", () => {
        expect(pageSource).toContain("readWorkUnitInitialLocationParams");
        expect(pageSource).toContain("initialLocationRef");
    });

    it("queue tab handler uses shallow URL sync without router navigation", () => {
        const handler = pageSource.match(
            /const handleQueueTabChange = useCallback\([\s\S]*?\[fetchQueueItems, setSelectedQueueKeyTraced, workUnitId\]/
        )?.[0];
        expect(handler).toBeTruthy();
        expect(handler).not.toMatch(/router\.(push|replace|refresh)/);
        expect(handler).toContain("scheduleWorkUnitLaneUrlSync");
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

    it("uses lane preview bundle cache for pill switches (Card 4)", () => {
        expect(pageSource).toContain("warmWorkUnitLanePreviewCache");
        expect(pageSource).toContain("queueRowLogicalCacheKey");
        expect(pageSource).toContain("peekFreshQueueRowCache");
        expect(pageSource).not.toMatch(
            /handleAttentionBucketSelect[\s\S]{0,300}force:\s*true/,
        );
    });

    it("clears wrong-lane queue items when starting a foreground row fetch", () => {
        expect(queueRuntimeSource).toMatch(/pk != null && pk !== apiQueueKey\) return null/);
    });

    it("background-preloads visible queue pills including NA buckets after reveal", () => {
        expect(pageSource).toContain("flattenWorkUnitVisibleQueuePillKeys");
        expect(pageSource).toContain("workUnitQueuePillPrefetchTargets");
        expect(pageSource).toContain("WORK_UNIT_QUEUE_PILL_PREFETCH_CONCURRENCY");
        expect(pageSource).toContain('pill_key: queueKey');
    });

    it("drawer navigator tracks pill selection generation", () => {
        expect(pageSource).toContain("opportunityDrawerNavigatorMatchesWorkUnitSelection");
        expect(pageSource).toContain("queueNavGenerationRef");
    });
});
