/**
 * Layout V2 — related_list collection-table (Lead Children) schema + default.
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const wrap = (item: Record<string, unknown>): LayoutDoc =>
    ({
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        sections: [{ id: "s", key: "k", title: "T", rows: [{ id: "r", columns: [{ id: "c", width: 12, items: [item] }] }] }],
    }) as unknown as LayoutDoc;

function allItems(doc: LayoutDoc) {
    return doc.sections.flatMap((s) => s.rows).flatMap((r) => r.columns).flatMap((c) => c.items);
}

describe("related_list collection table schema", () => {
    it("accepts a table with source + columns (incl. adornment)", () => {
        const res = parseLayoutDoc(
            wrap({
                id: "i",
                kind: "related_list",
                refKey: "children",
                label: "Lead children",
                source: "children",
                displayMode: "table",
                related: { entityType: "child" },
                columns: [
                    { label: "Child", refKey: "child.name", width: "medium", adornment: { icon: "child", action: { type: "open_drawer", entity: "child", idPath: "child.id" } } },
                    { label: "Status", refKey: "child.status", width: "small", renderHint: "status" },
                ],
            }),
        );
        expect(res.ok, res.errors.join("; ")).toBe(true);
        const item = allItems(res.doc!)[0];
        expect(item.displayMode).toBe("table");
        expect(item.source).toBe("children");
        expect(item.columns?.length).toBe(2);
        expect(item.columns?.[0].adornment?.action?.entity).toBe("child");
        expect(item.columns?.[1].width).toBe("small");
    });

    it("drops an invalid column width but keeps the column", () => {
        const res = parseLayoutDoc(
            wrap({ id: "i", kind: "related_list", refKey: "children", displayMode: "table", columns: [{ label: "X", refKey: "child.x", width: "huge" }] }),
        );
        expect(res.ok).toBe(true);
        expect(allItems(res.doc!)[0].columns?.[0].width).toBeUndefined();
    });

    it("rejects a column without refKey", () => {
        const res = parseLayoutDoc(
            wrap({ id: "i", kind: "related_list", refKey: "children", displayMode: "table", columns: [{ label: "No ref" }] }),
        );
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/refKey/);
    });
});

describe("default Lead drawer — Children & Enrollment table", () => {
    it("models children as a related_list table with enrollment-context columns", () => {
        const doc = buildLeadDrawerDefaultDoc();
        expect(parseLayoutDoc(doc).ok).toBe(true);
        const table = allItems(doc).find((i) => i.kind === "related_list" && i.displayMode === "table");
        expect(table).toBeTruthy();
        expect(table!.source).toBe("children");
        expect(table!.columns?.map((c) => c.refKey)).toEqual([
            "child.name",
            "child.dob_age",
            "child.program",
            "child.start_date",
            "child.schedule",
            "child.room",
            "child.location",
            "child.status",
        ]);
        // The child column carries its icon; the retired `open_drawer` action is gone from the
        // platform default — nothing renders it on an operator surface.
        expect(table!.columns?.[0].adornment?.icon).toBe("child");
        expect(table!.columns?.[0].adornment?.action).toBeUndefined();
        expect(doc.sections.find((s) => s.key === "children_enrollment")?.title).toBe("Children & Enrollment");
    });
});
