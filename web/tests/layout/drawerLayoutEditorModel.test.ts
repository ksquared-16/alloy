/**
 * Drawer layout editor model — surface-parameterized composition grid.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import {
    reorderSectionInZone,
    resolveCompositionGridLayout,
} from "@/lib/layout/drawerLayoutEditorModel";

const root = resolve(__dirname, "../..");

describe("drawerLayoutEditorModel composition grid", () => {
    it("maps opportunity default doc into household/enrollment shell slots", () => {
        const layout = resolveCompositionGridLayout(buildLeadDrawerDefaultDoc(), "opportunity_drawer");
        expect(layout.leftColumn?.key).toBe("household_contact");
        expect(layout.mainColumn?.key).toBe("children_enrollment");
        expect(layout.fullWidthRow?.key).toBe("lead_source");
        expect(layout.summaryHostSectionKey).toBe("lead_summary");
    });

    it("maps person default doc into household/children shell slots", () => {
        const layout = resolveCompositionGridLayout(buildPersonDrawerDefaultDoc(), "person_drawer");
        expect(layout.leftColumn?.key).toBe("household_relationships");
        expect(layout.mainColumn?.key).toBe("connected_children");
        expect(layout.fullWidthRow?.key).toBe("contact_information");
        expect(layout.summaryHostSectionKey).toBe("person_summary");
    });

    it("maps child default doc into family/program shell slots", () => {
        const layout = resolveCompositionGridLayout(buildChildDrawerDefaultDoc(), "child_drawer");
        expect(layout.leftColumn?.key).toBe("family_relationships");
        expect(layout.mainColumn?.key).toBe("program_enrollment");
        expect(layout.fullWidthRow?.key).toBe("schedule_attendance");
        expect(layout.summaryHostSectionKey).toBe("child_summary");
    });

    it("reorders person drawer sections within the same zone", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const before = doc.sections.map((s) => s.key);
        const notesIdx = before.indexOf("notes_communication");
        const activityIdx = before.indexOf("recent_activity");
        expect(notesIdx).toBeGreaterThan(-1);
        expect(activityIdx).toBeGreaterThan(-1);

        const reordered = reorderSectionInZone(doc, "recent_activity", -1, "person_drawer");
        const after = reordered.sections.map((s) => s.key);
        expect(after.indexOf("recent_activity")).toBeLessThan(after.indexOf("notes_communication"));
        expect(after.length).toBe(before.length);
        expect(new Set(after).size).toBe(after.length);
    });

    it("does not duplicate rail sections in person drawer overflow", () => {
        const layout = resolveCompositionGridLayout(buildPersonDrawerDefaultDoc(), "person_drawer");
        const overflowKeys = new Set(layout.overflowSections.map((s) => s.key));
        for (const section of layout.rightRailSections) {
            expect(overflowKeys.has(section.key)).toBe(false);
        }
    });
});

describe("drawerLayoutEditorModel canvas wiring", () => {
    it("uses shared CompositionGrid for all drawer surfaces (no runtime preview shortcut)", () => {
        const canvas = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx"),
            "utf8",
        );
        expect(canvas).not.toContain("PersonChildRuntimeCompositionPreview");
        expect(canvas).not.toContain("PersonOverviewRuntimeComposition");
        expect(canvas).not.toContain("ChildOverviewRuntimeComposition");
        expect(canvas).toContain("resolveCompositionGridLayout");
        expect(canvas).toContain("ExperienceBuilderEditableCardShell");
        expect(canvas).toContain('data-visual-editor-editable="true"');
        expect(canvas).toContain("visual-editor-main-composition-grid");
    });
});
