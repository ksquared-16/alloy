/**
 * Layout V2 — controlled subgrid (column-in-column) + field replacement.
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import * as ops from "@/lib/layout/builderOps";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const wrap = (item: Record<string, unknown>): LayoutDoc =>
    ({
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        sections: [{ id: "s", key: "k", title: "T", rows: [{ id: "r", columns: [{ id: "c", width: 12, items: [item] }] }] }],
    }) as unknown as LayoutDoc;

describe("field_group subgrid (column-in-column)", () => {
    it("accepts a field_group with rows → columns → field items", () => {
        const res = parseLayoutDoc(
            wrap({
                id: "g",
                kind: "field_group",
                refKey: "contact_block",
                label: "Contact",
                rows: [
                    { id: "gr0", columns: [{ id: "gr0c0", width: 12, items: [{ id: "f1", kind: "field", refKey: "person.primary_contact_name" }] }] },
                    {
                        id: "gr1",
                        columns: [
                            { id: "gr1c0", width: 6, items: [{ id: "f2", kind: "field", refKey: "person.primary_email" }] },
                            { id: "gr1c1", width: 6, items: [{ id: "f3", kind: "field", refKey: "person.primary_phone" }] },
                        ],
                    },
                ],
            }),
        );
        expect(res.ok, res.errors.join("; ")).toBe(true);
        const g = res.doc!.sections[0].rows[0].columns[0].items[0];
        expect(g.rows?.length).toBe(2);
        expect(g.rows?.[1].columns.length).toBe(2);
    });

    it("rejects a field_group nested inside a subgrid (no arbitrary nesting)", () => {
        const res = parseLayoutDoc(
            wrap({
                id: "g",
                kind: "field_group",
                refKey: "c",
                rows: [{ id: "gr0", columns: [{ id: "gr0c0", width: 12, items: [{ id: "g2", kind: "field_group", refKey: "nested", items: [] }] }] }],
            }),
        );
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/nested field_group/);
    });

    it("default Lead Summary has a contact block subgrid in Household & Primary Contact", () => {
        const doc = buildLeadDrawerDefaultDoc();
        expect(parseLayoutDoc(doc).ok).toBe(true);
        const household = doc.sections.find((s) => s.key === "household_contact")!;
        const block = household.rows
            .flatMap((r) => r.columns)
            .flatMap((c) => c.items)
            .find((i) => i.kind === "field_group" && Array.isArray(i.rows));
        expect(block).toBeTruthy();
        expect(block!.rows?.length).toBe(2);
        expect(block!.rows?.[0].columns.length).toBe(1);
        expect(block!.rows?.[1].columns.length).toBe(2);
        const refKeys = block!.rows!.flatMap((r) => r.columns).flatMap((c) => c.items).map((i) => i.refKey);
        expect(refKeys).toEqual(["person.primary_contact_name", "person.primary_email", "person.primary_phone"]);
    });
});

describe("group subgrid builder ops", () => {
    function base(): LayoutDoc {
        let d: LayoutDoc = { formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [] };
        d = ops.addSection(d);
        return d;
    }

    it("addGroup adds a field_group with one 2-column subgrid row; doc validates", () => {
        const d = ops.addGroup(base(), 0, 0, 0);
        const grp = d.sections[0].rows[0].columns[0].items.find((i) => i.kind === "field_group")!;
        expect(grp.rows?.length).toBe(1);
        expect(grp.rows?.[0].columns.length).toBe(2);
        expect(parseLayoutDoc(d).ok).toBe(true);
    });

    it("supports add row / set column count / add + replace + move + remove inside the block", () => {
        let d = ops.addGroup(base(), 0, 0, 0);
        const grpId = d.sections[0].rows[0].columns[0].items.find((i) => i.kind === "field_group")!.id;
        const loc = { sIdx: 0, rIdx: 0, cIdx: 0, itemId: grpId };

        // row 0 → 2 cols already; add a first-name | last-name pair
        const fn = ops.makeFieldItem("person.first_name", "First name", "text", "person");
        const ln = ops.makeFieldItem("person.last_name", "Last name", "text", "person");
        d = ops.groupAddItem(d, loc, 0, 0, fn);
        d = ops.groupAddItem(d, loc, 0, 1, ln);

        // add a second row (email|phone)
        d = ops.groupAddRow(d, loc, 2);
        d = ops.groupAddItem(d, loc, 1, 0, ops.makeFieldItem("person.primary_email", "Email", "text", "person"));
        d = ops.groupAddItem(d, loc, 1, 1, ops.makeFieldItem("person.primary_phone", "Phone", "phone", "person"));

        let grp = d.sections[0].rows[0].columns[0].items.find((i) => i.id === grpId)!;
        expect(grp.rows?.length).toBe(2);
        expect(parseLayoutDoc(d).ok, parseLayoutDoc(d).errors.join("; ")).toBe(true);

        // replace first name → full name, preserving id
        d = ops.groupPatchItem(d, loc, 0, 0, fn.id, { refKey: "person.full_name", label: "Full name" });
        grp = d.sections[0].rows[0].columns[0].items.find((i) => i.id === grpId)!;
        expect(grp.rows?.[0].columns[0].items[0].id).toBe(fn.id);
        expect(grp.rows?.[0].columns[0].items[0].refKey).toBe("person.full_name");

        // set row 0 to 1 column (merges)
        d = ops.groupSetRowColumnCount(d, loc, 0, 1);
        grp = d.sections[0].rows[0].columns[0].items.find((i) => i.id === grpId)!;
        expect(grp.rows?.[0].columns.length).toBe(1);
        expect(grp.rows?.[0].columns[0].items.length).toBe(2);

        // remove an item
        d = ops.groupRemoveItem(d, loc, 1, 1, grp.rows![1].columns[1].items[0].id);
        grp = d.sections[0].rows[0].columns[0].items.find((i) => i.id === grpId)!;
        expect(grp.rows?.[1].columns[1].items.length).toBe(0);
        expect(parseLayoutDoc(d).ok).toBe(true);
    });
});

describe("field replacement preserves placement metadata (patchItem)", () => {
    it("changes refKey/label/renderHint but keeps id, condition, adornment, editable", () => {
        let d: LayoutDoc = { formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [] };
        d = ops.addSection(d);
        const item = ops.makeFieldItem("person.primary_email", "Email", "text", "person");
        item.visibleWhen = { type: "exists", path: "person.primary_email" };
        item.adornment = { position: "left", icon: "person", action: { type: "open_drawer", entity: "person" } };
        item.editable = true;
        d = ops.addItem(d, 0, 0, 0, item);

        // replace Email → Phone
        d = ops.patchItem(d, 0, 0, 0, item.id, { refKey: "person.primary_phone", label: "Phone", renderHint: "phone" });
        const after = d.sections[0].rows[0].columns[0].items[0];
        expect(after.id).toBe(item.id); // placement identity preserved
        expect(after.refKey).toBe("person.primary_phone");
        expect(after.label).toBe("Phone");
        expect(after.renderHint).toBe("phone");
        expect(after.visibleWhen).toEqual({ type: "exists", path: "person.primary_email" }); // preserved
        expect(after.adornment?.icon).toBe("person"); // preserved
        expect(after.editable).toBe(true); // preserved
    });
});
