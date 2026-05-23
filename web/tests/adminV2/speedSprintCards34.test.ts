import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("AdminV2 speed sprint Cards 3–4", () => {
    it("defer_bundle bootstrap omits empty kpi_placements and right_rail_actions keys", () => {
        const route = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        expect(route).toContain("...(deferBundle");
        expect(route).toMatch(/deferBundle\s*\?\s*\{\}/);
        expect(route).toContain('deferred: ["primary_lane_rows", "kpi_placements", "right_rail_actions"]');
    });

    it("drawer_primary uses early path before full parallel lookups", () => {
        const src = read("lib/admin/opportunityEntityRecord.ts");
        const primaryEarly = src.indexOf('surfaceParamEarly === "drawer_primary"');
        const parallelLookups = src.indexOf("parallel_initial_lookups");
        expect(primaryEarly).toBeGreaterThan(-1);
        expect(parallelLookups).toBeGreaterThan(-1);
        expect(primaryEarly).toBeLessThan(parallelLookups);
        expect(src).toContain("buildOpportunityDrawerVisiblePayload(supabase, orgId, data)");
        expect(src).not.toContain("drawer_primary_fast_path");
    });

    it("WU bootstrap resolves shared bootstrap in prep parallel", () => {
        const route = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        expect(route).toContain("buildQueueSummariesSharedBootstrap(gate.orgId)");
        expect(route).toContain("sharedBootstrapFromPrep");
    });

    it("dept bootstrap passes shared bootstrap from route prep", () => {
        const route = read("app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts");
        const loader = read("lib/workspace/loadDeptOperationalBootstrap.ts");
        expect(route).toContain("sharedBootstrap");
        expect(loader).toContain("params.sharedBootstrap");
        expect(loader).toContain("shared_bootstrap_reused");
    });

    it("WU bootstrap defers attention lane when not needed for primary reveal", () => {
        const loader = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(loader).toContain("attentionNeededForReveal");
        expect(loader).toContain("attention_deferred");
    });

    it("dept and WU prefetch use TTL meta for cache hit logging", () => {
        expect(read("lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap.ts")).toContain(
            "dedupeAdminFetchWithTtlMeta"
        );
        expect(read("lib/adminV2/workUnitBootstrapClientSession.ts")).toContain("dedupeAdminFetchWithTtlMeta");
        expect(read("app/adminV2/workspace/dept/[departmentId]/page.tsx")).toContain("logPrefetchAdminV2");
    });

    it("canonical WU bootstrap uses primary_row_limit 8", () => {
        expect(read("lib/adminV2/workUnitBootstrapClientSession.ts")).toContain('primary_row_limit: "8"');
    });

    it("WU bootstrap uses queue_reveal preview rows", () => {
        expect(read("lib/workspace/loadWorkUnitOperationalBootstrap.ts")).toContain("getWorkUnitQueuePreviewRows");
        expect(read("lib/queues/QueueService.ts")).toContain('rowEnrichment: "queue_reveal"');
    });

    it("dept prefetch uses bundle_mode=prefetch and deferred attention", () => {
        expect(read("lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap.ts")).toContain(
            'bundle_mode: "prefetch"'
        );
        expect(read("lib/workspace/loadDeptAttentionPreviewServer.ts")).toContain('"deferred"');
        expect(read("lib/workspace/loadWorkUnitOperationalBootstrap.ts")).toContain(
            "readWorkUnitQueueSummariesBootstrapCache"
        );
    });

    it("queue rows route uses single admin route gate", () => {
        expect(read("app/api/admin/queues/[workUnitId]/[queueKey]/route.ts")).toContain("loadAdminRouteGate");
        expect(read("app/api/admin/queues/[workUnitId]/[queueKey]/route.ts")).not.toContain("getAdminContextCached");
    });
});
