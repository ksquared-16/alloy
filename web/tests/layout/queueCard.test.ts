/**
 * Layout V2 — work-unit queue card: zone vocabulary + default doc structure.
 *
 * Verifies the queue default carries `renderAs: "work_unit_card"`, places items
 * into the bounded card zones (header/body/actions), uses a computed household
 * title, the location LABEL (not id), pill status, repeated children, a tour
 * row, and the simulated action stack — the contract the proof renderer reads.
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { LAYOUT_QUEUE_ZONES, isLayoutQueueZone, type LayoutDoc, type LayoutItem } from "@/lib/layout/layoutV2";

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
const zoneOf = (it?: LayoutItem) => (it?.metadata as { zone?: string } | undefined)?.zone;

describe("queue card zone vocabulary", () => {
    it("is a bounded, closed set", () => {
        expect(LAYOUT_QUEUE_ZONES).toContain("header.title");
        expect(LAYOUT_QUEUE_ZONES).toContain("body.children");
        expect(LAYOUT_QUEUE_ZONES).toContain("actions.stack");
        expect(isLayoutQueueZone("header.title")).toBe(true);
        expect(isLayoutQueueZone("nope")).toBe(false);
    });
});

describe("lead queue card default", () => {
    const doc = buildLeadQueueDefaultDoc();
    const items = allItems(doc);

    it("validates and is a work_unit_card", () => {
        expect(parseLayoutDoc(doc).ok).toBe(true);
        expect(doc.metadata?.renderAs).toBe("work_unit_card");
    });

    it("places a computed household title with a house icon in header.title", () => {
        const title = items.find((i) => i.template === "{last_name} Household");
        expect(title?.adornment?.icon).toBe("home");
        expect(zoneOf(title)).toBe("header.title");
    });

    it("status renders as a pill in header.status", () => {
        const status = items.find((i) => i.refKey === "opportunity.status_key");
        expect(status?.renderHint).toBe("status");
        expect(zoneOf(status)).toBe("header.status");
    });

    it("attention is conditional in header.attention", () => {
        const attn = items.find((i) => zoneOf(i) === "header.attention");
        expect(attn?.visibleWhen?.type).toBe("exists");
    });

    it("location uses the user-facing label ref (not location.id) in header.location", () => {
        const loc = items.find((i) => zoneOf(i) === "header.location");
        expect(loc?.refKey).toBe("opportunity.location");
        expect(loc?.refKey).not.toContain(".id");
    });

    it("contact row has name + phone + email in body.contact", () => {
        const contact = items.filter((i) => zoneOf(i) === "body.contact");
        const refs = contact.map((i) => i.refKey);
        expect(refs).toContain("person.primary_contact_name");
        expect(refs).toContain("person.primary_phone");
        expect(refs).toContain("person.primary_email");
    });

    it("children render as repeated rows (one per child) in body.children", () => {
        const children = items.find((i) => zoneOf(i) === "body.children");
        expect(children?.kind).toBe("related_list");
        expect(children?.displayMode).toBe("rows");
        expect((children?.columns ?? []).length).toBeGreaterThanOrEqual(3);
        expect(children?.columns?.[0].refKey).toBe("child.name");
    });

    it("has a tour row in body.tour", () => {
        const tour = items.find((i) => zoneOf(i) === "body.tour");
        expect(tour?.refKey).toBe("opportunity.tour_date");
    });

    it("reserves an action stack: Open / Message / Update Status / Ask BOS", () => {
        const actions = items.find((i) => zoneOf(i) === "actions.stack");
        expect((actions?.metadata as { actions?: string[] } | undefined)?.actions).toEqual([
            "Open",
            "Message",
            "Update Status",
            "Ask BOS",
        ]);
    });

    it("every item carries a valid bounded zone", () => {
        for (const it of items) {
            const z = zoneOf(it);
            if (z) expect(isLayoutQueueZone(z)).toBe(true);
        }
    });
});
