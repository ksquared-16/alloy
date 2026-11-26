import { describe, expect, it } from "vitest";

import {
    buildFocusPanelSummaryDefaultDoc,
    FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
} from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveFocusPanelGridFromLayoutDoc } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import {
    buildFocusPanelCardSection,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    readFocusPanelCardSectionMeta,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc } from "@/lib/layout/layoutV2";

describe("buildFocusPanelSummaryDefaultDoc", () => {
    it("encodes a drawer-surface doc keyed to focus_panel_summary", () => {
        const doc = buildFocusPanelSummaryDefaultDoc();
        expect(doc.formatVersion).toBe(LAYOUT_DOC_FORMAT_VERSION);
        expect(doc.surface).toBe("drawer");
        expect(doc.entityType).toBe("opportunities");
        expect(doc.metadata?.layoutKey).toBe(FOCUS_PANEL_SUMMARY_LAYOUT_KEY);
    });

    it("creates one section per default enrollment card seed (Visible + Linked)", () => {
        const doc = buildFocusPanelSummaryDefaultDoc();
        // 9 since Employment joined the composition (5 Visible + 3 Linked + Employment).
        expect(doc.sections).toHaveLength(9);
        for (const section of doc.sections) {
            expect(readFocusPanelCardSectionMeta(section)).not.toBeNull();
        }
    });

    it("seeds a half-width Current Work grid with stacked Household + Children on the right", async () => {
        const { readFocusPanelPublishedLayout } = await import(
            "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout"
        );
        const { focusPanelSummaryDefaultGridLayout } = await import(
            "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc"
        );
        const doc = buildFocusPanelSummaryDefaultDoc();
        const layout = readFocusPanelPublishedLayout(doc);
        expect(layout?.grid).toBeDefined();
        const grid = focusPanelSummaryDefaultGridLayout();
        const currentWork = grid.areas.find((a) => a.card === "current_work")!;
        const household = grid.areas.find((a) => a.card === "household")!;
        const children = grid.areas.find((a) => a.card === "children")!;
        expect(currentWork.colSpan).toBe(6);
        expect(household).toMatchObject({ colStart: 7, colSpan: 6, rowStart: 1 });
        expect(children.colStart).toBe(7);
        expect(children.rowStart).toBeGreaterThan(household.rowStart);
        expect(layout!.grid!.areas).toEqual(grid.areas);
    });
});

describe("deriveFocusPanelGridFromLayoutDoc", () => {
    it("places Visible default cards including Assignments (scheduling) on the published grid", async () => {
        const { focusPanelSummaryDefaultGridLayout } = await import(
            "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc"
        );
        const { deriveFocusPanelSummaryCompositionInputs } = await import(
            "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs"
        );
        const { publishedLayoutReadingOrder } = await import(
            "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout"
        );
        const inputs = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const laidOut = publishedLayoutReadingOrder(inputs.publishedLayout!);
        expect(laidOut).toEqual(
            expect.arrayContaining(["current_work", "household", "children", "scheduling", "billing_preview"]),
        );
        expect(laidOut).not.toContain("milestones");
        const defaultAreas = focusPanelSummaryDefaultGridLayout().areas.map((a) => a.card);
        expect(laidOut).toEqual(expect.arrayContaining(defaultAreas));
    });

    it("returns no rows for an empty / missing doc (caller falls back)", () => {
        expect(deriveFocusPanelGridFromLayoutDoc(null).rows).toHaveLength(0);
        expect(deriveFocusPanelGridFromLayoutDoc(undefined).rows).toHaveLength(0);
        const empty: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: "drawer",
            entityType: "opportunities",
            sections: [],
        };
        expect(deriveFocusPanelGridFromLayoutDoc(empty).rows).toHaveLength(0);
    });

    it("groups by gridRow ascending and preserves document order within a row", () => {
        const doc: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: "drawer",
            entityType: "opportunities",
            sections: [
                buildFocusPanelCardSection({ key: "children", span: 2, density: "compact", tier: "reference", gridRow: 1 }),
                buildFocusPanelCardSection({ key: "attention", span: 1, density: "compact", tier: "attention", gridRow: 0 }),
                buildFocusPanelCardSection({ key: "household", span: 2, density: "compact", tier: "reference", gridRow: 1 }),
            ],
        };
        const grid = deriveFocusPanelGridFromLayoutDoc(doc);
        expect(grid.rows.map((r) => r.cells.map((c) => c.key))).toEqual([
            ["attention"],
            ["children", "household"],
        ]);
    });

    it("skips sections without valid Focus Panel card metadata", () => {
        const doc: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: "drawer",
            entityType: "opportunities",
            sections: [
                buildFocusPanelCardSection({ key: "attention", span: 1, density: "compact", tier: "attention", gridRow: 0 }),
                { id: "legacy", key: "legacy_section", title: "Legacy", rows: [] },
            ],
        };
        const grid = deriveFocusPanelGridFromLayoutDoc(doc);
        expect(grid.rows).toHaveLength(1);
        expect(grid.rows[0]!.cells.map((c) => c.key)).toEqual(["attention"]);
    });
});
