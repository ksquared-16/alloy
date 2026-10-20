/** @vitest-environment jsdom */
/**
 * BP V2 Slice 3 — the `/workspace` site selection reaches the provisioning answer's identity (its URL
 * key), and the server composer turns it into the projection scope it hands rows AND seeded counts.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { provisioningAnswerUrl } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import { setLiveStickyWorkspaceSiteId } from "@/lib/adminV2/workspaceSiteFilterClient";

describe("the answer key carries the selected site", () => {
    it("with a selection the URL names it; without one it does not", () => {
        setLiveStickyWorkspaceSiteId(null);
        expect(provisioningAnswerUrl("all-assignments", "current")).not.toContain("workspace_site_id");
        setLiveStickyWorkspaceSiteId("site-b");
        expect(provisioningAnswerUrl("all-assignments", "current")).toContain("workspace_site_id=site-b");
        // prefetch, seed and fetch build through this one function, so they key identically
        expect(provisioningAnswerUrl("all-assignments", "current")).toBe(provisioningAnswerUrl("all-assignments", "current"));
        setLiveStickyWorkspaceSiteId(null);
    });
});

describe("server wiring (source contract)", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");
    it("the answer route, page and composer pass the selection into the projection scope and seed", () => {
        expect(read("app/api/admin/work-units/[id]/provisioning-answer/route.ts")).toContain('workspaceSiteId: url.get("workspace_site_id")');
        expect(read("app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx")).toContain("workspaceSiteId: one(sp.workspace_site_id)");
        const composer = read("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts");
        expect(composer).toContain("projectionScope: domainProjectionScopeFromAccess(gate.dim, input.workspaceSiteId)");
        expect(composer).toContain("scope: domainProjectionScopeFromAccess(gate.dim, input.workspaceSiteId)");
        expect(read("app/api/admin/queue-view-totals/route.ts")).toContain("domainProjectionScopeFromAccess(dim, parsed.selectedSiteId)");
    });
    it("a site change re-prepares a projection surface through the existing invalidate + re-commit seam", () => {
        const rt = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        const block = rt.slice(rt.indexOf("A SITE CHANGE RE-PREPARES A PROJECTION VIEW"), rt.indexOf("A SITE CHANGE RE-PREPARES A PROJECTION VIEW") + 1500);
        expect(block).toContain('snapshot?.terminal !== "projection"');
        expect(block).toContain("kernel.provisioning.invalidateWorkUnit(current)");
        expect(block).toContain("ATTENTION_SCOPE.LENS");
    });
});
void vi;
