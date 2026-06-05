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

    it("default Lead Summary has a contact block subgrid (full name; email|phone)", () => {
        const doc = buildLeadDrawerDefaultDoc();
        expect(parseLayoutDoc(doc).ok).toBe(true);
        const summary = doc.sections.find((s) => s.key === "lead_summary")!;
        const block = summary.rows
            .flatMap((r) => r.columns)
            .flatMap((c) => c.items)
            .find((i) => i.kind === "field_group" && Array.isArray(i.rows));
        expect(block).toBeTruthy();
        expect(block!.rows?.length).toBe(2);
        // row 1 = full name (1 col), row 2 = email|phone (2 cols)
        expect(block!.rows?.[0].columns.length).toBe(1);
        expect(block!.rows?.[1].columns.length).toBe(2);
        const refKeys = block!.rows!.flatMap((r) => r.columns).flatMap((c) => c.items).map((i) => i.refKey);
        expect(refKeys).toEqual(["person.primary_contact_name", "person.primary_email", "person.primary_phone"]);
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
