import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS } from "@/lib/admin/opportunityDrawerOpenCoordinator";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("opportunity drawer open coordinator", () => {
    it("loads bootstrap + primary in parallel without a 1500ms floor", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("Promise.all([bootstrapP, primaryP])");
        expect(lib).not.toContain("1500");
        expect(lib).toContain("OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS");
        expect(OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS).toBeLessThanOrEqual(250);
    });

    it("skips anti-flicker when intent prefetch is warm", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toMatch(/if \(!prefetchHit/);
        expect(lib).toContain("isOpportunityDrawerBootstrapWarm");
        expect(lib).toContain("isOpportunityDrawerPrimaryWarm");
    });

    it("intent prefetch warms bootstrap and primary", () => {
        const intent = read("lib/admin/opportunityDrawerIntentPrefetch.ts");
        expect(intent).toContain("fetchOpportunityDrawerOperationalBootstrap");
        expect(intent).toContain("prefetchOpportunityDrawerPrimary");
        const primary = read("lib/admin/opportunityDrawerPrimaryPrefetch.ts");
        expect(primary).toContain("drawer_primary");
    });

    it("queue rows prefetch on hover, mousedown, and focus with lane scope", () => {
        const qb = read("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(qb).toContain("onMouseEnter");
        expect(qb).toContain("onMouseDown");
        expect(qb).toContain("onFocus");
        expect(qb).toContain("opportunityDrawerWorkspaceContext");
    });

    it("emits coordinator perf marks on commit", () => {
        const perf = read("lib/perf/adminV2DrawerPerf.ts");
        expect(perf).toContain("drawer_open_click_to_overlay");
        expect(perf).toContain("drawer_open_bootstrap_ms");
        expect(perf).toContain("drawer_open_primary_ms");
        expect(perf).toContain("drawer_open_wait_for_both_ms");
        expect(perf).toContain("drawer_open_click_to_commit_ms");
        expect(perf).toContain("drawer_open_prefetch_hit");
        expect(perf).toContain("reportDrawerOpenCoordinatorCommit");
    });

    it("context intercepts openDrawer and holds opening state until commit", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("shouldDeferOpportunityDrawerOpen");
        expect(ctx).toContain("setOpeningOpportunity");
        expect(ctx).toContain("commitOpportunityDrawerOpen");
    });

    it("shows external Opening record overlay, not modal", () => {
        const overlay = read("components/admin/OpportunityDrawerOpeningOverlay.tsx");
        expect(overlay).toContain("Opening record");
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("!isOpportunityDrawerOpening");
        expect(drawer).toContain("consumeOpportunityDrawerPreload");
    });
});
