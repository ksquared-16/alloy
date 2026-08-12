import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    opportunityDrawerTourMetadataReady,
    opportunityDrawerTourSlotReady,
    personDrawerCoordinatedBodyReady,
    personDrawerSectionShowsCoordinatedReserve,
} from "@/lib/admin/drawer/drawerFirstPaintReadiness";
import { createOpportunityDrawerTabVisitSet } from "@/lib/admin/drawer/opportunityDrawerTabSession";
import { opportunityDrawerWorkflowTabMountEnabled } from "@/lib/admin/drawer/opportunityDrawerTabSession";

const webRoot = join(__dirname, "..", "..", "..");

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("drawerCoordinatedFirstPaintRegression", () => {
    it("opportunity workflow tabs pre-mount when drawer surface is ready", () => {
        const visited = createOpportunityDrawerTabVisitSet();
        expect(visited.has("communications")).toBe(true);
        expect(visited.has("notes")).toBe(true);
        expect(opportunityDrawerWorkflowTabMountEnabled(true, visited, "communications", true)).toBe(true);
        expect(opportunityDrawerWorkflowTabMountEnabled(true, new Set(["overview"]), "communications", true)).toBe(
            true
        );
    });

    it("tour metadata path is ready without bookings fetch", () => {
        expect(
            opportunityDrawerTourMetadataReady({
                metadata: { tour_date: "2026-06-01", tour_time: "10:00" },
            })
        ).toBe(true);
        expect(
            opportunityDrawerTourSlotReady({
                show_tour_slot: true,
                tour_from_metadata: true,
                tour_bookings_armed: false,
                tour_bookings_settled: false,
            })
        ).toBe(true);
    });

    it("person coordinated body requires full hydrate — no typed snapshot shortcut", () => {
        expect(
            personDrawerCoordinatedBodyReady({
                typed_snapshot: true,
                body_hydrated: false,
            })
        ).toBe(false);
        expect(
            personDrawerCoordinatedBodyReady({
                typed_snapshot: false,
                body_hydrated: true,
            })
        ).toBe(true);
        expect(
            personDrawerSectionShowsCoordinatedReserve({
                section_enabled: true,
                coordinated_body_ready: true,
                section_has_content: false,
            })
        ).toBe(false);
    });

    it("workspace cache primed skips loading gate flash", () => {
        const page = readSrc("app/adminV2/workspace/page.tsx");
        expect(page).toContain("workspaceCachePrimed");
        expect(page).toContain("quick_rollup_applied: metrics !== null || cachePrimed");
    });
});
