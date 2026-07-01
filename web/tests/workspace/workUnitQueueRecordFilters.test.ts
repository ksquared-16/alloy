import { describe, expect, it } from "vitest";

import { applyWorkUnitQueueRecordFilters } from "@/lib/workspace/applyWorkUnitQueueRecordFilters";
import { extractWorkUnitQueueRecordFilterFacets } from "@/lib/workspace/extractWorkUnitQueueRecordFilterFacets";
import {
    buildWorkUnitQueueRecordFilterFacets,
    resolveWorkUnitQueueRecordFilterFields,
    workUnitQueueRecordFilterIsActive,
} from "@/lib/workspace/workUnitQueueRecordFilterConfig";
import { EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER } from "@/lib/workspace/workUnitQueueRecordFilterTypes";
import {
    readWorkUnitQueueRecordFiltersFromSearchParams,
    writeWorkUnitQueueRecordFiltersToSearchParams,
} from "@/lib/workspace/workUnitQueueRecordFilterUrl";

describe("workUnitQueueRecordFilters", () => {
    const sampleRows = [
        {
            id: "opp-1",
            name: "Smith Family",
            status_key: "new_inquiry",
            updated_at: "2026-05-20T10:00:00.000Z",
            location_id: "site-a",
            _location_label: "Hayes",
            _requested_program: "Preschool",
            _primary_contact_line: "Jane Smith",
            metadata: { tour_date: "2026-05-25", next_follow_up_at: "2026-05-22T09:00:00.000Z" },
        },
        {
            id: "opp-2",
            name: "Lee Family",
            status_key: "tour_scheduled",
            updated_at: "2026-05-18T10:00:00.000Z",
            location_id: "site-b",
            _location_label: "Mission",
            _requested_program: "Toddler",
            metadata: { tour_date: "2026-05-21" },
        },
    ] as Record<string, unknown>[];

    it("resolveWorkUnitQueueRecordFilterFields is grain-aware", () => {
        const caseFields = resolveWorkUnitQueueRecordFilterFields({
            entityType: "opportunity",
            queueKey: "new_leads",
            grain: "case",
            isNeedsAttention: false,
        });
        expect(caseFields.map((f) => f.kind)).toContain("search");
        expect(caseFields.map((f) => f.kind)).toContain("sort");

        const childFields = resolveWorkUnitQueueRecordFilterFields({
            entityType: "opportunity",
            queueKey: "enrollment_offers",
            grain: "child",
            isNeedsAttention: false,
        });
        expect(childFields.find((f) => f.kind === "status")?.label).toBe("Lifecycle status");

        const waitlistFields = resolveWorkUnitQueueRecordFilterFields({
            entityType: "opportunity",
            queueKey: "waitlist",
            grain: "candidate",
            domain: "waitlist",
            isNeedsAttention: false,
        });
        const sortOptions = buildWorkUnitQueueRecordFilterFacets(
            {
                entityType: "opportunity",
                queueKey: "waitlist",
                grain: "candidate",
                domain: "waitlist",
                isNeedsAttention: false,
            },
            extractWorkUnitQueueRecordFilterFacets([])
        ).sortOptions.map((o) => o.value);
        expect(waitlistFields.map((f) => f.kind)).toContain("program");
        expect(sortOptions).toContain("priority_order");
    });

    it("includes attention reason filter on needs_attention overlay", () => {
        const fields = resolveWorkUnitQueueRecordFilterFields({
            entityType: "opportunity",
            queueKey: "needs_attention",
            grain: "case",
            isNeedsAttention: true,
        });
        expect(fields.map((f) => f.kind)).toContain("attention_reason");
    });

    it("applyWorkUnitQueueRecordFilters searches and filters without changing membership source", () => {
        const out = applyWorkUnitQueueRecordFilters(sampleRows, {
            ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
            search: "smith",
        });
        expect(out.totalLoaded).toBe(2);
        expect(out.filteredCount).toBe(1);
        expect(out.items[0]?.id).toBe("opp-1");
    });

    it("applyWorkUnitQueueRecordFilters filters by status and site", () => {
        const out = applyWorkUnitQueueRecordFilters(sampleRows, {
            ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
            statusKey: "tour_scheduled",
            siteKey: "site-b",
        });
        expect(out.filteredCount).toBe(1);
        expect(out.items[0]?.id).toBe("opp-2");
    });

    it("applyWorkUnitQueueRecordFilters sorts by tour_date ascending", () => {
        const out = applyWorkUnitQueueRecordFilters(sampleRows, {
            ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
            sort: "tour_date",
        });
        expect(out.items.map((r) => r.id)).toEqual(["opp-2", "opp-1"]);
    });

    it("extractWorkUnitQueueRecordFilterFacets builds options from row previews", () => {
        const facets = extractWorkUnitQueueRecordFilterFacets(sampleRows);
        expect(facets.statusOptions.map((o) => o.value)).toEqual(expect.arrayContaining(["new_inquiry", "tour_scheduled"]));
        expect(facets.siteOptions.map((o) => o.label)).toEqual(expect.arrayContaining(["Hayes", "Mission"]));
        expect(facets.programOptions.map((o) => o.label)).toEqual(expect.arrayContaining(["Preschool", "Toddler"]));
    });

    it("serializes and parses record filter URL params", () => {
        const sp = writeWorkUnitQueueRecordFiltersToSearchParams(new URLSearchParams("queue=new_leads"), {
            ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
            search: "smith",
            statusKey: "new_inquiry",
            sort: "tour_date",
            siteKey: "site-a",
        });
        expect(sp.get("q")).toBe("smith");
        expect(sp.get("rf_status")).toBe("new_inquiry");
        expect(sp.get("rf_sort")).toBe("tour_date");
        expect(sp.get("rf_site")).toBe("site-a");
        const parsed = readWorkUnitQueueRecordFiltersFromSearchParams(sp);
        expect(parsed.search).toBe("smith");
        expect(parsed.statusKey).toBe("new_inquiry");
        expect(parsed.sort).toBe("tour_date");
    });

    it("workUnitQueueRecordFilterIsActive detects non-default state", () => {
        expect(workUnitQueueRecordFilterIsActive(EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER)).toBe(false);
        expect(
            workUnitQueueRecordFilterIsActive({
                ...EMPTY_WORK_UNIT_QUEUE_RECORD_FILTER,
                sort: "oldest",
            })
        ).toBe(true);
    });
});
