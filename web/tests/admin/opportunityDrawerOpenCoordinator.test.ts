import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS,
    opportunityDrawerComposedRevealReady,
    opportunityDrawerPrimaryGatedRevealReady,
} from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("opportunity drawer primary-gated composed open", () => {
    it("loads bootstrap + primary + header before commit; full is background only", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("loadOpportunityDrawerComposedOpen");
        expect(lib).toContain("fetchOpportunityDrawerFullEntity");
        expect(lib).toContain("peekOpportunityDrawerFullEntity");
        expect(lib).toContain("opportunityDrawerComposedRevealReady");
        expect(lib).toMatch(
            /const \[bootstrap, primaryEntity\] = await Promise\.all\(\[bootstrapP, primaryP\]\)/,
        );
        expect(lib).not.toMatch(
            /const \[bootstrap, primaryEntity, fullEntity\] = await Promise\.all/,
        );
        expect(lib).not.toContain("1500");
    });

    it("composed reveal requires bootstrap + primary + header only (not full)", () => {
        const primary = {
            id: "o1",
            _record_surface: "drawer_primary",
            _customer_name: "Test Family",
            _inquiry_children: [{ person_id: "c1", display_name: "Child", desired_program_label: "Toddler" }],
        };
        const base = {
            opportunityId: "o1",
            bootstrap: { entity: { id: "o1" } } as never,
            primaryEntity: primary,
            headerActions: emptyResolvedActionsBySlot(),
            enrichmentHeldUntilInteraction: true,
            fullEntity: null,
        };
        expect(opportunityDrawerComposedRevealReady(base)).toBe(true);
        expect(opportunityDrawerPrimaryGatedRevealReady(base)).toBe(true);
        expect(
            opportunityDrawerComposedRevealReady({
                ...base,
                fullEntity: {
                    id: "o1",
                    _record_surface: "full",
                    _customer_name: "Test Family",
                    _inquiry_children: [
                        { person_id: "c1", display_name: "Child", desired_program_label: "Toddler" },
                    ],
                },
                enrichmentHeldUntilInteraction: false,
            })
        ).toBe(true);
        expect(
            opportunityDrawerComposedRevealReady({
                ...base,
                primaryEntity: { id: "o1", _record_surface: "drawer_visible", _customer_name: "Test" },
            })
        ).toBe(false);
        expect(
            opportunityDrawerComposedRevealReady({
                ...base,
                bootstrap: { entity: null } as never,
            })
        ).toBe(false);
    });

    it("emits primary-gated perf phases from coordinator", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("reportDrawerBootstrapReady");
        expect(lib).toContain("reportDrawerPrimaryReadyAtOpen");
        expect(lib).toContain("reportDrawerHeaderActionsReady");
        expect(lib).toContain("reportDrawerComposedRevealReady");
        const perf = read("lib/perf/adminV2DrawerPerf.ts");
        expect(perf).toContain("bootstrap_ready");
        expect(perf).toContain("drawer_primary_ready");
        expect(perf).toContain("header_actions_ready");
        expect(perf).toContain("composed_reveal_ready");
        expect(perf).toContain("full_hydrate_ready");
        expect(perf).toContain("post_reveal_enrich_start");
        expect(perf).toContain("post_reveal_enrich_end");
    });

    it("intent prefetch warms bootstrap + primary on hover; full on pointer-down helper", () => {
        const intent = read("lib/admin/opportunityDrawerIntentPrefetch.ts");
        expect(intent).toContain("prefetchOpportunityDrawerFullOnRowIntent");
        expect(intent).toContain("prefetchOpportunityDrawerPrimary");
        expect(intent).toContain("prefetchOpportunityDrawerFull");
        expect(intent).toContain("pointer-down");
    });

    it("open coordinator reuses bootstrap entity as drawer_primary when contract-ready", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toContain("opportunityDrawerPrimaryContractReady(bootEntity, id)");
        expect(lib).toContain("drawer_visible");
        expect(lib).toContain("putDrawerEntitySnapshot");
    });

    it("AdminEntityDrawer applies composed preload and schedules background full", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("preload.fullEntity");
        expect(drawer).toContain("preload.headerActions");
        expect(drawer).toContain("opportunityDrawerEnrichmentHeld");
        expect(drawer).toContain("runOpportunityBackgroundFullHydrate");
        expect(drawer).toContain("reportPostRevealEnrichStart");
    });

    it("uses short anti-flicker only on cold path", () => {
        expect(OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS).toBeLessThanOrEqual(250);
    });

    it("prefetch_hit does not require full warm", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).toMatch(/prefetchHit = bootstrapWarm && primaryWarm/);
        expect(lib).not.toMatch(/prefetchHit = bootstrapWarm && primaryWarm && fullWarm/);
    });
});
