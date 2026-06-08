import { describe, expect, it } from "vitest";
import {
    buildLayoutSectionDisplayFieldRows,
    layoutEditorRowsForPersist,
    layoutRequirementPresetLabel,
    LAYOUT_DRAWER_HEADER_SECTION_KEY,
    resolveLayoutSectionOperatorClass,
    resolveLayoutSectionOperatorProfile,
    withDrawerHeaderEditorSection,
} from "@/lib/adminV2/layouts/layoutSectionOperatorUi";

describe("layoutSectionOperatorUi", () => {
    it("classifies custom sections", () => {
        const p = resolveLayoutSectionOperatorProfile("field_section_ref", "details");
        expect(p.operatorClassLabel).toBe("Custom section");
        expect(p.fieldsPanelMode).toBe("custom_catalog");
        expect(p.canAssignFields).toBe(true);
        expect(p.canConfigureFieldBehavior).toBe(true);
    });

    it("classifies drawer header as Header with behavior controls", () => {
        const p = resolveLayoutSectionOperatorProfile("header_region", LAYOUT_DRAWER_HEADER_SECTION_KEY);
        expect(p.operatorClassLabel).toBe("Header");
        expect(p.canReorder).toBe(false);
        expect(p.canConfigureFieldBehavior).toBe(true);
        expect(p.sectionHint).toContain("Title, status");
    });

    it("classifies workflow virtual sections with field behavior when preview keys exist", () => {
        const empty = resolveLayoutSectionOperatorProfile("workflow_virtual", "inq_identity", { titleEditable: true });
        expect(empty.operatorClassLabel).toBe("Workflow section");
        expect(empty.canAssignFields).toBe(false);
        expect(empty.canConfigureFieldBehavior).toBe(false);

        const withKeys = resolveLayoutSectionOperatorProfile("workflow_virtual", "inq_identity", {
            titleEditable: true,
            previewFieldKeys: ["campus_pref"],
        });
        expect(withKeys.canConfigureFieldBehavior).toBe(true);
        expect(withKeys.fieldsPanelMode).toBe("standard_fields");
    });

    it("classifies inquiry_children as standard section with fixed field note", () => {
        const p = resolveLayoutSectionOperatorProfile("injected_system", "inquiry_children");
        expect(p.operatorClassLabel).toBe("Standard section");
        expect(p.fixedFieldsNote).toContain("fixed in v1");
        expect(p.fieldsPanelMode).toBe("standard_fields");
    });

    it("prepends drawer header and strips it on persist", () => {
        const rows = withDrawerHeaderEditorSection([
            { section_key: "details", title: "Details", kind: "field_section_ref", visible: true },
        ]);
        expect(rows[0]?.section_key).toBe(LAYOUT_DRAWER_HEADER_SECTION_KEY);
        expect(layoutEditorRowsForPersist(rows)).toHaveLength(1);
    });

    it("buildLayoutSectionDisplayFieldRows includes fixed child grid columns", () => {
        const rows = buildLayoutSectionDisplayFieldRows({
            entityType: "opportunity",
            sectionKey: "inquiry_children",
            sectionKind: "injected_system",
            catalogFields: [],
            previewFieldKeys: [],
        });
        expect(rows.some((r) => r.field_key === "child_name" && r.displayOnly)).toBe(true);
    });

    it("maps requirement preset labels for layouts", () => {
        expect(layoutRequirementPresetLabel("required_on_save")).toBe("Required to save");
        expect(layoutRequirementPresetLabel("required")).toBe("Always required");
    });

    it("resolveLayoutSectionOperatorClass maps kinds and header key", () => {
        expect(resolveLayoutSectionOperatorClass("field_section_ref", "details")).toBe("custom");
        expect(resolveLayoutSectionOperatorClass("workflow_virtual", "inq_identity")).toBe("workflow");
        expect(resolveLayoutSectionOperatorClass("injected_system", "inquiry_children")).toBe("standard");
        expect(resolveLayoutSectionOperatorClass("header_region", LAYOUT_DRAWER_HEADER_SECTION_KEY)).toBe("header");
    });
});
