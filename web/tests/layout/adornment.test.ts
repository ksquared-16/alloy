/**
 * Layout V1.1 — field action-icon adornment: schema validation, default
 * layout examples, and builder op.
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import * as ops from "@/lib/layout/builderOps";
import { buildLeadDrawerDefaultDoc, buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const wrapItem = (item: Record<string, unknown>): LayoutDoc =>
    ({
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        sections: [{ id: "s", key: "k", title: "T", rows: [{ id: "r", columns: [{ id: "c", width: 12, items: [item] }] }] }],
    }) as unknown as LayoutDoc;

function allItems(doc: LayoutDoc) {
    const out: import("@/lib/layout/layoutV2").LayoutItem[] = [];
    const walkItem = (it: import("@/lib/layout/layoutV2").LayoutItem) => {
        out.push(it);
        // recurse into field_group subgrid rows + flat items
        (it.rows ?? []).forEach((r) => r.columns.forEach((c) => c.items.forEach(walkItem)));
        (it.items ?? []).forEach(walkItem);
    };
    doc.sections.forEach((s) => s.rows.forEach((r) => r.columns.forEach((c) => c.items.forEach(walkItem))));
    return out;
}

describe("adornment schema", () => {
    it("accepts an icon-only adornment (defaults position to left)", () => {
        const res = parseLayoutDoc(wrapItem({ id: "i", kind: "field", refKey: "opportunity.tour_date", adornment: { icon: "calendar" } }));
        expect(res.ok, res.errors.join("; ")).toBe(true);
        const ad = allItems(res.doc!)[0].adornment!;
        expect(ad.icon).toBe("calendar");
        expect(ad.position).toBe("left");
        expect(ad.action).toBeUndefined();
    });

    it("accepts an open_drawer action with entity + idPath", () => {
        const res = parseLayoutDoc(
            wrapItem({
                id: "i",
                kind: "field",
                refKey: "person.primary_contact_name",
                adornment: { position: "right", icon: "person", action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" } },
            }),
        );
        expect(res.ok, res.errors.join("; ")).toBe(true);
        const ad = allItems(res.doc!)[0].adornment!;
        expect(ad).toEqual({ position: "right", icon: "person", action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" } });
    });

    it("rejects an invalid icon", () => {
        const res = parseLayoutDoc(wrapItem({ id: "i", kind: "field", refKey: "x", adornment: { icon: "rocket" } }));
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/invalid icon/);
    });

    it("rejects a non open_drawer action type", () => {
        const res = parseLayoutDoc(wrapItem({ id: "i", kind: "field", refKey: "x", adornment: { icon: "person", action: { type: "navigate", entity: "person" } } }));
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/open_drawer/);
    });

    it("rejects an invalid action entity", () => {
        const res = parseLayoutDoc(wrapItem({ id: "i", kind: "field", refKey: "x", adornment: { icon: "person", action: { type: "open_drawer", entity: "vendor" } } }));
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/invalid entity/);
    });
});

describe("default Lead layouts include adornment examples", () => {
    it("drawer: primary contact opens person, tour date is calendar icon, child opens child", () => {
        const items = allItems(buildLeadDrawerDefaultDoc());
        // The ICON stays; the `open_drawer` action does not. The platform defaults are ours, and
        // they stop teaching a value no runtime executes. Tenant layouts are not rewritten.
        const contact = items.find((i) => i.refKey === "person.primary_contact_name");
        expect(contact?.adornment?.icon).toBe("person");
        expect(contact?.adornment?.action).toBeUndefined();

        const secondary = items.find((i) => i.refKey === "person.secondary_contact_name");
        expect(secondary?.adornment?.icon).toBe("person");

        const tour = items.find((i) => i.refKey === "opportunity.tour_date");
        expect(tour?.adornment?.icon).toBe("calendar");
        expect(tour?.adornment?.action).toBeUndefined(); // icon only

        const childTable = items.find((i) => i.kind === "related_list" && i.displayMode === "table");
        const childColumn = childTable?.columns?.find((c) => c.refKey === "child.name");
        expect(childColumn?.adornment?.icon).toBe("child");
        expect(childColumn?.adornment?.action).toBeUndefined();
    });

    it("queue card: contact opens person, child opens child; still validates", () => {
        const doc = buildLeadQueueDefaultDoc();
        expect(parseLayoutDoc(doc).ok).toBe(true);
        const items = allItems(doc);
        expect(items.find((i) => i.refKey === "person.primary_contact_name")?.adornment?.icon).toBe("person");
        // children now live in a related_list (each child = one row); the column keeps its icon
        const childList = items.find((i) => i.kind === "related_list" && i.refKey === "children");
        const childColumn = childList?.columns?.find((c) => c.refKey === "child.name");
        expect(childColumn?.adornment?.icon).toBe("child");
        expect(childColumn?.adornment?.action).toBeUndefined();
        // household title is a computed display-text item with a house icon
        const title = items.find((i) => typeof i.template === "string" && i.template.includes("Household"));
        expect(title?.adornment?.icon).toBe("home");
    });
});

describe("setItemAdornment op", () => {
    it("sets and clears an adornment", () => {
        let d = ops.addSection({ formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [] });
        const f = ops.makeFieldItem("person.primary_phone", "Phone", "phone", "person");
        d = ops.addItem(d, 0, 0, 0, f);
        d = ops.setItemAdornment(d, 0, 0, 0, f.id, { position: "left", icon: "person", action: { type: "open_drawer", entity: "person" } });
        expect(d.sections[0].rows[0].columns[0].items[0].adornment?.icon).toBe("person");
        expect(parseLayoutDoc(d).ok).toBe(true);
        d = ops.setItemAdornment(d, 0, 0, 0, f.id, undefined);
        expect(d.sections[0].rows[0].columns[0].items[0].adornment).toBeUndefined();
    });
});
