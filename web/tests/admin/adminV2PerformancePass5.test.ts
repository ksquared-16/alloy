import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpportunityDrawerPipelineState } from "@/lib/adminV2/drawerPipeline";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline";
import {
    opportunityDrawerAboveFoldGeometryChanged,
    snapshotOpportunityDrawerAboveFoldGeometry,
} from "@/lib/admin/drawer/opportunityDrawerAboveFoldGeometry";
import {
    buildOpportunityDrawerOpenerHintParams,
    readOpportunityDrawerOpenerHints,
} from "@/lib/admin/opportunityDrawerOpenerHints";
import {
    queueRowsBufferMatchesActiveLane,
    shouldApplyWorkUnitQueueRowsResponse,
} from "@/lib/workspace/workUnitQueueRowFetchApply";
import {
    tryBeginOpportunityDrawerHydrate,
    finishOpportunityDrawerHydrate,
} from "@/lib/admin/opportunityDrawerHydrateGuards";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 performance pass 5 contracts", () => {
    it("queue pill fetch ignores stale in-flight response", () => {
        expect(
            shouldApplyWorkUnitQueueRowsResponse({
                requestSeq: 2,
                latestRequestSeq: 3,
                stillSelected: true,
            })
        ).toEqual({ apply: false, skippedReason: "stale_request_seq" });

        expect(
            shouldApplyWorkUnitQueueRowsResponse({
                requestSeq: 3,
                latestRequestSeq: 3,
                stillSelected: false,
            })
        ).toEqual({ apply: false, skippedReason: "lane_changed" });

        expect(
            shouldApplyWorkUnitQueueRowsResponse({
                requestSeq: 3,
                latestRequestSeq: 3,
                stillSelected: true,
            })
        ).toEqual({ apply: true, skippedReason: null });
    });

    it("buffered queue rows only mask loading for the active lane", () => {
        const eq = (a: string, b: string) => a === b;
        expect(queueRowsBufferMatchesActiveLane("waitlist", "tours", eq)).toBe(false);
        expect(queueRowsBufferMatchesActiveLane("tours", "tours", eq)).toBe(true);
        expect(queueRowsBufferMatchesActiveLane(null, "tours", eq)).toBe(false);
    });

    it("work-unit page wires user-initiated queue switch + stale apply guard", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("userInitiated: true");
        expect(page).toContain("shouldApplyWorkUnitQueueRowsResponse");
        expect(page).toContain("queueRowsBufferQueueKeyRef");
        expect(page).toContain("queueRowsBufferMatchesActiveLane");
        expect(page).toContain("logQueueSwitch");
    });

    it("full hydrate cannot change above-fold geometry when layout locked", () => {
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
            record: {
                id: "o1",
                _record_surface: "drawer_primary",
                _customer_name: "Acme Family",
                _primary_person_name: "Jane Doe",
            },
            drawer_id: "o1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            full_hydrate_ready: false,
            task_assist_enabled: false,
        });
        const full = buildOpportunityDrawerPipelineState({
            shell,
            record: {
                id: "o1",
                _record_surface: "full",
                _customer_name: "Acme Family",
                _primary_person_name: "Jane Doe",
                metadata: { tour_date: "2026-06-01" },
            },
            drawer_id: "o1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: true,
            below_fold_enrichment_ready: false,
            full_hydrate_ready: true,
            task_assist_enabled: true,
        });
        expect(primary.above_fold.inquiry_summary?.column_mode).toBe(full.above_fold.inquiry_summary?.column_mode);
        expect(primary.above_fold.inquiry_summary?.show_right_column).toBe(
            full.above_fold.inquiry_summary?.show_right_column
        );

        const before = snapshotOpportunityDrawerAboveFoldGeometry({
            id: "o1",
            _customer_name: "Acme Family",
            _primary_person_name: "Jane Doe",
        });
        const after = snapshotOpportunityDrawerAboveFoldGeometry({
            id: "o1",
            _customer_name: "Acme Family",
            _primary_person_name: "Jane Doe",
            metadata: { tour_date: "2026-06-01" },
        });
        expect(opportunityDrawerAboveFoldGeometryChanged(before, after)).toBe(false);
    });

    it("drawer primary uses queue row display hints when available", () => {
        const entity = read("lib/admin/opportunityEntityRecord.ts");
        expect(entity).toContain("hintCustomerName");
        expect(entity).toContain("hintPrimaryPersonName");
        expect(entity).toMatch(/hintCustomerName != null[\s\S]{0,80}Promise\.resolve/);

        const params = buildOpportunityDrawerOpenerHintParams(
            { work_unit_id: "wu-1", department_id: "dept-1" },
            { title: "Jane Doe", subtitle: "Acme Family" }
        );
        expect(readOpportunityDrawerOpenerHints(params)).toMatchObject({
            primaryPersonName: "Jane Doe",
            customerName: "Acme Family",
        });
    });

    it("duplicate drawer surface fetch is suppressed per open", () => {
        const id = "opp-pass5-dedupe";
        expect(tryBeginOpportunityDrawerHydrate(id, "primary")).toBe(true);
        expect(tryBeginOpportunityDrawerHydrate(id, "primary")).toBe(false);
        finishOpportunityDrawerHydrate(id, "primary", "success");
        expect(tryBeginOpportunityDrawerHydrate(id, "primary")).toBe(false);

        expect(tryBeginOpportunityDrawerHydrate(id, "full")).toBe(true);
        expect(tryBeginOpportunityDrawerHydrate(id, "full")).toBe(false);
    });

    it("person drawer uses adminV2 record modal frame", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("isPersonRecordModalTarget");
        expect(drawer).toContain("personRecordChromeBodyShell");
    });

    it("opportunity to person transition seeds first paint from contact data", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("personDrawerSeedFromOpportunityRecord");
        expect(drawer).toContain("personDrawerOpenSeed");
        expect(read("lib/admin/drawer/openViewPersonFromOpportunity.ts")).toContain("putDrawerEntitySnapshot");
    });
});
