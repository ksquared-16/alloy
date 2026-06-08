/**
 * Preview/runtime drawer body parity — default lead drawer LayoutDoc.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutPreviewRenderer from "@/components/layout/LayoutPreviewRenderer";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { LAYOUT_DRAWER_SPARSE_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";

const SECTION_TITLES = ["Lead Summary", "Lead Children", "Lead Source", "Notes / Recent Communication"];

/** Field labels visible when secondary contact is absent (visibleWhen exists fails). */
const VISIBLE_FIELD_LABELS = [
    "Full name",
    "Email",
    "Phone",
    "Tour date",
    "Tour status",
    "Source",
    "Channel",
    "Campaign",
];

const WIDGET_LABELS = ["Tasks", "Reminders", "Actions", "Recent communication", "Notes"];

describe("layout preview/runtime drawer parity", () => {
    it("settings preview and sparse runtime share section titles and configured labels", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const previewHtml = renderToStaticMarkup(<LayoutPreviewRenderer doc={doc} />);
        const runtimeHtml = renderToStaticMarkup(
            <LayoutRuntimeDrawerBodyView doc={doc} record={LAYOUT_DRAWER_SPARSE_RECORD} />,
        );

        for (const title of SECTION_TITLES) {
            expect(previewHtml).toContain(title);
            expect(runtimeHtml).toContain(title);
        }

        for (const label of VISIBLE_FIELD_LABELS) {
            expect(previewHtml).toContain(label);
            expect(runtimeHtml).toContain(label);
        }

        for (const widget of WIDGET_LABELS) {
            expect(previewHtml).toContain(widget);
            expect(runtimeHtml).toContain(widget);
        }
    });

    it("hides secondary contact when visibleWhen exists fails on sparse record", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = { ...LAYOUT_DRAWER_SPARSE_RECORD, "person.secondary_contact_name": "" };
        expect(evaluateLayoutCondition(record, { type: "exists", path: "person.secondary_contact_name" })).toBe(false);

        const html = renderToStaticMarkup(<LayoutRuntimeDrawerBodyView doc={doc} record={record} />);
        expect(html).not.toContain("Secondary contact");
    });

    it("runtime renders placeholders for blank values without VM fallback", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const html = renderToStaticMarkup(
            <LayoutRuntimeDrawerBodyView doc={doc} record={LAYOUT_DRAWER_SPARSE_RECORD} />,
        );
        expect(html).toContain("—");
        expect(html.toLowerCase()).toMatch(/no tasks yet/);
        expect(html.toLowerCase()).toMatch(/no notes yet/);
    });
});
