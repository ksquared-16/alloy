/**
 * Layout Builder V1 — doc ops, default Lead layouts, catalog, conditions.
 */

import { describe, expect, it } from "vitest";
import * as ops from "@/lib/layout/builderOps";
import { buildLeadDefaultDoc, buildLeadDrawerDefaultDoc, buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { CURATED_FIELDS, LAYOUT_ENTITY_GROUPS, LAYOUT_WIDGET_CATALOG, parseRefKey, makeRefKey } from "@/lib/layout/fieldCatalog";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

function blankDoc(): LayoutDoc {
    return { formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [] };
}

describe("builderOps", () => {
    it("columnWidths maps 1/2/3 to 12 / 6,6 / 4,4,4", () => {
        expect(ops.columnWidths(1)).toEqual([12]);
        expect(ops.columnWidths(2)).toEqual([6, 6]);
        expect(ops.columnWidths(3)).toEqual([4, 4, 4]);
        expect(ops.columnWidths(9)).toEqual([4, 4, 4]); // clamp
    });

    it("adds a section with one 2-column row", () => {
        const d = ops.addSection(blankDoc());
        expect(d.sections).toHaveLength(1);
        expect(d.sections[0].rows[0].columns).toHaveLength(2);
    });

    it("adds/removes items and validates", () => {
        let d = ops.addSection(blankDoc());
        const f = ops.makeFieldItem("person.primary_phone", "Phone", "phone", "person");
        d = ops.addItem(d, 0, 0, 0, f);
        expect(d.sections[0].rows[0].columns[0].items).toHaveLength(1);
        const res = parseLayoutDoc(d);
        expect(res.ok, res.errors.join("; ")).toBe(true);
        d = ops.removeItem(d, 0, 0, 0, f.id);
        expect(d.sections[0].rows[0].columns[0].items).toHaveLength(0);
    });

    it("setRowColumnCount redistributes items contiguously", () => {
        let d = ops.addSection(blankDoc()); // 2 cols
        d = ops.addItem(d, 0, 0, 0, ops.makeFieldItem("opportunity.a", "A", "text"));
        d = ops.addItem(d, 0, 0, 0, ops.makeFieldItem("opportunity.b", "B", "text"));
        d = ops.addItem(d, 0, 0, 1, ops.makeFieldItem("opportunity.c", "C", "text"));
        d = ops.setRowColumnCount(d, 0, 0, 1);
        expect(d.sections[0].rows[0].columns).toHaveLength(1);
        expect(d.sections[0].rows[0].columns[0].items.map((i) => i.refKey)).toEqual(["opportunity.a", "opportunity.b", "opportunity.c"]);
        d = ops.setRowColumnCount(d, 0, 0, 3);
        expect(d.sections[0].rows[0].columns).toHaveLength(3);
        // 3 items across 3 columns → one each, order preserved
        expect(d.sections[0].rows[0].columns.flatMap((c) => c.items.map((i) => i.refKey))).toEqual([
            "opportunity.a",
            "opportunity.b",
            "opportunity.c",
        ]);
    });

    it("moves items horizontally between columns", () => {
        let d = ops.addSection(blankDoc());
        const f = ops.makeFieldItem("opportunity.x", "X", "text");
        d = ops.addItem(d, 0, 0, 0, f);
        d = ops.moveItemHorizontal(d, 0, 0, 0, f.id, 1);
        expect(d.sections[0].rows[0].columns[0].items).toHaveLength(0);
        expect(d.sections[0].rows[0].columns[1].items[0].refKey).toBe("opportunity.x");
    });
});

describe("default Lead layouts", () => {
    it("drawer default has the four Lead sections and validates", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const res = parseLayoutDoc(doc);
        expect(res.ok, res.errors.join("; ")).toBe(true);
        expect(doc.sections.map((s) => s.key)).toEqual([
            "lead_summary",
            "children_inquiry",
            "lead_source",
            "notes_communication",
        ]);
        // widgets present
        const allItems = doc.sections.flatMap((s) => s.rows).flatMap((r) => r.columns).flatMap((c) => c.items);
        const widgetKeys = allItems.filter((i) => i.kind === "widget_placeholder").map((i) => i.refKey);
        expect(widgetKeys).toEqual(expect.arrayContaining(["tasks", "reminders", "actions", "recent_communication", "notes"]));
        // conditional secondary contact
        const cond = allItems.find((i) => i.refKey === "person.secondary_contact_name");
        expect(cond?.visibleWhen).toEqual({ type: "exists", path: "person.secondary_contact_name" });
        // namespaced refs
        expect(allItems.some((i) => i.refKey === "opportunity.tour_date")).toBe(true);
        // child fields live in the Lead Children related_list table columns
        const childTable = allItems.find((i) => i.kind === "related_list" && i.displayMode === "table");
        expect(childTable?.columns?.some((c) => c.refKey === "child.name")).toBe(true);
    });

    it("queue default is a card (multi-row) and validates", () => {
        const doc = buildLeadQueueDefaultDoc();
        expect(doc.surface).toBe("queue");
        const res = parseLayoutDoc(doc);
        expect(res.ok, res.errors.join("; ")).toBe(true);
        expect(doc.sections[0].rows.length).toBeGreaterThan(1); // card, not single table row
        expect(doc.metadata?.renderAs).toBe("card");
    });

    it("buildLeadDefaultDoc returns null for non-opportunities", () => {
        expect(buildLeadDefaultDoc("customers", "drawer")).toBeNull();
        expect(buildLeadDefaultDoc("opportunities", "drawer")).not.toBeNull();
    });
});

describe("field catalog", () => {
    it("exposes exactly the four V1 entity groups", () => {
        expect(LAYOUT_ENTITY_GROUPS.map((g) => g.entityKey)).toEqual(["opportunity", "person", "child", "child_inquiry"]);
    });
    it("widget catalog has the V1 widgets", () => {
        expect(LAYOUT_WIDGET_CATALOG.map((w) => w.widgetKey)).toEqual(
            expect.arrayContaining(["tasks", "reminders", "actions", "tour_summary", "recent_communication", "notes", "children_list"]),
        );
    });
    it("namespaces refKeys and parses them back", () => {
        expect(makeRefKey("person", "primary_phone")).toBe("person.primary_phone");
        expect(parseRefKey("person.primary_phone")).toEqual({ entityKey: "person", fieldKey: "primary_phone" });
        expect(parseRefKey("bare_key")).toEqual({ entityKey: "opportunity", fieldKey: "bare_key" });
    });
    it("curated fields exist for child + children inquiry (no field-def source)", () => {
        expect(CURATED_FIELDS.child.length).toBeGreaterThan(0);
        expect(CURATED_FIELDS.child_inquiry.length).toBeGreaterThan(0);
    });
});

describe("schema conditions", () => {
    const wrap = (item: Record<string, unknown>): LayoutDoc =>
        ({
            formatVersion: 1,
            surface: "drawer",
            entityType: "opportunities",
            sections: [{ id: "s", key: "k", title: "T", rows: [{ id: "r", columns: [{ id: "c", width: 12, items: [item] }] }] }],
        }) as unknown as LayoutDoc;

    it("accepts exists/equals conditions", () => {
        const ok = parseLayoutDoc(
            wrap({ id: "i", kind: "field", refKey: "opportunity.x", visibleWhen: { type: "exists", path: "person.secondary_contact" } }),
        );
        expect(ok.ok).toBe(true);
        expect(ok.doc!.sections[0].rows[0].columns[0].items[0].visibleWhen?.type).toBe("exists");
    });
    it("rejects equals without a value", () => {
        const bad = parseLayoutDoc(wrap({ id: "i", kind: "field", refKey: "x", visibleWhen: { type: "equals", path: "a" } }));
        expect(bad.ok).toBe(false);
        expect(bad.errors.join(" ")).toMatch(/equals/);
    });
    it("rejects an invalid condition type", () => {
        const bad = parseLayoutDoc(wrap({ id: "i", kind: "field", refKey: "x", visibleWhen: { type: "regex", path: "a" } }));
        expect(bad.ok).toBe(false);
        expect(bad.errors.join(" ")).toMatch(/invalid type/);
    });
});
