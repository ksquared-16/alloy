import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpportunityDrawerPipelineState } from "@/lib/adminV2/drawerPipeline";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 performance pass 4 contracts", () => {
    it("idle below-fold unlock waits for full hydrate settle", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("opportunityFullRecordHydrateApplied || opportunityBackgroundFullHydrateFailed");
        expect(drawer).toMatch(/if \(fullSettled\) \{[\s\S]{0,120}setTimeout/);
    });

    it("inquiry children section reorder waits for enrichment layout ready", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toMatch(
            /if \(!savedOrder\?\.length && opportunityDrawerEnrichmentLayoutReady\)/
        );
    });

    it("right column shell is content-driven without reserved min-height band", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("data-shell-slot=\"inquiry_summary_right\"");
        expect(drawer).toMatch(/oppInqInnerCardCompact[\s\S]{0,120}inquiry_summary_right/);
        expect(drawer).not.toContain("INQUIRY_SUMMARY_RIGHT_COLUMN_SHELL_MIN_H_CLASS");
        expect(drawer).not.toMatch(
            /oppInqInnerCard[\s\S]{0,80}min-h-\[16rem\]/
        );
    });

    it("queue nav skips composed open when entity snapshot is warm", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("peekDrawerEntitySnapshot");
        expect(ctx).toMatch(/preloadReady \|\| snapshotWarm/);
        expect(ctx).toContain("logOpportunityQueueNav");
    });

    it("primary prefetch seeds opportunity entity snapshot cache", () => {
        const primary = read("lib/admin/opportunityDrawerPrimaryPrefetch.ts");
        expect(primary).toContain("putDrawerEntitySnapshot");
    });

    it("activity tab does not refetch on revisit within same open", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("opportunityActivityTabLoadedIdRef");
        expect(drawer).toMatch(
            /opportunityActivityTabLoadedIdRef\.current === drawer\.id/
        );
    });

    it("waitlist queue_reveal skips placement projection", () => {
        const qs = read("lib/queues/QueueService.ts");
        const wl = read("lib/queues/candidateGrainWaitlistQueue.ts");
        expect(qs).toContain("skipPlacementProjection");
        expect(wl).toContain("skipPlacementProjection");
    });

    it("communications drawer tab routes use light admin context gate", () => {
        expect(read("app/api/admin/communications/threads/route.ts")).toContain(
            "requireAdminOrgContextLight"
        );
        expect(read("app/api/admin/communications/bindings/route.ts")).toContain(
            "requireAdminOrgContextLight"
        );
        expect(read("app/api/admin/communications/drawer-recipients/route.ts")).toContain(
            "requireAdminOrgContextLight"
        );
    });

    it("full hydrate does not change inquiry summary geometry when above-fold locked", () => {
        const shell = {
            entity_type: "opportunity" as const,
            layout_version: "test",
            tabs: ["overview"] as const,
            overview_sections: [
                {
                    key: "inquiry_children",
                    title: "Children",
                    defaultExpanded: true,
                    collapsible: true,
                    fields: [],
                },
            ],
            section_slots: [{ section_key: "inquiry_children", lifecycle: "immediate" as const }],
            geometry: { summary_right_column_reserved: true, family_contacts_in_summary: true },
            layout_config_snapshot: {},
        } satisfies DrawerShellContract;
        const primary = buildOpportunityDrawerPipelineState({
            shell,
            record: { id: "o1", _record_surface: "drawer_primary" },
            drawer_id: "o1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        const fullLocked = buildOpportunityDrawerPipelineState({
            shell,
            record: { id: "o1", _record_surface: "full" },
            drawer_id: "o1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        expect(fullLocked.above_fold.inquiry_summary?.column_mode).toBe(
            primary.above_fold.inquiry_summary?.column_mode
        );
        expect(fullLocked.above_fold.inquiry_summary?.show_right_column).toBe(
            primary.above_fold.inquiry_summary?.show_right_column
        );
    });
});
