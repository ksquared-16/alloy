import { describe, expect, it } from "vitest";
import { resolveQueueRowLinkQaLabel } from "@/lib/debug/queueRowLinkQa";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";

describe("queueRowLinkQa", () => {
    it("reports missing child id", () => {
        process.env.NEXT_PUBLIC_QUEUE_ROW_LINK_QA = "1";
        const field: QueueRecordFieldConfig = {
            id: "f1",
            fieldKey: "child.name",
            display: "link",
            link: { target: "child_drawer", idFieldKey: "child.id" },
        };
        const label = resolveQueueRowLinkQaLabel(
            field,
            { id: "child-row-0", "child.name": "Jim" },
            { id: "opp-1" },
        );
        expect(label).toBe("missing child id");
    });

    it("reports person id present", () => {
        const field: QueueRecordFieldConfig = {
            id: "f2",
            fieldKey: "person.primary_contact_name",
            display: "link",
            link: { target: "person_drawer", idFieldKey: "opportunity.primary_person_id" },
        };
        const label = resolveQueueRowLinkQaLabel(
            field,
            { "opportunity.primary_person_id": "person-1" },
            { id: "opp-1", "opportunity.primary_person_id": "person-1" },
        );
        expect(label).toBe("person id ✓");
    });
});
