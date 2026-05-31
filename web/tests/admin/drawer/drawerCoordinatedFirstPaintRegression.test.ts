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

    it("person coordinated body accepts typed snapshot before full hydrate", () => {
        expect(
            personDrawerCoordinatedBodyReady({
                typed_snapshot: true,
                body_hydrated: false,
            })
        ).toBe(true);
        expect(
            personDrawerSectionShowsCoordinatedReserve({
                section_enabled: true,
                coordinated_body_ready: true,
                section_has_content: false,
            })
        ).toBe(true);
    });

    it("opportunity header actions stay on title rail across tabs", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("opportunityHeaderTitleRailStable");
        expect(drawer).toContain("opportunityHeaderQuickActionsNode");
        expect(drawer).toContain("headerTitleRightForDrawer");
        expect(drawer).not.toMatch(/drawerTab === "communications"[\s\S]{0,200}opportunityHeaderQuickActionsNode/);
    });

    it("opportunity notes tab exposes save affordance", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain('data-opportunity-notes-save="true"');
        expect(drawer).toContain("Save changes");
    });

    it("tuition section hidden below inquiry children in workflow v1", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain('s.key !== "inquiry_tuition"');
        expect(drawer).not.toContain("out.inquiry_tuition");
    });

    it("child seed uses section reserves instead of full overview skeleton", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("PersonDrawerSectionCoordinatedReserve");
        expect(drawer).toContain("!personDrawerTypedBodySnapshot");
        const operating = readSrc("components/admin/entity/PersonDrawerOperatingSections.tsx");
        expect(operating).toContain("showHouseholdReserve");
    });

    it("work-unit lane uses coordinated reveal state not row skeleton", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        expect(page).toContain("resolveWorkUnitQueueLaneRevealState");
        expect(page).toContain("queue_lane_reveal_state");
        expect(page).toContain("rowsHeld");
    });

    it("workspace cache primed skips loading gate flash", () => {
        const page = readSrc("app/adminV2/workspace/page.tsx");
        expect(page).toContain("workspaceCachePrimed");
        expect(page).toContain("quick_rollup_applied: metrics !== null || cachePrimed");
    });
});
