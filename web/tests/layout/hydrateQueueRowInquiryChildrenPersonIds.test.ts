import { describe, expect, it } from "vitest";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import {
    hydrateQueueRowInquiryChildrenPersonIds,
    parseOcmChildPersonLinesFromBatchRow,
} from "@/lib/layout/runtime/hydrateQueueRowInquiryChildrenPersonIds";
import { isQueueRecordLinkResolvable, resolveQueueRecordLinkTargetId } from "@/lib/layout/runtime/resolveQueueRecordLinkTargetId";
import { resolveRepeatedRelatedRows } from "@/lib/layout/runtime/queueRecordScopedResolve";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const childLinkField: QueueRecordFieldConfig = {
    id: "f-child",
    fieldKey: "child.name",
    display: "link",
    link: { target: "child_drawer", idFieldKey: "child.id" },
};

describe("hydrateQueueRowInquiryChildrenPersonIds", () => {
    it("merges OCM person_id onto metadata inquiry children by display name", () => {
        const hydrated = hydrateQueueRowInquiryChildrenPersonIds(
            [
                { display_name: "Mia Mitchell", dob: "2023-01-08" },
                { display_name: "Liam Mitchell", dob: "2024-05-07" },
            ],
            [
                {
                    personId: "person-mia",
                    customerMemberId: "cm-mia",
                    displayName: "Mia Mitchell",
                    dob: "2023-01-08",
                },
                {
                    personId: "person-liam",
                    customerMemberId: "cm-liam",
                    displayName: "Liam Mitchell",
                    dob: "2024-05-07",
                },
            ],
        );
        expect((hydrated[0] as Record<string, unknown>).person_id).toBe("person-mia");
        expect((hydrated[1] as Record<string, unknown>).person_id).toBe("person-liam");
    });

    it("parses nested customer_members from OCM batch rows", () => {
        const line = parseOcmChildPersonLinesFromBatchRow({
            customer_member_id: "cm-1",
            customer_members: {
                id: "cm-1",
                person_id: "person-1",
                first_name: "Mia",
                last_name: "Mitchell",
                dob: "2023-01-08",
            },
        });
        expect(line?.personId).toBe("person-1");
        expect(line?.displayName).toBe("Mia Mitchell");
    });

    it("builds resolvable Mitchell-style child links when enrichment lacks person_id on inquiry blocks", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-mitchell-live",
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
                childrenLines: [
                    { primary: "Mia Mitchell" },
                    { primary: "Liam Mitchell" },
                    { primary: "Sophia Mitchell" },
                ],
            },
            layoutRuntimeEnrichment: {
                primaryPersonId: "person-kev",
                inquiryChildren: [
                    { display_name: "Mia Mitchell", dob: "2023-01-08" },
                    { display_name: "Liam Mitchell", dob: "2024-05-07" },
                    { display_name: "Sophia Mitchell", dob: "2022-01-18" },
                ],
                crmCompactChildren: [
                    { primary: "Mia Mitchell", personId: "person-mia" },
                    { primary: "Liam Mitchell", personId: "person-liam" },
                    { primary: "Sophia Mitchell", personId: "person-sophia" },
                ],
            },
        };
        const record = buildOpportunityQueueRowRecordFromPreview(item);
        const childRows = resolveRepeatedRelatedRows("children", record);
        expect(childRows).toHaveLength(3);
        expect(resolveQueueRecordLinkTargetId(childLinkField, childRows[0]!, record)).toBe("person-mia");
        expect(resolveQueueRecordLinkTargetId(childLinkField, childRows[1]!, record)).toBe("person-liam");
        expect(resolveQueueRecordLinkTargetId(childLinkField, childRows[2]!, record)).toBe("person-sophia");
        expect(isQueueRecordLinkResolvable(childLinkField, childRows[0]!, record)).toBe(true);
    });
});
