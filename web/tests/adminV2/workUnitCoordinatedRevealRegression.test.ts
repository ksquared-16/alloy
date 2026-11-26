import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(__dirname, "..", "..");

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("workUnitCoordinatedRevealRegression", () => {
    it("QueueRegion skips skeleton when prior rows are held during refetch", () => {
        const region = readSrc("components/presentation/workUnit/QueueRegion.tsx");
        expect(region).toContain("queueRegionRenderState");
        expect(region).toContain('renderState === "cold-loading"');
        expect(region).toContain("aria-busy={queue.loading || undefined}");
    });

    it("warm page reveal policy requires critical bundle before first paint", () => {
        const policy = readSrc("lib/adminV2/workUnitPageRevealPolicy.ts");
        expect(policy).not.toContain("page_seeded_from_cache");
        expect(policy).toContain("critical_bundle_ready");
    });
});

describe("drawerCoordinatedRevealRegression (source)", () => {

    it("child→opportunity restore re-warms graph via VM restore session", () => {
        const restore = readSrc(
            "lib/adminV2/viewModel/drawer/vmRuntime/restoreOpportunityDrawerSession.ts"
        );
        const ctx = readSrc("contexts/AdminDrawerContext.tsx");
        expect(restore).toContain("scheduleOpportunityDrawerGraphRewarmAfterRestore");
        expect(restore).toContain("scheduleWarmRelatedDrawerTargetsAfterVmApply");
        expect(ctx).toContain("goBackToLead");
        expect(ctx).toContain("buildRestoredOpportunityDrawerState");
    });

});
