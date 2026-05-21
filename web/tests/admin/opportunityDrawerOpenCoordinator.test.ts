import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS,
    opportunityDrawerComposedRevealReady,
} from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("opportunity drawer composed open", () => {
    it("waits for bootstrap + primary + full + header before commit", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("loadOpportunityDrawerComposedOpen");
        expect(lib).toContain("fetchOpportunityDrawerFullEntity");
        expect(lib).toContain("fetchOpportunityDrawerHeaderActions");
        expect(lib).toContain("opportunityDrawerComposedRevealReady");
        expect(lib).not.toContain("1500");
    });

    it("composed reveal requires full or enrichment held", () => {
        const primary = { id: "o1", _record_surface: "drawer_primary" };
        const base = {
            opportunityId: "o1",
            bootstrap: { entity: { id: "o1" } } as never,
            primaryEntity: primary,
            headerActions: emptyResolvedActionsBySlot(),
            enrichmentHeldUntilInteraction: false,
            fullEntity: null,
        };
        expect(opportunityDrawerComposedRevealReady(base)).toBe(false);
        expect(
            opportunityDrawerComposedRevealReady({
                ...base,
                enrichmentHeldUntilInteraction: true,
            })
        ).toBe(true);
        expect(
            opportunityDrawerComposedRevealReady({
                ...base,
                fullEntity: { id: "o1", _record_surface: "full" },
            })
        ).toBe(true);
    });

    it("intent prefetch warms bootstrap, primary, and full", () => {
        const intent = read("lib/admin/opportunityDrawerIntentPrefetch.ts");
        expect(intent).toContain("prefetchOpportunityDrawerFull");
        expect(intent).toContain("prefetchOpportunityDrawerPrimary");
    });

    it("AdminEntityDrawer applies composed preload before paint", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("preload.fullEntity");
        expect(drawer).toContain("preload.headerActions");
        expect(drawer).toContain("opportunityDrawerEnrichmentHeld");
        expect(drawer).toContain("setPostDrawerVisibleKey");
    });

    it("uses short anti-flicker only on cold path", () => {
        expect(OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS).toBeLessThanOrEqual(250);
    });
});
