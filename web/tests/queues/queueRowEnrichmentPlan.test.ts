import { describe, expect, it, vi } from "vitest";

import { enrollmentOffersChildQueueRowId } from "@/lib/queues/childGrainEnrollmentQueue";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import {
    buildQueueRowEnrichmentPlan,
    enrichmentQueriesRunFromPlan,
} from "@/lib/queues/queueRowEnrichmentPlan";

function basicUi() {
    return getQueueUiConfig({
        version: 1,
        entity_type: "opportunity",
        queues: [{ key: "all", label: "All", filters: [] }],
        ui: {
            row_preview: {
                variant: "basic",
                fields: ["title", "status"],
                actions: ["open"],
            },
        },
    } as never);
}

function crmLeadUi() {
    return getQueueUiConfig({
        version: 1,
        entity_type: "opportunity",
        queues: [{ key: "lead", label: "Lead", filters: [] }],
        ui: {
            row_preview: {
                variant: "crm_compact",
                fields: [
                    "title",
                    "status",
                    "primary_contact",
                    "phone",
                    "email",
                    "child_name",
                    "program",
                    "start_date",
                    "tour_date",
                ],
                actions: ["open"],
            },
        },
    } as never);
}

describe("buildQueueRowEnrichmentPlan", () => {
    it("skips relational and task batch queries for basic title/status rows", () => {
        const plan = buildQueueRowEnrichmentPlan({
            ui: basicUi(),
            enrichmentMode: "queue_list",
            layoutRuntimeQueueBody: false,
            executableQueueKey: "lead",
        });

        expect(plan.relationFetch).toEqual({
            persons: false,
            contacts: false,
            customers: false,
            customerMembers: false,
        });
        expect(plan.batchFetch.openTasks).toBe(false);
        expect(plan.batchFetch.tourBookings).toBe(false);
        expect(plan.skippedEnrichment).toContain("open_tasks");
        expect(enrichmentQueriesRunFromPlan(plan)).not.toContain("open_tasks");
        expect(enrichmentQueriesRunFromPlan(plan)).not.toContain("persons");
    });

    it("fetches contact and household relations for configured CRM compact fields", () => {
        const plan = buildQueueRowEnrichmentPlan({
            ui: crmLeadUi(),
            enrichmentMode: "queue_list",
            layoutRuntimeQueueBody: false,
            executableQueueKey: "lead",
        });

        expect(plan.relationFetch.persons).toBe(true);
        expect(plan.relationFetch.contacts).toBe(true);
        expect(plan.relationFetch.customers).toBe(true);
        expect(plan.relationFetch.customerMembers).toBe(true);
        expect(plan.batchFetch.tourBookings).toBe(true);
        expect(plan.batchFetch.ocmDesiredStart).toBe(true);
    });

    it("skips open_tasks when layout runtime is off and lane is not needs_attention", () => {
        const plan = buildQueueRowEnrichmentPlan({
            ui: crmLeadUi(),
            enrichmentMode: "queue_list",
            layoutRuntimeQueueBody: false,
            executableQueueKey: "lead",
        });
        expect(plan.batchFetch.openTasks).toBe(false);
        expect(plan.skippedEnrichment).toContain("open_tasks");
    });

    it("includes open_tasks for needs_attention lane", () => {
        const plan = buildQueueRowEnrichmentPlan({
            ui: basicUi(),
            enrichmentMode: "queue_list",
            layoutRuntimeQueueBody: false,
            executableQueueKey: "needs_attention",
        });
        expect(plan.batchFetch.openTasks).toBe(true);
        expect(plan.skippedEnrichment).not.toContain("open_tasks");
    });

    it("includes open_tasks when layout runtime queue body is enabled", () => {
        const plan = buildQueueRowEnrichmentPlan({
            ui: basicUi(),
            enrichmentMode: "queue_list",
            layoutRuntimeQueueBody: true,
            executableQueueKey: "lead",
        });
        expect(plan.batchFetch.openTasks).toBe(true);
        expect(plan.batchFetch.activityTimelineEvents).toBe(true);
        expect(plan.relationFetch.customerMembers).toBe(true);
    });

    it("queue_reveal keeps configured tour and child OCM fetches for visible fields", () => {
        const tourUi = getQueueUiConfig({
            version: 1,
            entity_type: "opportunity",
            queues: [{ key: "tours", label: "Tours", filters: [] }],
            ui: {
                row_preview: {
                    variant: "crm_compact",
                    fields: ["title", "status", "child_name", "program", "tour_date"],
                    actions: ["open"],
                },
            },
        } as never);

        const plan = buildQueueRowEnrichmentPlan({
            ui: tourUi,
            enrichmentMode: "queue_reveal",
            layoutRuntimeQueueBody: true,
            executableQueueKey: "tours",
            skipOptionalEnrichmentFetches: true,
        });

        expect(plan.batchFetch.tourBookings).toBe(true);
        expect(plan.batchFetch.ocmDesiredStart).toBe(true);
        expect(plan.skippedEnrichment).not.toContain("tour_bookings");
        expect(plan.skippedEnrichment).not.toContain("ocm_desired_start");
        expect(plan.attachCaseGrainRowContext).toBe(true);
        expect(plan.skippedEnrichment).not.toContain("queue_row_context_case_grain");
    });

    it("queue_reveal skips case-grain row context on legacy non-layout paths", () => {
        const plan = buildQueueRowEnrichmentPlan({
            ui: basicUi(),
            enrichmentMode: "queue_reveal",
            layoutRuntimeQueueBody: false,
            executableQueueKey: "lead",
            skipOptionalEnrichmentFetches: true,
        });

        expect(plan.batchFetch.tourBookings).toBe(false);
        expect(plan.batchFetch.ocmDesiredStart).toBe(false);
        expect(plan.batchFetch.openTasks).toBe(false);
        expect(plan.attachCaseGrainRowContext).toBe(false);
        expect(plan.skippedEnrichment).toContain("queue_row_context_case_grain");
        expect(plan.skippedEnrichment).toContain("tour_bookings");
        expect(plan.skippedEnrichment).toContain("ocm_desired_start");
    });
});

describe("attachOpportunityQueueRowsWithRowContext", () => {
    it("skips case-grain _queue_row_context when attachCaseGrainRowContext is false", async () => {
        vi.stubEnv("ALLOY_QUEUE_ROW_CONTEXT_DISABLED", "");
        const { attachOpportunityQueueRowsWithRowContext } = await import(
            "@/lib/workUnits/attachQueueRowContextToItems"
        );
        const rows = attachOpportunityQueueRowsWithRowContext(
            [{ id: "opp-1", name: "Smith", status_key: "new" }],
            {
                entityType: "opportunity",
                requestedQueueKey: "lead",
                executableQueueKey: "lead",
                queueLabel: "Lead",
                normalized: { version: 2, entity_type: "opportunity", queues: [] } as never,
            },
            { attachCaseGrainRowContext: false }
        );
        expect(rows[0]).not.toHaveProperty("_queue_row_context");
        vi.unstubAllEnvs();
    });

    it("still attaches child-grain context when case attach is disabled", async () => {
        vi.stubEnv("ALLOY_QUEUE_ROW_CONTEXT_DISABLED", "");
        const { attachOpportunityQueueRowsWithRowContext } = await import(
            "@/lib/workUnits/attachQueueRowContextToItems"
        );
        const rows = attachOpportunityQueueRowsWithRowContext(
            [
                {
                    id: enrollmentOffersChildQueueRowId("opp-1", "ocm-1"),
                    opportunity_id: "opp-1",
                    opportunity_customer_member_id: "ocm-1",
                    row_grain: "child",
                    name: "Smith Household",
                    _child_display_name: "Riley",
                    child_lifecycle_status: "offer_pending",
                    _child_lifecycle_grain_row: {
                        opportunity_customer_member_id: "ocm-1",
                        opportunity_id: "opp-1",
                        child_display_name: "Riley",
                        child_lifecycle_status: "offer_pending",
                    },
                },
            ],
            {
                entityType: "opportunity",
                requestedQueueKey: "waitlist",
                executableQueueKey: "waitlist",
                queueLabel: "Waitlist",
                normalized: {
                    version: 2,
                    entity_type: "opportunity",
                    queues: [{ key: "waitlist", label: "Waitlist", grain: "child" }],
                } as never,
            },
            { attachCaseGrainRowContext: false }
        );
        expect(rows[0]?._queue_row_context).toBeDefined();
        vi.unstubAllEnvs();
    });
});

describe("queue row preview rendering without _queue_row_context", () => {
    it("layout runtime record still exposes identity, status, and contact from enriched row fields", async () => {
        const { buildOpportunityQueueRowRecordFromPreview } = await import(
            "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview"
        );
        const { buildLeadQueueDefaultDoc } = await import("@/lib/layout/defaultLeadLayouts");

        const item = {
            id: "opp-1",
            title: "Nguyen Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Nguyen Family",
                contactDisplayName: "Mai Nguyen",
                contactPhoneDisplay: "(503) 555-0199",
                contactEmail: "mai@example.com",
                childName: "Sam Nguyen",
                programContext: "Preschool",
                statusLabel: "Qualification",
                stageLabel: "Qualification",
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: "Follow up",
                familyNote: null,
                tourContext: null,
                locationContext: "Main Campus",
                childrenLines: [],
            },
            metaLines: [],
            _primary_contact_line: "Mai Nguyen",
            _primary_phone: "(503) 555-0199",
            _primary_email: "mai@example.com",
            _status_display: "Qualification",
            _location_label: "Main Campus",
            _child_display_name: "Sam Nguyen",
            _requested_program: "Preschool",
            _attention_reason_label: "Follow up",
            _inquiry_children: [
                {
                    display_name: "Sam Nguyen",
                    desired_program_label: "Preschool",
                    location_label: "Main Campus",
                },
            ],
        };

        const record = buildOpportunityQueueRowRecordFromPreview(item, buildLeadQueueDefaultDoc());
        expect(record["customer.display_name"]).toBe("Nguyen Family");
        expect(record["opportunity.status_label"]).toBe("Qualification");
        expect(record["person.primary_contact_name"]).toBe("Mai Nguyen");
        expect(record._queue_row_context).toBeUndefined();
        expect(Array.isArray(record.children) && record.children.length).toBeGreaterThan(0);
    });
});
