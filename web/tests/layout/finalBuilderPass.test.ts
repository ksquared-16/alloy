/**
 * Layout V2 — Final Builder + Queue Layout Pass.
 *
 * Covers the sprint additions: display-text templates, flexible/width-behavior
 * and the new adornment icons in the schema; related-list column builder ops;
 * the computed household title + action stack in the queue card default; and the
 * user-facing Location field in the catalog.
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { resolveItemValue, resolveTemplate } from "@/lib/layout/resolveItemValue";
import * as ops from "@/lib/layout/builderOps";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { CURATED_FIELDS } from "@/lib/layout/fieldCatalog";
import {
    LAYOUT_ADORNMENT_ICONS,
    LAYOUT_COLUMN_WIDTHS,
    type LayoutDoc,
    type LayoutItem,
} from "@/lib/layout/layoutV2";

const wrap = (item: Record<string, unknown>): LayoutDoc =>
    ({
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        sections: [{ id: "s", key: "k", title: "T", rows: [{ id: "r", columns: [{ id: "c", width: 12, items: [item] }] }] }],
    }) as unknown as LayoutDoc;

function allItems(doc: LayoutDoc): LayoutItem[] {
    const out: LayoutItem[] = [];
    const walk = (items: LayoutItem[]) => {
        for (const it of items) {
            out.push(it);
            if (it.items) walk(it.items);
            if (it.rows) it.rows.forEach((r) => r.columns.forEach((c) => walk(c.items)));
        }
    };
    doc.sections.forEach((s) => s.rows.forEach((r) => r.columns.forEach((c) => walk(c.items))));
    return out;
}

describe("display-text templates", () => {
    it("resolveTemplate substitutes {tokens} and collapses gaps", () => {
        expect(resolveTemplate({ last_name: "Nguyen" }, "{last_name} Household")).toBe("Nguyen Household");
        // missing token → no double space, trimmed
        expect(resolveTemplate({}, "{last_name} Household")).toBe("Household");
        expect(resolveTemplate({ "person.primary_contact_name": "Jo Lee" }, "{person.primary_contact_name}")).toBe("Jo Lee");
    });

    it("resolveItemValue renders a template item", () => {
        const item: LayoutItem = { id: "t", kind: "field", refKey: "_template", template: "{last_name} Household", renderHint: "text" };
        const r = resolveItemValue({ last_name: "Park" }, item);
        expect(r.display).toBe("Park Household");
        expect(r.isPlaceholder).toBe(false);
    });

    it("makeTemplateItem produces a valid, parseable item", () => {
        const item = ops.makeTemplateItem("{last_name} Household", "Household");
        expect(item.template).toBe("{last_name} Household");
        expect(parseLayoutDoc(wrap(item as unknown as Record<string, unknown>)).ok).toBe(true);
    });
});

describe("schema: new icons, widths, template", () => {
    it("includes the house + contact icons", () => {
        expect(LAYOUT_ADORNMENT_ICONS).toContain("home");
        expect(LAYOUT_ADORNMENT_ICONS).toContain("location");
        expect(LAYOUT_ADORNMENT_ICONS).toContain("phone");
    });

    it("accepts flexible width on a collection column + widthBehavior", () => {
        expect(LAYOUT_COLUMN_WIDTHS).toContain("flexible");
        const res = parseLayoutDoc(
            wrap({
                id: "rl",
                kind: "related_list",
                refKey: "children",
                source: "children",
                displayMode: "rows",
                related: { entityType: "child" },
                columns: [
                    { label: "Child", refKey: "child.name", width: "flexible", widthBehavior: "flexible", template: "{child.name}" },
                    { label: "Status", refKey: "child.status", width: "small", renderHint: "badge", visibleWhen: { type: "exists", path: "child.status" } },
                ],
            }),
        );
        expect(res.ok, res.errors.join("; ")).toBe(true);
        const cols = allItems(res.doc!).find((i) => i.kind === "related_list")?.columns ?? [];
        expect(cols[0].width).toBe("flexible");
        expect(cols[0].template).toBe("{child.name}");
        expect(cols[1].renderHint).toBe("badge");
        expect(cols[1].visibleWhen?.type).toBe("exists");
    });
});

describe("related-list column builder ops", () => {
    const loc = { sIdx: 0, rIdx: 0, cIdx: 0, itemId: "rl" };
    const base = (): LayoutDoc =>
        wrap({ id: "rl", kind: "related_list", refKey: "children", source: "children", related: { entityType: "child" }, columns: [{ label: "A", refKey: "child.name" }] });

    it("adds, patches, moves, removes columns immutably", () => {
        let d = base();
        d = ops.relatedAddColumn(d, loc, { label: "B", refKey: "child.program", width: "medium" });
        let cols = (d.sections[0].rows[0].columns[0].items[0].columns) ?? [];
        expect(cols.map((c) => c.label)).toEqual(["A", "B"]);

        d = ops.relatedPatchColumn(d, loc, 1, { renderHint: "badge", width: "small" });
        cols = d.sections[0].rows[0].columns[0].items[0].columns!;
        expect(cols[1].renderHint).toBe("badge");

        d = ops.relatedMoveColumn(d, loc, 1, -1);
        cols = d.sections[0].rows[0].columns[0].items[0].columns!;
        expect(cols.map((c) => c.label)).toEqual(["B", "A"]);

        d = ops.relatedRemoveColumn(d, loc, 0);
        cols = d.sections[0].rows[0].columns[0].items[0].columns!;
        expect(cols.map((c) => c.label)).toEqual(["A"]);
    });
});

describe("queue card default", () => {
    it("has a computed household title, location label, status, children rows, action stack", () => {
        const doc = buildLeadQueueDefaultDoc();
        expect(parseLayoutDoc(doc).ok).toBe(true);
        const items = allItems(doc);

        const title = items.find((i) => i.template === "{last_name} Household");
        expect(title?.adornment?.icon).toBe("home");

        // location uses the user-facing ref (label), not location.id
        const loc = items.find((i) => i.refKey === "opportunity.location");
        expect(loc?.adornment?.icon).toBe("location");

        const status = items.find((i) => i.refKey === "opportunity.status_key");
        expect(status?.renderHint).toBe("status");

        const children = items.find((i) => i.kind === "related_list" && i.refKey === "children");
        expect(children?.displayMode).toBe("rows");
        expect((children?.columns ?? []).length).toBeGreaterThan(1);

        const actions = items.find((i) => i.refKey === "actions");
        expect((actions?.metadata as { actions?: string[] } | undefined)?.actions).toEqual(["Open", "Message", "Update Status", "Ask BOS"]);
    });
});

describe("field catalog", () => {
    it("exposes a user-facing Location field (label, not id)", () => {
        const loc = CURATED_FIELDS.opportunity.find((f) => f.fieldLabel === "Location");
        expect(loc?.refKey).toBe("opportunity.location");
    });
});
