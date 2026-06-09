import { describe, expect, it, vi } from "vitest";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { openQueueRecordLinkedDrawer } from "@/lib/layout/runtime/openQueueRecordLinkedDrawer";
import {
    isQueueRecordLinkResolvable,
    resolveQueueRecordLinkTargetId,
} from "@/lib/layout/runtime/resolveQueueRecordLinkTargetId";
import { resolveRepeatedRelatedRows } from "@/lib/layout/runtime/queueRecordScopedResolve";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const personLinkField: QueueRecordFieldConfig = {
    id: "f-person",
    fieldKey: "person.primary_contact_name",
    display: "link",
    link: { target: "person_drawer", idFieldKey: "opportunity.primary_person_id" },
};

const childLinkField: QueueRecordFieldConfig = {
    id: "f-child",
    fieldKey: "child.name",
    display: "link",
    link: { target: "child_drawer", idFieldKey: "child.id" },
};

function nameOnlyChildItem(): QueuePreviewItemVm {
    return {
        id: "opp-hydrate",
        title: "Pat Family",
        quickActions: [],
        semanticCrmCompact: {
            primaryIdentity: "Pat Family",
            childName: null,
            contactDisplayName: "Jim Pat Sr",
            contactPersonId: "person-parent",
            contactPhoneDisplay: null,
            contactEmail: null,
            programContext: null,
            statusLabel: "New",
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
                    person_id: "person-jim-child",
                    customer_member_id: "cm-jim",
                    display_name: "Jim Pat",
                    first_name: "Jim",
                    last_name: "Pat",
                },
            ],
        },
    };
}

function mitchellStyleItem(): QueuePreviewItemVm {
    return {
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
            contactLine: "Kev Mitchell",
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
}

describe("queue child link id hydration", () => {
    it("resolves link targets for production UUID person and child ids", () => {
        const parentUuid = "c3333333-3333-4333-8333-333333333333";
        const childUuid = "d4444444-4444-4444-8444-444444444444";
        const item = mitchellStyleItem();
        item.relatedPersonId = parentUuid;
        item.semanticCrmCompact!.contactPersonId = parentUuid;
        item.semanticCrmCompact!.childrenLines = [{ primary: "Alex Kelly (6m)", personId: childUuid }];
        item.layoutRuntimeEnrichment = {
            contactLine: "Kev Mitchell",
            primaryPersonId: parentUuid,
            crmCompactChildren: [{ primary: "Alex Kelly (6m)", personId: childUuid }],
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const personRecord = { ...record, "person.id": record["opportunity.primary_person_id"] };
        expect(resolveQueueRecordLinkTargetId(personLinkField, personRecord, record)).toBe(parentUuid);
        const childRows = resolveRepeatedRelatedRows("children", record);
        expect(resolveQueueRecordLinkTargetId(childLinkField, childRows[0]!, record)).toBe(childUuid);
    });

    it("hydrates primary contact person id from enrichment when CRM gates omit contactPersonId", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(mitchellStyleItem());
        const personRecord = {
            ...record,
            "person.id": record["opportunity.primary_person_id"],
        };
        expect(resolveQueueRecordLinkTargetId(personLinkField, personRecord, record)).toBe("person-kev");
        expect(isQueueRecordLinkResolvable(personLinkField, personRecord, record)).toBe(true);
    });

    it("hydrates Mitchell-style child rows from inquiry enrichment for v3 repeated scope", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(mitchellStyleItem());
        const childRows = resolveRepeatedRelatedRows("children", record);
        expect(childRows).toHaveLength(2);
        expect(resolveQueueRecordLinkTargetId(childLinkField, childRows[0]!, record)).toBe("person-alex");
        expect(resolveQueueRecordLinkTargetId(childLinkField, childRows[1]!, record)).toBe("person-sam");
        expect(isQueueRecordLinkResolvable(childLinkField, childRows[0]!, record)).toBe(true);
    });

    it("treats customer_member_id-only child rows as resolvable without a person id", () => {
        const item = nameOnlyChildItem();
        delete item.layoutRuntimeEnrichment?.inquiryChildren;
        item.layoutRuntimeEnrichment = {
            crmCompactChildren: [{ primary: "Jim Pat", customer_member_id: "cm-jim" }],
        };
        item.semanticCrmCompact!.childrenLines = [{ primary: "Jim Pat" }];
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const childRows = resolveRepeatedRelatedRows("children", record);
        expect(resolveQueueRecordLinkTargetId(childLinkField, childRows[0]!, record)).toBeNull();
        expect(isQueueRecordLinkResolvable(childLinkField, childRows[0]!, record)).toBe(true);
    });

    it("hydrates child rows from name-only preview before link id resolution", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(nameOnlyChildItem());
        const childRows = resolveRepeatedRelatedRows("children", record);
        expect(childRows).toHaveLength(1);
        expect(childRows[0]?.person_id).toBe("person-jim-child");
        expect(childRows[0]?._layout_runtime_child_mapper_source).not.toBe("missing_all_ids");

        const resolvedId = resolveQueueRecordLinkTargetId(childLinkField, childRows[0]!, record);
        expect(resolvedId).toBe("person-jim-child");
    });

    it("opens child drawer when hydrated id is present", () => {
        const record = buildOpportunityQueueRowRecordFromPreview(nameOnlyChildItem());
        const childRows = resolveRepeatedRelatedRows("children", record);
        const onOpenChild = vi.fn();

        const ok = openQueueRecordLinkedDrawer({
            field: childLinkField,
            record: childRows[0]!,
            anchorRecord: record,
            handlers: { onOpenPerson: vi.fn(), onOpenChild },
        });
        expect(ok).toBe(true);
        expect(onOpenChild).toHaveBeenCalledWith("person-jim-child");
    });

    it("marks unresolvable child links as non-openable", () => {
        const item = nameOnlyChildItem();
        delete item.layoutRuntimeEnrichment;
        item.semanticCrmCompact!.childrenLines = [{ primary: "Jim Pat" }];
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const childRows = resolveRepeatedRelatedRows("children", record);
        expect(isQueueRecordLinkResolvable(childLinkField, childRows[0]!, record)).toBe(false);
    });

    it("no-ops safely when enrichment cannot resolve child id", () => {
        const item = nameOnlyChildItem();
        delete item.layoutRuntimeEnrichment;
        item.semanticCrmCompact!.childrenLines = [
            { primary: "Jim Pat" },
            { primary: "Sam Lee" },
        ];
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const childRows = resolveRepeatedRelatedRows("children", record);
        const onOpenChild = vi.fn();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const ok = openQueueRecordLinkedDrawer({
            field: childLinkField,
            record: childRows[0]!,
            anchorRecord: record,
            handlers: { onOpenPerson: vi.fn(), onOpenChild },
        });
        expect(ok).toBe(false);
        expect(onOpenChild).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
