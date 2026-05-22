import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Card 2 — WU bootstrap parallelization", () => {
    it("loader does not await summaries before launching attention", () => {
        const src = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        const parallelSection = src.match(
            /const tParallel0 = Date\.now\(\);[\s\S]*?phases\.summaries_attention_parallel = true/
        )?.[0];
        expect(parallelSection).toBeTruthy();
        expect(parallelSection).toMatch(/const summariesP = \(async/);
        expect(parallelSection).toMatch(/const attentionP = \(async/);
        expect(parallelSection).toContain("Promise.all([summariesP, attentionP])");
        expect(parallelSection).not.toMatch(
            /await getWorkUnitQueueSummaries[\s\S]*?await loadOpportunityNeedsAttentionRows/
        );
    });

    it("primary lane runs after parallel block and uses NA preload only when needed", () => {
        const src = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(src).toMatch(
            /await Promise\.all\(\[summariesP, attentionP\]\)[\s\S]*?resolveWorkUnitBootstrapPrimaryQueueKey/
        );
        expect(src).toMatch(
            /primaryIsNeedsAttention[\s\S]*?preloadedAttentionPack: primaryIsNeedsAttention \? preloadedAttention/
        );
    });

    it("bootstrap route contract unchanged", () => {
        const route = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        expect(route).toContain("loadWorkUnitOperationalBootstrap");
        expect(route).toContain("kpi_placements");
        expect(route).toContain("right_rail_actions");
        expect(route).toContain("Promise.all([bootstrapP, kpiP, actionsP])");
    });

    it("perf types expose parallel timing fields", () => {
        const perf = read("lib/workspace/workUnitOperationalBootstrapPerf.ts");
        expect(perf).toContain("summaries_attention_parallel_ms");
        expect(perf).toContain("summaries_attention_parallel");
        expect(perf).toContain("primary_lane_wait_on");
        expect(perf).toContain("queue_summaries_ms");
        expect(perf).toContain("attention_ms");
        expect(perf).toContain("primary_lane_rows_ms");
    });
});
