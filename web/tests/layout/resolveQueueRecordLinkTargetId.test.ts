import { describe, expect, it } from "vitest";
import { resolveQueueRecordLinkTargetId } from "@/lib/layout/runtime/resolveQueueRecordLinkTargetId";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";

describe("resolveQueueRecordLinkTargetId", () => {
    it("resolves opportunity id from anchor record", () => {
        const field: QueueRecordFieldConfig = {
            id: "f1",
            fieldKey: "customer.display_name",
            display: "link",
            link: { target: "opportunity_drawer", idFieldKey: "opportunity.id" },
        };
        const anchor = { id: "opp-42", "opportunity.id": "opp-42" };
        expect(resolveQueueRecordLinkTargetId(field, anchor, anchor)).toBe("opp-42");
    });

    it("resolves primary person id from anchor record", () => {
        const field: QueueRecordFieldConfig = {
            id: "f2",
            fieldKey: "person.primary_contact_name",
            display: "link",
            link: { target: "person_drawer", idFieldKey: "opportunity.primary_person_id" },
        };
        const anchor = {
            id: "opp-1",
            "opportunity.id": "opp-1",
            "opportunity.primary_person_id": "person-parent",
        };
        expect(resolveQueueRecordLinkTargetId(field, anchor, anchor)).toBe("person-parent");
    });

    it("resolves child id from repeated row record", () => {
        const field: QueueRecordFieldConfig = {
            id: "f3",
            fieldKey: "child.name",
            display: "link",
            link: { target: "child_drawer", idFieldKey: "child.id" },
        };
        const anchor = { id: "opp-1", "opportunity.id": "opp-1" };
        const childRow = {
            id: "person-child-1",
            person_id: "person-child-1",
            "child.id": "person-child-1",
        };
        expect(resolveQueueRecordLinkTargetId(field, childRow, anchor)).toBe("person-child-1");
    });
});
