import { describe, expect, it } from "vitest";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

describe("buildOpportunityQueueRowRecordFromPreview person link ids", () => {
    it("projects primary person id for queue adornment open_drawer", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Mitchell Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Family",
                childName: null,
                contactDisplayName: "Jordan Mitchell",
                contactPersonId: "person-parent-1",
                contactPhoneDisplay: "(555) 010-2244",
                contactEmail: "jordan@example.com",
                programContext: null,
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [{ primary: "Jim Pat", personId: "child-1" }],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record["opportunity.primary_person_id"]).toBe("person-parent-1");
        expect(record["person.id"]).toBe("person-parent-1");
        expect((record.children as Array<Record<string, unknown>>)[0]?.["child.id"]).toBe("child-1");
    });

    it("backfills child person_id from primaryChildPersonId when structured lines lack personId", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Mitchell Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Family",
                childName: null,
                contactDisplayName: "Jordan Mitchell",
                contactPersonId: "person-parent-1",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: null,
            },
            layoutRuntimeEnrichment: {
                crmCompactChildren: [{ primary: "Jim Pat" }],
                primaryChildPersonId: "child-person-1",
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const child = (record.children as Array<Record<string, unknown>>)[0];
        expect(child?.person_id).toBe("child-person-1");
        expect(child?.["child.id"]).toBe("child-person-1");
    });

    it("backfills person_id on name-only childrenLines from inquiryChildren enrichment", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Mitchell Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Family",
                childName: null,
                contactDisplayName: "Jordan Mitchell",
                contactPersonId: "person-parent-1",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Qualified",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [{ primary: "Jim Pat" }],
            },
            layoutRuntimeEnrichment: {
                inquiryChildren: [
                    {
                        id: "inq-jim",
                        person_id: "person-jim",
                        customer_member_id: "cm-1",
                        display_name: "Jim Pat",
                        first_name: "Jim",
                        last_name: "Pat",
                    },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const child = (record.children as Array<Record<string, unknown>>)[0];
        expect(child?.person_id).toBe("person-jim");
        expect(child?.["child.id"]).toBe("person-jim");
        expect(child?._layout_runtime_child_mapper_source).toBe("row.person_id");
        expect(child?._layout_runtime_child_collection_key).toBe("children");
    });

    it("merges person_id from crmCompactChildren onto name-only childrenLines", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-2",
            title: "Lee Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Lee Family",
                childName: null,
                contactDisplayName: null,
                contactPersonId: null,
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: null,
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [{ primary: "Sam Lee" }],
            },
            layoutRuntimeEnrichment: {
                crmCompactChildren: [{ primary: "Sam Lee", personId: "person-sam" }],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const child = (record.children as Array<Record<string, unknown>>)[0];
        expect(child?.person_id).toBe("person-sam");
        expect(child?.["child.id"]).toBe("person-sam");
    });

    it("maps customer_member_id from structured crm compact children", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-2",
            title: "Lee Family",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Lee Family",
                childName: null,
                contactDisplayName: null,
                contactPersonId: null,
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: null,
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: null,
            },
            layoutRuntimeEnrichment: {
                crmCompactChildren: [{ primary: "Sam Lee", customer_member_id: "cm-9" }],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const child = (record.children as Array<Record<string, unknown>>)[0];
        expect(child?.customer_member_id).toBe("cm-9");
        expect(child?.["child.name"]).toBe("Sam Lee");
    });

    it("preserves UUID person and child ids (pickDisplay must not strip entity ids)", () => {
        const parentUuid = "a1111111-1111-4111-8111-111111111111";
        const childUuid = "b2222222-2222-4222-8222-222222222222";
        const item: QueuePreviewItemVm = {
            id: "opp-uuid",
            title: "Mitchell Household",
            relatedPersonId: parentUuid,
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Household",
                childName: null,
                contactDisplayName: "Kev Mitchell",
                contactPersonId: parentUuid,
                contactPhoneDisplay: "(503) 555-4729",
                contactEmail: "kevin.mitchell+46@testmail.local",
                programContext: null,
                statusLabel: "Contact Attempted",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [{ primary: "Alex Kelly (6m)", personId: childUuid }],
            },
            layoutRuntimeEnrichment: {
                primaryPersonId: parentUuid,
                crmCompactChildren: [{ primary: "Alex Kelly (6m)", personId: childUuid }],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record["opportunity.primary_person_id"]).toBe(parentUuid);
        expect(record._primary_person_id).toBe(parentUuid);
        const child = (record.children as Array<Record<string, unknown>>)[0];
        expect(child?.person_id).toBe(childUuid);
        expect(child?.["child.id"]).toBe(childUuid);
    });

    it("backfills primary person id from enrichment when row_preview gates omit contactPersonId", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-mitchell",
            title: "Mitchell Household",
            relatedPersonId: "person-kev",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Household",
                childName: null,
                contactDisplayName: null,
                contactPersonId: null,
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Contact Attempted",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [{ primary: "Alex Kelly" }, { primary: "Sam Kelly" }],
            },
            layoutRuntimeEnrichment: {
                contactLine: "Kev Mitchell · (555) 010-2244",
                primaryPersonId: "person-kev",
                inquiryChildren: [
                    {
                        person_id: "person-alex",
                        display_name: "Alex Kelly",
                        first_name: "Alex",
                        last_name: "Kelly",
                    },
                    {
                        person_id: "person-sam",
                        display_name: "Sam Kelly",
                        first_name: "Sam",
                        last_name: "Kelly",
                    },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record["person.primary_contact_name"]).toBe("Kev Mitchell");
        expect(record["opportunity.primary_person_id"]).toBe("person-kev");
        expect(record._primary_person_id).toBe("person-kev");
        const children = record.children as Array<Record<string, unknown>>;
        expect(children[0]?.person_id).toBe("person-alex");
        expect(children[1]?.person_id).toBe("person-sam");
    });

    it("projects inquiry summary tasks from layout runtime enrichment", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-tasks",
            title: "Mitchell household",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell household",
                childName: null,
                contactDisplayName: "Kev Mitchell",
                contactPersonId: "person-mitchell",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Contact Attempted",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
            },
            layoutRuntimeEnrichment: {
                inquirySummaryTasks: {
                    state: "loaded",
                    open_count: 1,
                    open_tasks: [
                        {
                            id: "task-1",
                            title: "Call family",
                            due_at: "2026-06-10T12:00:00Z",
                            status: "open",
                            source: "manual",
                        },
                    ],
                },
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record._inquiry_summary_tasks).toEqual(item.layoutRuntimeEnrichment?.inquirySummaryTasks);
    });

    it("does not let Family inquiry boilerplate context overwrite enriched household name", () => {
        const item = {
            id: "opp-mitchell",
            title: "Mitchell Household",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Mitchell Household",
                childName: null,
                contactDisplayName: "Kev Mitchell",
                contactPersonId: "person-kev",
                contactPhoneDisplay: null,
                contactEmail: null,
                programContext: null,
                statusLabel: "Contact Attempted",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
                tourContext: null,
                locationContext: null,
                childrenLines: [{ primary: "Alex Kelly", personId: "person-alex" }],
            },
            layoutRuntimeEnrichment: {
                customerName: "Mitchell Household",
            },
            _queue_row_context: {
                contract_version: 1,
                row_status_key: "contact_attempted",
                presentation: {
                    primary_label: "Family inquiry — Mitchell / South Campus",
                    status_label: "Contact Attempted",
                },
            },
        } as QueuePreviewItemVm & { _queue_row_context: Record<string, unknown> };

        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record.name).toBe("Mitchell Household");
        expect(record["customer.display_name"]).toBe("Mitchell Household");
        expect(String(record.name)).not.toMatch(/^Family inquiry/i);
    });
});
