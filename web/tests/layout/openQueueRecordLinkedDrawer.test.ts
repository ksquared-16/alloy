import { describe, expect, it, vi } from "vitest";
import { openQueueRecordLinkedDrawer } from "@/lib/layout/runtime/openQueueRecordLinkedDrawer";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const personField: QueueRecordFieldConfig = {
    id: "f-person",
    fieldKey: "person.primary_contact_name",
    display: "link",
    link: { target: "person_drawer", idFieldKey: "opportunity.primary_person_id" },
};

const childField: QueueRecordFieldConfig = {
    id: "f-child",
    fieldKey: "child.name",
    display: "link",
    link: { target: "child_drawer", idFieldKey: "child.id" },
};

describe("openQueueRecordLinkedDrawer", () => {
    it("opens opportunity drawer via onOpenOpportunity", () => {
        const onOpenOpportunity = vi.fn();
        const ok = openQueueRecordLinkedDrawer({
            field: {
                id: "f-opp",
                fieldKey: "customer.display_name",
                display: "link",
                link: { target: "opportunity_drawer", idFieldKey: "opportunity.id" },
            },
            record: { id: "opp-1" },
            anchorRecord: { id: "opp-1", "opportunity.id": "opp-1" },
            onOpenOpportunity,
        });
        expect(ok).toBe(true);
        expect(onOpenOpportunity).toHaveBeenCalledTimes(1);
    });

    it("opens person drawer through queue handlers", () => {
        const onOpenPerson = vi.fn();
        const anchor: ProofRuntimeRecord = {
            id: "opp-1",
            "opportunity.id": "opp-1",
            "opportunity.primary_person_id": "person-9",
        };
        const ok = openQueueRecordLinkedDrawer({
            field: personField,
            record: anchor,
            anchorRecord: anchor,
            handlers: { onOpenPerson, onOpenChild: vi.fn() },
        });
        expect(ok).toBe(true);
        expect(onOpenPerson).toHaveBeenCalledWith("person-9");
    });

    it("opens child drawer from repeated row record", () => {
        const onOpenChild = vi.fn();
        const anchor: ProofRuntimeRecord = { id: "opp-1", "opportunity.id": "opp-1" };
        const childRow: ProofRuntimeRecord = {
            id: "person-child-alex",
            person_id: "person-child-alex",
            "child.id": "person-child-alex",
            "child.name": "Alex",
        };
        const ok = openQueueRecordLinkedDrawer({
            field: childField,
            record: childRow,
            anchorRecord: anchor,
            handlers: { onOpenPerson: vi.fn(), onOpenChild },
        });
        expect(ok).toBe(true);
        expect(onOpenChild).toHaveBeenCalledWith("person-child-alex");
    });

    it("treats related_record_drawer the same as child_drawer", () => {
        const onOpenChild = vi.fn();
        const anchor: ProofRuntimeRecord = { id: "opp-1", "opportunity.id": "opp-1" };
        const childRow: ProofRuntimeRecord = {
            id: "person-child-sam",
            person_id: "person-child-sam",
            "child.id": "person-child-sam",
        };
        const ok = openQueueRecordLinkedDrawer({
            field: {
                ...childField,
                link: { target: "related_record_drawer", idFieldKey: "child.id" },
            },
            record: childRow,
            anchorRecord: anchor,
            handlers: { onOpenPerson: vi.fn(), onOpenChild },
        });
        expect(ok).toBe(true);
        expect(onOpenChild).toHaveBeenCalledWith("person-child-sam");
    });
});
