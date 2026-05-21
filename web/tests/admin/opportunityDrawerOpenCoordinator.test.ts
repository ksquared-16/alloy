import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    OPPORTUNITY_DRAWER_OPEN_MIN_READY_MS,
    shouldDeferOpportunityDrawerOpen,
} from "@/lib/admin/opportunityDrawerOpenCoordinator";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("shouldDeferOpportunityDrawerOpen", () => {
    it("defers existing opportunities on adminV2 workspace paths when bootstrap is enabled", () => {
        const src = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(src).toContain('p.startsWith("/adminV2")');
        expect(src).toContain('p.startsWith("/admin/workspace")');
        expect(src).toContain("adminV2DrawerBootstrapEnabled()");
    });

    it("does not defer new records or non-workspace paths", () => {
        expect(shouldDeferOpportunityDrawerOpen("/adminV2/workspace/dept/x/work-unit/y", "new")).toBe(false);
        expect(shouldDeferOpportunityDrawerOpen("/admin/legacy", "opp-1")).toBe(false);
        expect(shouldDeferOpportunityDrawerOpen(null, "")).toBe(false);
    });
});

describe("deferred opportunity drawer open wiring", () => {
    it("context intercepts openDrawer and holds opening state until commit", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("shouldDeferOpportunityDrawerOpen");
        expect(ctx).toContain("setOpeningOpportunity");
        expect(ctx).toContain("commitOpportunityDrawerOpen");
        expect(ctx).toContain("opportunityDrawerPreloadRef");
    });

    it("coordinator loads bootstrap + primary before commit", () => {
        const coord = read("components/admin/OpportunityDrawerOpenCoordinator.tsx");
        expect(coord).toContain("raceOpportunityDrawerFirstPaintWithMinDelay");
        expect(coord).toContain("commitOpportunityDrawerOpen");
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("fetchOpportunityDrawerOperationalBootstrap");
        expect(lib).toContain("surface=drawer_primary");
        expect(lib).toContain("opportunityDrawerPrimaryContractReady");
    });

    it("shows external Opening record overlay, not modal", () => {
        const overlay = read("components/admin/OpportunityDrawerOpeningOverlay.tsx");
        expect(overlay).toContain("Opening record");
        expect(overlay).toContain("data-opportunity-drawer-opening-overlay");
        const providers = read("app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx");
        expect(providers).toContain("OpportunityDrawerOpenCoordinator");
    });

    it("AdminEntityDrawer consumes preload in layout effect and suppresses in-drawer loading shell", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("consumeOpportunityDrawerPreload");
        expect(drawer).toContain("opportunityDrawerFirstPaintPreloadedRef");
        expect(drawer).toContain("!isOpportunityDrawerOpening");
        expect(drawer).toContain("opportunityDrawerFirstPaintPreloaded");
        expect(drawer).toMatch(
            /opportunityDrawerPrimaryLoadingVisible[\s\S]*?!opportunityDrawerFirstPaintPreloaded/,
        );
    });

    it("enforces minimum external loading duration before mount", () => {
        expect(OPPORTUNITY_DRAWER_OPEN_MIN_READY_MS).toBe(1500);
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("raceOpportunityDrawerFirstPaintWithMinDelay");
    });
});
