import { describe, expect, it, vi } from "vitest";
import { dispatchLayoutRuntimeOpenDrawer } from "@/lib/layout/runtime/dispatchLayoutRuntimeOpenDrawer";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";

const item: LayoutItem = {
    id: "child-col",
    kind: "field",
    refKey: "child.first_name",
};

const childAdornment: LayoutFieldAdornment = {
    position: "left",
    icon: "person",
    action: { type: "open_drawer", entity: "child", idPath: "child.id" },
};

describe("dispatchLayoutRuntimeOpenDrawer", () => {
    it("opens child drawer via person id on repeater row", () => {
        const openDrawer = vi.fn();
        const result = dispatchLayoutRuntimeOpenDrawer({
            item,
            adornment: childAdornment,
            anchorRecord: { id: "opp-1" },
            rowRecord: { id: "row-1", "child.id": "person-child-9", "child.first_name": "Alex" },
            opportunityId: "opp-1",
            openDrawer,
        });
        expect(result).toEqual({
            ok: true,
            entity: "child",
            entityId: "person-child-9",
            route: "openViewPersonFromOpportunity:child",
        });
        expect(openDrawer).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "persons",
                id: "person-child-9",
            }),
        );
    });

    it("reports missing person id for person adornment", () => {
        const openDrawer = vi.fn();
        const result = dispatchLayoutRuntimeOpenDrawer({
            item: { ...item, refKey: "person.primary_contact_name" },
            adornment: {
                position: "left",
                icon: "person",
                action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" },
            },
            anchorRecord: { id: "opp-1", "opportunity.primary_person_id": "" },
            openDrawer,
        });
        expect(result).toEqual({ ok: false, step: "missing_entity_id", entity: "person" });
        expect(openDrawer).not.toHaveBeenCalled();
    });
});
