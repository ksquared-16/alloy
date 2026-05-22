import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../..");

describe("work-unit operational bootstrap runtime", () => {
    it("exposes operational-bootstrap admin route", () => {
        const routePath = path.join(
            repoRoot,
            "web/app/api/admin/work-units/[id]/operational-bootstrap/route.ts"
        );
        expect(fs.existsSync(routePath)).toBe(true);
        const src = fs.readFileSync(routePath, "utf8");
        expect(src).toContain("loadAdminRouteGate");
        expect(src).toContain("loadWorkUnitOperationalBootstrap");
        expect(src).toContain("loadWorkUnitKpiPlacementsServer");
        expect(src).toContain("loadRightRailActionsBundleServer");
    });

    it("bootstrap loader uses shared context and single attention pass", () => {
        const loaderPath = path.join(repoRoot, "web/lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        const src = fs.readFileSync(loaderPath, "utf8");
        expect(src).toContain("sharedBootstrap");
        expect(src).toContain("WorkUnitOperBootstrapContext");
        expect(src).toContain("resolveWorkUnitNeedsAttentionExecution");
        expect(src).toContain("workUnitDefinesNeedsAttentionQueue");
        expect(src).toContain("preloadedAttention");
        expect(src).toContain("attention_resolver_passes");
        expect(src).not.toContain("buildOpportunityAttentionQueueItems");
        expect(src).not.toContain("department_attention_preview");
    });

    it("includes attention when NA queue in definition without gating on focus_queue", () => {
        const loaderPath = path.join(repoRoot, "web/lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        const src = fs.readFileSync(loaderPath, "utf8");
        expect(src).toContain('source: "work_unit_needs_attention_lane"');
        expect(src).toContain("attentionEligible");
        expect(src).toContain("workUnitDefinesNeedsAttentionQueue");
        const parallelBlock = src.match(
            /const \[summariesResult, attentionOutcome\][\s\S]*?phases\.summaries_attention_parallel = true/
        )?.[0];
        expect(parallelBlock).toBeTruthy();
        const primaryLaneIdx = src.indexOf("let primary_lane:");
        const parallelAwaitIdx = src.indexOf("await Promise.all([summariesP, attentionP])");
        expect(parallelAwaitIdx).toBeGreaterThan(-1);
        expect(primaryLaneIdx).toBeGreaterThan(parallelAwaitIdx);
    });

    it("runs queue summaries and attention in parallel (Card 2)", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "web/lib/workspace/loadWorkUnitOperationalBootstrap.ts"),
            "utf8"
        );
        expect(src).toMatch(/const summariesP = \(async \(\) =>/);
        expect(src).toMatch(/const attentionP = \(async \(\)/);
        expect(src).toContain("await Promise.all([summariesP, attentionP])");
        expect(src).toContain("summaries_attention_parallel_ms");
        expect(src).toContain("phases.summaries_attention_parallel = true");
        expect(src).toContain("primary_lane_wait_on");
        expect(src).toMatch(/preloadedAttentionPack: primaryIsNeedsAttention \? preloadedAttention/);
    });

    it("bucket builder accepts preloaded attention", () => {
        const bucketPath = path.join(
            repoRoot,
            "web/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets.ts"
        );
        const src = fs.readFileSync(bucketPath, "utf8");
        expect(src).toContain("preloadedAttention");
    });

    it("exposes lane-previews route for post-primary cache warm-up", () => {
        const routePath = path.join(
            repoRoot,
            "web/app/api/admin/work-units/[id]/lane-previews/route.ts"
        );
        expect(fs.existsSync(routePath)).toBe(true);
        const src = fs.readFileSync(routePath, "utf8");
        expect(src).toContain("loadWorkUnitLanePreviewBundle");
    });

    it("work-unit page prefers operational-bootstrap before legacy fan-out", () => {
        const pagePath = path.join(
            repoRoot,
            "web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        const src = fs.readFileSync(pagePath, "utf8");
        expect(src).toContain("operational-bootstrap");
        expect(src.indexOf("operational-bootstrap")).toBeLessThan(src.indexOf("legacy fan-out"));
        expect(src).toContain("scheduleAdminV2BackgroundWork");
        expect(src).toContain("wuBootstrapAttentionBuckets");
        expect(src).not.toContain("deptWuListPromiseRef");
    });
});
