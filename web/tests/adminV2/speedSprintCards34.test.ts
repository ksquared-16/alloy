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
});
