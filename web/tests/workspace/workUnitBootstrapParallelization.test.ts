import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Card 2 — WU bootstrap parallelization", () => {
    it("loader uses priority summaries then conditional attention before primary rows", () => {
        const src = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(src).toContain('summaryMode: "priority"');
        expect(src).toContain('countAccuracy: "planned"');
        expect(src).toContain("priorityBudget: 6");
        expect(src).toMatch(
            /getWorkUnitQueueSummaries[\s\S]*?attentionNeededForReveal[\s\S]*?loadWorkUnitBootstrapAttention/
        );
        expect(src).toMatch(
            /resolveWorkUnitBootstrapPrimaryQueueKey[\s\S]*?getWorkUnitQueuePreviewRows/
        );
    });

    it("primary lane uses NA preload only when primary is needs_attention", () => {
        const src = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(src).toMatch(
            /primaryIsNeedsAttention[\s\S]*?preloadedAttentionPack: primaryIsNeedsAttention \? preloadedAttention/
        );
    });

    it("bootstrap route blocks only on loader; KPI deferred; right rail cache-only attach", () => {
        const route = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        expect(route).toContain("loadWorkUnitOperationalBootstrapCached");
        expect(route).toContain("kpi_placements_deferred_on_route");
        expect(route).toContain("readRightRailActionsBundleCache");
        expect(route).not.toContain("Promise.all([bootstrapP, kpiP, actionsP])");
        expect(route).toMatch(/const bootstrapResult = await bootstrapP/);
    });

    it("perf types expose parallel timing fields", () => {
        const perf = read("lib/workspace/workUnitOperationalBootstrapPerf.ts");
        expect(perf).toContain("summaries_attention_parallel_ms");
        expect(perf).toContain("summaries_attention_parallel");
        expect(perf).toContain("primary_lane_wait_on");
        expect(perf).toContain("queue_summaries_ms");
        expect(perf).toContain("attention_ms");
        expect(perf).toContain("primary_lane_rows_ms");
        expect(perf).toContain("oip_snapshot_ms");
        expect(perf).toContain("primary_lane_rows_deferred");
        expect(perf).toContain("reveal_blocking_loader_ms");
    });
});
