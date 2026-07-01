/**
 * Visual Layout Configuration Builder — Phase 5.5 UX convergence tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    buildOpportunityDrawerEditorFieldPickerGroups,
    resolveLayoutEditorFieldRefLabel,
    resolveLayoutEditorItemDisplayLabel,
} from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";

const root = resolve(__dirname, "../..");

describe("opportunity drawer layout editor field catalog", () => {
    it("uses human labels instead of raw refKeys", () => {
        expect(resolveLayoutEditorFieldRefLabel("child.desired_start_date")).not.toContain("desired_start");
        expect(resolveLayoutEditorFieldRefLabel("child.desired_start_date")).not.toContain("child.");
        expect(resolveLayoutEditorFieldRefLabel("child.dob_age")).not.toBe("dob_age");
        expect(resolveLayoutEditorFieldRefLabel("opportunity.tour_date")).toBe("Tour date");
    });

    it("labels widgets with catalog names", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const activity = doc.sections.find((s) => s.key === "activity");
        const widget = activity?.rows[0]?.columns[0]?.items[0];
        expect(widget).toBeTruthy();
        expect(resolveLayoutEditorItemDisplayLabel(widget!)).toBe("Activity");
    });

    it("builds entity-first picker groups", () => {
        const groups = buildOpportunityDrawerEditorFieldPickerGroups();
        expect(groups.length).toBeGreaterThan(0);
        expect(groups.some((g) => g.entityLabel === "Children" || g.entityLabel === "Enrollment Record")).toBe(true);
        for (const group of groups) {
            for (const field of group.fields) {
                expect(field.fieldLabel).not.toContain("child.");
                expect(field.fieldLabel).not.toContain("inquiry_child.");
            }
        }
    });
});

describe("visual editor UX convergence wiring", () => {
    it("studio shell uses inspector for section configuration", () => {
        const editor = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx"),
            "utf8",
        );
        const inspector = readFileSync(
            resolve(root, "components/adminV2/settings/LayoutBuilderInspectorPanel.tsx"),
            "utf8",
        );
        expect(editor).toContain("LayoutBuilderInspectorPanel");
        expect(inspector).toContain("visual-editor-composition-panel");
        expect(inspector).toContain("visual-editor-section-title");
    });

    it("field picker is entity-first without refKey in operator UI", () => {
        const picker = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutFieldPicker.tsx"),
            "utf8",
        );
        expect(picker).toContain("visual-editor-field-picker-entities");
        expect(picker).not.toContain("({refKey})");
        expect(picker).not.toContain("{label} ({refKey})");
    });

    it("main editor uses palette, canvas, and inspector studio grid", () => {
        const editor = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx"),
            "utf8",
        );
        expect(editor).toContain("OpportunityDrawerLayoutEditorCanvas");
        expect(editor).toContain("LayoutBuilderPalettePanel");
        expect(editor).toContain("LayoutBuilderInspectorPanel");
        expect(editor).not.toContain("Section editor");
    });
});
