import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../..");

describe("dept operational bootstrap runtime hardening", () => {
    it("exposes operational-bootstrap admin route", () => {
        const routePath = path.join(
            repoRoot,
            "web/app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts"
        );
        expect(fs.existsSync(routePath)).toBe(true);
        const src = fs.readFileSync(routePath, "utf8");
        expect(src).toContain("loadAdminRouteGate");
        expect(src).toContain("loadDeptOperationalBootstrap");
    });

    it("bootstrap loader shares work unit ids with queue summaries", () => {
        const loaderPath = path.join(repoRoot, "web/lib/workspace/loadDeptOperationalBootstrap.ts");
        const src = fs.readFileSync(loaderPath, "utf8");
        expect(src).toContain("workUnitIds");
        expect(src).toContain("resolveDeptPipelineExecSurfaceServer");
        expect(src).toContain("loadDeptAttentionPreviewServer");
        expect(src).toContain("pickDeptPipelineWorkUnit");
        expect(src).toContain("logDeptOperationalBootstrapPerf");
        expect(src).toContain("summaryWorkUnitIds");
        expect(src).toContain("queue_definition");
        expect(src).toContain("attention_query_ms");
        expect(src).toContain("attention_candidate_count");
        expect(src).toContain("attention_rules_ms");
        expect(src).toContain("attention_membership_filter_ms");
        expect(src).toContain("inspectBuilderOwnedLifecycleWorkUnitsForDept");
        expect(src).not.toContain("autoRepairBuilderOwnedLifecycleWorkUnitsForDept");
        expect(src).toContain("departmentWorkUnitIdsForLifecycleScope");
        expect(src).toContain("lifecycle_work_unit_runtime");
    });

    it("resolves needs_attention execution work unit for enrollment pipeline", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "web/lib/workspace/resolveDeptNeedsAttentionWorkUnit.ts"),
            "utf8"
        );
        expect(src).toContain("enrollment_pipeline");
        expect(src).toContain("workUnitDefinesNeedsAttentionQueue");
        const loader = fs.readFileSync(
            path.join(repoRoot, "web/lib/workspace/loadDeptAttentionPreviewServer.ts"),
            "utf8"
        );
        expect(loader).toContain("resolveDeptNeedsAttentionWorkUnit");
    });

    it("dept attention lane reuses single resolver pass (no double resolve in bucket builder)", () => {
        const bucketPath = path.join(
            repoRoot,
            "web/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets.ts"
        );
        const src = fs.readFileSync(bucketPath, "utf8");
        expect(src).toContain("resolved_by_id");
        expect(src).toContain('columnSelect: "resolver_minimal"');
        expect(src).toContain("skipPostFilterSort: true");
        expect(src).toContain("collectNeedsAttentionResolverMatches");
        expect(src).not.toContain("resolveOpportunityAttention(");
    });

    it("loadOpportunityNeedsAttentionRows exposes resolved_by_id for bucket filters", () => {
        const svcPath = path.join(repoRoot, "web/lib/queues/QueueService.ts");
        const src = fs.readFileSync(svcPath, "utf8");
        expect(src).toContain("resolved_by_id");
        expect(src).toContain("createOpportunityAttentionResolverBatchContext");
        expect(src).toContain("NEEDS_ATTENTION_OPPORTUNITY_SELECT_RESOLVER_MINIMAL");
        expect(src).toContain("membership_filter_ms");
    });

    it("bootstrap route bundles KPI placements and right-rail actions", () => {
        const routePath = path.join(
            repoRoot,
            "web/app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts"
        );
        const src = fs.readFileSync(routePath, "utf8");
        expect(src).toContain("loadDepartmentKpiPlacementsServer");
        expect(src).toContain("loadRightRailActionsBundleServer");
        expect(src).toContain("right_rail_work_unit_id");
    });

    it("right rail client fetch uses single bundle route", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "web/lib/workspace/fetchWorkspaceRightRailResolvedActions.ts"),
            "utf8"
        );
        expect(src).toContain("right-rail-bundle");
        expect(src).not.toContain('surface",');
    });

    it("pipeline server probe uses partial lane counts and preloaded definition", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "web/lib/workspace/resolveDeptPipelineExecSurfaceServer.ts"),
            "utf8"
        );
        expect(src).toContain('summaryMode: "partial"');
        expect(src).toContain("preloadedQueueDefinition");
        expect(src).toContain("pipelineWorkUnit");
    });

    it("dept page prefers operational-bootstrap over legacy fan-out", () => {
        const pagePath = path.join(
            repoRoot,
            "web/app/adminV2/workspace/dept/[departmentId]/page.tsx"
        );
        const src = fs.readFileSync(pagePath, "utf8");
        expect(src).toContain("operational-bootstrap");
        expect(src).toContain("bootstrap_ready");
        expect(src.indexOf("operational-bootstrap")).toBeLessThan(src.indexOf("legacy fan-out"));
    });

    it("getDepartmentWorkUnitQueueSummaries accepts preset work unit ids", () => {
        const svcPath = path.join(repoRoot, "web/lib/queues/QueueService.ts");
        const src = fs.readFileSync(svcPath, "utf8");
        expect(src).toContain("workUnitIds?: string[]");
        expect(src).toContain("skipWuListQuery");
        expect(src).toContain("preloadedQueueDefinition");
        expect(src).toContain("workUnitPreloadById");
    });
});
