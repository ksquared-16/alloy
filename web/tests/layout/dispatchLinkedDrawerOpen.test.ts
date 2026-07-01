import { describe, expect, it, vi } from "vitest";
import { dispatchLinkedDrawerOpen } from "@/lib/layout/runtime/dispatchLinkedDrawerOpen";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";

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

function mockEvent() {
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    };
}

describe("dispatchLinkedDrawerOpen", () => {
    it("opens opportunity drawer once and isolates click", () => {
        const onOpenOpportunity = vi.fn();
        const event = mockEvent();
        const ok = dispatchLinkedDrawerOpen({
            target: "opportunity_drawer",
            source: "queue_record",
            event,
            onOpenOpportunity,
        });
        expect(ok).toBe(true);
        expect(onOpenOpportunity).toHaveBeenCalledTimes(1);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it("opens person drawer with resolved id and does not require adornment dispatch", () => {
        const onOpenPerson = vi.fn();
        const event = mockEvent();
        const anchor = {
            id: "opp-1",
            "opportunity.id": "opp-1",
            "opportunity.primary_person_id": "person-9",
        };
        const ok = dispatchLinkedDrawerOpen({
            target: "person_drawer",
            source: "queue_record",
            event,
            handlers: { onOpenPerson, onOpenChild: vi.fn() },
            field: personField,
            record: anchor,
            anchorRecord: anchor,
        });
        expect(ok).toBe(true);
        expect(onOpenPerson).toHaveBeenCalledWith("person-9");
        expect(event.stopPropagation).toHaveBeenCalled();
    });

    it("opens child drawer from repeated row context", () => {
        const onOpenChild = vi.fn();
        const anchor = { id: "opp-1", "opportunity.id": "opp-1" };
        const childRow = {
            id: "person-child-alex",
            person_id: "person-child-alex",
            "child.id": "person-child-alex",
        };
        const ok = dispatchLinkedDrawerOpen({
            target: "child_drawer",
            source: "queue_record",
            handlers: { onOpenPerson: vi.fn(), onOpenChild },
            field: childField,
            record: childRow,
            anchorRecord: anchor,
        });
        expect(ok).toBe(true);
        expect(onOpenChild).toHaveBeenCalledWith("person-child-alex");
    });

    it("no-ops safely when person id is missing", () => {
        const onOpenPerson = vi.fn();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const anchor = { id: "opp-1", "opportunity.id": "opp-1" };
        const ok = dispatchLinkedDrawerOpen({
            target: "person_drawer",
            source: "queue_record",
            handlers: { onOpenPerson, onOpenChild: vi.fn() },
            field: personField,
            record: anchor,
            anchorRecord: anchor,
        });
        expect(ok).toBe(false);
        expect(onOpenPerson).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("no-ops safely when handlers are missing", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const ok = dispatchLinkedDrawerOpen({
            target: "person_drawer",
            id: "person-1",
            source: "queue_record",
        });
        expect(ok).toBe(false);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
