import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    attachLifecycleSiblingTotals,
    dedupeLifecycleSiblingWorkUnitsById,
    filterSortLifecycleSiblingWorkUnits,
    lifecycleSiblingHeaderPaintReady,
    lifecycleSiblingTotalsFromDeptSummaries,
    workUnitSummariesFromDepartmentQueueSummariesResponse,
    mapLifecycleSiblingNavRows,
    mergeLifecycleSiblingHydrationBlock,
    sortLifecycleSiblingWorkUnits,
} from "@/lib/lifecycle/lifecycleWorkUnitSiblingHydration";
import { buildLifecycleBuilderOwnedAboveFoldHeaderSections } from "@/lib/lifecycle/lifecycleWorkUnitShellPills";
import { buildWorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";
import { resolveDeptWorkUnitDisplayLabel } from "@/lib/workspace/workUnitShellDisplayTitle";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycleWorkUnitSiblingHydration", () => {
    it("sorts siblings by sort_order then label", () => {
        const sorted = sortLifecycleSiblingWorkUnits([
            { id: "b", name: "Waitlist", key: "lifecycle_wu_waitlist", sort_order: 30 },
            { id: "a", name: "Lead", key: "lifecycle_wu_lead", sort_order: 10 },
            { id: "c", name: "Tour", key: "lifecycle_wu_tour", sort_order: 20 },
        ]);
        expect(sorted.map((s) => s.id)).toEqual(["a", "c", "b"]);
    });

    it("dedupes lifecycle siblings by id", () => {
        const rows = dedupeLifecycleSiblingWorkUnitsById([
            { id: "wu-1", name: "A", key: "lifecycle_wu_lead" },
            { id: "wu-1", name: "B", key: "lifecycle_wu_lead" },
            { id: "wu-2", name: "Qual", key: "lifecycle_wu_qualification" },
        ]);
        expect(rows).toHaveLength(2);
    });

    it("bootstrap block merges to sorted nav rows with totals", () => {
        const merged = mergeLifecycleSiblingHydrationBlock({
            work_units: [
                { id: "wu-tour", name: "Tours", key: "lifecycle_wu_tour", sort_order: 2 },
                { id: "wu-lead", name: "New Leads", key: "lifecycle_wu_lead", sort_order: 1 },
            ],
            totals_by_work_unit_id: {
                "wu-lead": 5,
                "wu-tour": 3,
            },
        });
        expect(merged?.siblings.map((s) => s.name)).toEqual(["New Leads", "Tours"]);
        expect(merged?.totalsByWorkUnitId["wu-tour"]).toBe(3);
    });

    it("header paint ready only after hydration complete with siblings", () => {
        expect(
            lifecycleSiblingHeaderPaintReady({
                hydrationComplete: false,
                siblings: [{ id: "a", name: "Lead", key: "k", total: null }],
            })
        ).toBe(false);
        expect(
            lifecycleSiblingHeaderPaintReady({
                hydrationComplete: true,
                siblings: [],
            })
        ).toBe(false);
        expect(
            lifecycleSiblingHeaderPaintReady({
                hydrationComplete: true,
                siblings: [{ id: "a", name: "Lead", key: "k", total: 1 }],
            })
        ).toBe(true);
    });

    it("renamed work unit name wins over metadata stage label in display resolver", () => {
        expect(
            resolveDeptWorkUnitDisplayLabel({
                name: "New Leads",
                key: "lifecycle_wu_lead",
                metadata: { lifecycle_stage_label: "Lead" },
            })
        ).toBe("New Leads");
    });

    it("attachLifecycleSiblingTotals uses lifecycle visibility totals map", () => {
        const out = attachLifecycleSiblingTotals({
            siblings: [
                { id: "wu-wl", name: "Waitlist", key: "lifecycle_wu_waitlist", total: null },
                { id: "wu-tour", name: "Tours", key: "lifecycle_wu_tour", total: null },
            ],
            totalsByWorkUnitId: { "wu-wl": 4, "wu-tour": 0 },
            currentWorkUnitId: "wu-tour",
            currentWorkUnitTotal: 7,
        });
        expect(out.find((s) => s.id === "wu-tour")?.total).toBe(7);
        expect(out.find((s) => s.id === "wu-wl")?.total).toBe(4);
    });

    it("dept cache summaries feed pill totals without changing sibling list", () => {
        const totals = lifecycleSiblingTotalsFromDeptSummaries({
            "wu-tour": { total: 12, needs_attention: 0 },
        });
        expect(totals["wu-tour"]).toBe(12);
    });

    it("normalizes department queue summaries API rows for pill totals", () => {
        const summaries = workUnitSummariesFromDepartmentQueueSummariesResponse([
            { id: "wu-tour", work_unit_scope_total: 45 },
            { id: "wu-lead", work_unit_scope_total: 17, queues: [{ key: "needs_attention", count: 2 }] },
            { id: "wu-bad", error: "fail" },
        ]);
        expect(summaries["wu-tour"].total).toBe(45);
        expect(summaries["wu-lead"].total).toBe(17);
        expect(summaries["wu-lead"].needs_attention).toBe(2);
        expect(summaries["wu-bad"]).toBeUndefined();
        expect(lifecycleSiblingTotalsFromDeptSummaries(summaries)).toEqual({
            "wu-tour": 45,
            "wu-lead": 17,
        });
    });

    it("above-fold uses skeleton header while lifecycle sibling hydration pending", () => {
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            reserve_actions_rail: true,
            queue_summaries: [{ key: "lead", label: "Lead", priority: "standard", count: 1 }],
            queue_summaries_error: null,
            queue_pill_sections: null,
            queue_tab_placeholders: null,
            selected_queue_key: "lead",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: null,
            other_pill_section_key: null,
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: [],
            queue_items_loading: false,
            queue_lane_reveal_state: "ready_empty",
            queue_items_error: null,
            lifecycle_builder_owned_header_pending: true,
            lifecycle_builder_owned_header_sections: null,
        });
        expect(model.header.state).toBe("skeleton");
        expect(model.header.sections[0]?.chips.every((c) => c.count === "skeleton")).toBe(true);
    });

    it("full sibling header renders only when sections provided", () => {
        const sections = buildLifecycleBuilderOwnedAboveFoldHeaderSections({
            siblings: mapLifecycleSiblingNavRows([
                { id: "wu-1", name: "New Leads", key: "lifecycle_wu_lead", sort_order: 1 },
                { id: "wu-2", name: "Qualification", key: "lifecycle_wu_qualification", sort_order: 2 },
                { id: "wu-3", name: "Tours", key: "lifecycle_wu_tour", sort_order: 3 },
                { id: "wu-4", name: "Waitlist", key: "lifecycle_wu_waitlist", sort_order: 4 },
            ]),
            currentWorkUnitId: "wu-1",
            selectedQueueKey: null,
        });
        expect(sections[0]?.chips).toHaveLength(4);
        expect(sections[0]?.chips[0]?.label).toBe("New Leads");
    });

    it("filters inactive and pipeline rows from lifecycle sibling set", () => {
        const rows = filterSortLifecycleSiblingWorkUnits([
            { id: "1", name: "New Leads", key: "lifecycle_wu_lead", is_active: true, sort_order: 1 },
            { id: "2", name: "Pipeline", key: "enrollment_pipeline", is_active: true, sort_order: 0 },
            { id: "3", name: "Tours", key: "lifecycle_wu_tour", is_active: true, sort_order: 2 },
        ]);
        expect(rows.map((r) => r.id)).toEqual(["1", "3"]);
    });
});

describe("work-unit page lifecycle hydration wiring", () => {
    it("loads siblings from bootstrap and avoids partial cache-first paint", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("lifecycle_siblings");
        expect(page).toContain("lifecycleSiblingsHydrationComplete");
        expect(page).toContain("lifecycle_builder_owned_header_pending");
        expect(page).toContain("mergeLifecycleSiblingHydrationBlock");
        expect(page).not.toMatch(
            /cache\?\.workUnits\?\.length[\s\S]{0,120}setLifecycleSiblingWorkUnits/
        );
    });

    it("operational bootstrap loads lifecycle_siblings server-side", () => {
        const loader = read("lib/workspace/loadWorkUnitOperationalBootstrap.ts");
        expect(loader).toContain("lifecycle_siblings");
        expect(loader).toContain("getDepartmentWorkUnitQueueSummaries");
        expect(loader).toContain('countAccuracy: "exact"');
    });

    it("sibling fetch effect does not depend on queueSummaries", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        const effectBlock = page.slice(
            page.indexOf("lifecycleSiblingsHydrationComplete"),
            page.indexOf("lifecycleSiblingWorkUnitsForHeader")
        );
        expect(effectBlock).not.toContain("queueSummaries");
    });

    it("work-unit page fetches site-scoped department summaries for sibling pill totals", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("work-unit-queue-summaries");
        expect(page).toContain("summaries_fetch_start");
        expect(page).toContain("viewScopeFingerprint");
        expect(page).toContain("selectedSiteId");
        expect(page).not.toContain(
            "lifecycleSiblingTotalsFromDeptSummaries(cache?.workUnitSummaries)"
        );
    });
});
