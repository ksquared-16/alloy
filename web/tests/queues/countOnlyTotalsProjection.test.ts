import { describe, expect, it } from "vitest";

import {
    buildQueueRowEnrichmentPlan,
    countOnlyQueueRowEnrichmentPlan,
    enrichmentQueriesRunFromPlan,
} from "@/lib/queues/queueRowEnrichmentPlan";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { aggregateWorkViewTotals } from "@/lib/queues/aggregateWorkViewTotals";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

function crmUi() {
    return getQueueUiConfig({
        version: 1,
        entity_type: "opportunity",
        queues: [{ key: "lifecycle_lead", label: "Lead", filters: [] }],
        ui: {
            row_preview: {
                variant: "crm_compact",
                fields: ["title", "status", "primary_contact", "phone", "child_name", "program", "tour_date"],
                actions: ["open"],
            },
        },
    } as never);
}

describe("count_only enrichment plan — a total never materializes presentation rows", () => {
    it("disables every relational and batch fetch, even for CRM + layout-runtime rows", () => {
        const plan = buildQueueRowEnrichmentPlan({
            ui: crmUi(),
            enrichmentMode: "count_only",
            layoutRuntimeQueueBody: true, // the deployed WU config — count_only must still be empty
            executableQueueKey: "lifecycle_lead",
        });
        expect(plan.relationFetch).toEqual({ persons: false, contacts: false, customers: false, customerMembers: false });
        expect(Object.values(plan.batchFetch).every((v) => v === false)).toBe(true);
        expect(plan.attachCaseGrainRowContext).toBe(false);
        const queries = enrichmentQueriesRunFromPlan(plan);
        // Only status_definitions (base) — NO persons/customers/customer_members/tasks/activity/context.
        for (const forbidden of ["persons", "contacts", "customers", "customer_members", "open_tasks", "activity_timeline_events", "queue_row_context"]) {
            expect(queries).not.toContain(forbidden);
        }
        expect(countOnlyQueueRowEnrichmentPlan().enrichmentMode).toBe("count_only");
    });
});

describe("count parity — counts derive from operational fields only (enrichment-independent)", () => {
    // The Enrollment Work Views filter on operational status — the base-query field present regardless
    // of enrichment. So count_only base rows produce identical counts to full-enrichment base rows.
    const views: WorkViewConfigV1Stored[] = [
        { id: "new_leads", label: "New Leads", display_order: 1, visible_in_runtime: true, filters_v1: [{ field_key: "opportunity_status", operator: "equals", value: "new_inquiry" }] },
        { id: "active_pipeline", label: "Active Pipeline", display_order: 2, visible_in_runtime: true, match: "any", filters_v1: [
            { field_key: "opportunity_status", operator: "equals", value: "tour_scheduled" },
            { field_key: "opportunity_status", operator: "equals", value: "waitlist" },
        ] },
        { id: "all_leads", label: "All Leads", display_order: 3, visible_in_runtime: true, filters_v1: [] },
    ] as unknown as WorkViewConfigV1Stored[];

    // Base rows as they arrive from a count_only fetch: operational fields only, NO persons/household.
    const countOnlyRows = [
        { id: "o1", status_key: "new_inquiry" },
        { id: "o2", status_key: "tour_scheduled" },
        { id: "o3", status_key: "waitlist" },
        { id: "o4", status_key: "waitlist" },
        { id: "o5", status_key: "lost" },
    ];
    // The same rows a queue_list fetch would produce, but WITH presentation enrichment attached.
    const enrichedRows = countOnlyRows.map((r) => ({
        ...r,
        _primary_contact_line: "Someone",
        _inquiry_children: [{ display_name: "Kid" }],
        _queue_row_context: { row_status_key: r.status_key },
    }));

    it("count_only and enriched base rows yield identical Work-View counts", () => {
        const a = aggregateWorkViewTotals({ baseRows: countOnlyRows, workViews: views, exactLaneTotal: countOnlyRows.length, baseTruncated: false });
        const b = aggregateWorkViewTotals({ baseRows: enrichedRows, workViews: views, exactLaneTotal: enrichedRows.length, baseTruncated: false });
        expect(a.new_leads.count).toBe(1);
        expect(a.active_pipeline.count).toBe(3); // tour_scheduled(1) + waitlist(2)
        expect(a.all_leads.count).toBe(5); // include-all = lane total
        // Parity: enrichment does not change any count.
        expect(b.new_leads.count).toBe(a.new_leads.count);
        expect(b.active_pipeline.count).toBe(a.active_pipeline.count);
        expect(b.all_leads.count).toBe(a.all_leads.count);
    });
});
