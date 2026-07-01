/**
 * Person / child drawer layout editor — surface identity + context-aware validation.
 */

import { describe, expect, it } from "vitest";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addSectionFieldItem } from "@/lib/layout/layoutEditorSectionComposition";
import { addFieldToCustomBlockRow } from "@/lib/layout/layoutEditorFreeformBlocks";
import { validateDrawerLayoutDoc, reorderSectionInZone, resolveCompositionGridLayout } from "@/lib/layout/drawerLayoutEditorModel";
import { patchLayoutDocSectionCollapse } from "@/lib/layout/runtime/layoutRuntimeSectionCollapse";
import { patchItem, addItem, makeFieldItem } from "@/lib/layout/builderOps";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { layoutBuilderWidgetOptionsForSurface } from "@/lib/layout/layoutBuilderPaletteModel";
import { buildCrossFieldVisibilityCondition } from "@/lib/layout/layoutEditorVisibilityRules";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { formatDrawerLayoutValidationErrors } from "@/lib/layout/drawerSurfaceFieldValidation";
import {
    LAYOUT_EDITOR_RELATED_LIST_MAX_ROW_FIELDS,
    patchLayoutEditorRelatedListConfig,
    readLayoutEditorRelatedListConfig,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { readLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import { applyLayoutEditorFieldSettingsPatch } from "@/lib/layout/layoutEditorCompositionModel";
import {
    LAYOUT_EDITOR_WIDGET_CARD_METADATA_KEY,
    sectionIsKpiTile,
} from "@/lib/layout/layoutBuilderWidgetStrip";

const PERSON_FIELD: LayoutCatalogField = {
    entityKey: "person",
    entityLabel: "Parent / Contact",
    fieldKey: "communication_opt_out",
    fieldLabel: "Communication opt-out",
    fieldType: "boolean",
    refKey: "person.communication_opt_out",
};

const CHILD_DOB_FIELD: LayoutCatalogField = {
    entityKey: "child",
    entityLabel: "Child",
    fieldKey: "dob_age",
    fieldLabel: "DOB / Age",
    fieldType: "text",
    refKey: "child.dob_age",
};

function findConnectedChildrenTable(doc: LayoutDoc) {
    for (const section of doc.sections) {
        for (const row of section.rows) {
            for (const col of row.columns) {
                const item = col.items.find((it) => it.kind === "related_list" && it.refKey === "household_children");
                if (item) return { sectionKey: section.key, item };
            }
        }
    }
    return null;
}

describe("person drawer layout editor surface identity", () => {
    it("addSectionFieldItem validates against person drawer, not opportunity drawer", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const result = addSectionFieldItem(doc, "contact_information", 0, 0, PERSON_FIELD, {
            surfaceKey: "person_drawer",
        });
        expect(result.ok, result.ok ? "" : (result as { error: string }).error).toBe(true);
        expect((result as { error?: string }).error ?? "").not.toMatch(/opportunity drawer/i);
    });

    it("person drawer save/publish errors reference person drawer", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const sIdx = doc.sections.findIndex((s) => s.key === "contact_information");
        const item = makeFieldItem("opportunity.attention_reason", "Attention", "text");
        const bad = addItem(doc, sIdx, 0, 0, item);
        const validation = validateDrawerLayoutDoc(bad, "person_drawer");
        expect(validation.ok).toBe(false);
        expect(validation.errors.join(" ")).not.toMatch(/opportunity drawer/i);
    });

    it("child drawer save/publish rejects opportunity-only field refs", () => {
        const doc = buildChildDrawerDefaultDoc();
        const sIdx = doc.sections.findIndex((s) => s.key === "child_summary");
        const item = makeFieldItem("opportunity.attention_reason", "Attention", "text");
        const bad = addItem(doc, sIdx, 0, 0, item);
        const validation = validateDrawerLayoutDoc(bad, "child_drawer");
        expect(validation.ok).toBe(false);
        expect(validation.errors.some((e) => e.includes("opportunity.attention_reason"))).toBe(true);
        expect(validation.errors.join(" ")).not.toMatch(/opportunity drawer/i);
    });

    it("opportunity drawer still validates opportunity-only refs", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const validation = validateDrawerLayoutDoc(doc, "opportunity_drawer");
        expect(validation.ok).toBe(true);
    });
});

describe("person drawer linked child field contexts", () => {
    it("rejects child.dob_age on person anchor section", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const result = addSectionFieldItem(doc, "contact_information", 0, 0, CHILD_DOB_FIELD, {
            surfaceKey: "person_drawer",
        });
        expect(result.ok).toBe(false);
        expect((result as { error: string }).error).toMatch(/person drawer/i);
    });

    it("allows child.dob_age inside linked children related_list", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const located = findConnectedChildrenTable(doc);
        expect(located).toBeTruthy();
        const result = addFieldToCustomBlockRow(doc, located!.item.id, 0, 0, CHILD_DOB_FIELD, {
            surfaceKey: "person_drawer",
        });
        expect(result.ok, result.ok ? "" : (result as { error: string }).error).toBe(true);
    });

    it("validates linked child columns on publish", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const validation = validateDrawerLayoutDoc(doc, "person_drawer");
        expect(validation.ok, validation.errors.join("; ")).toBe(true);
    });
});

describe("collapse metadata validation", () => {
    it("accepts persistCollapseState on person, child, and opportunity drawers", () => {
        for (const [surfaceKey, buildDoc] of [
            ["person_drawer", buildPersonDrawerDefaultDoc],
            ["child_drawer", buildChildDrawerDefaultDoc],
            ["opportunity_drawer", buildLeadDrawerDefaultDoc],
        ] as const) {
            const doc = buildDoc();
            const sectionKey = doc.sections[0]!.key;
            const withCollapse = patchLayoutDocSectionCollapse(doc, sectionKey, {
                collapsible: true,
                persistCollapseState: true,
                collapsedSummary: "Summary",
            });
            const validation = validateDrawerLayoutDoc(withCollapse, surfaceKey);
            expect(validation.ok, `${surfaceKey}: ${validation.errors.join("; ")}`).toBe(true);
        }
    });

    it("rejects unknown section metadata keys", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const section = doc.sections[0]!;
        const bad: LayoutDoc = {
            ...doc,
            sections: [
                {
                    ...section,
                    metadata: { ...(section.metadata ?? {}), unknownCollapseKey: true },
                },
                ...doc.sections.slice(1),
            ],
        };
        const validation = validateDrawerLayoutDoc(bad, "person_drawer");
        expect(validation.ok).toBe(false);
        expect(validation.errors.some((e) => e.includes("unknownCollapseKey"))).toBe(true);
    });
});

describe("conditional field visibility", () => {
    it("employee_id visible only when person.is_employee is true", () => {
        const condition = buildCrossFieldVisibilityCondition({
            sourcePath: "person.is_employee",
            operator: "is_true",
        })!;
        expect(evaluateLayoutCondition({ "person.is_employee": true }, condition)).toBe(true);
        expect(evaluateLayoutCondition({ "person.is_employee": false }, condition)).toBe(false);
        expect(evaluateLayoutCondition({}, condition)).toBe(false);
    });
});

describe("documents widget picker", () => {
    it("documents widget appears for person, child, and opportunity drawer surfaces", () => {
        for (const surfaceKey of ["person_drawer", "child_drawer", "opportunity_drawer"] as const) {
            const keys = layoutBuilderWidgetOptionsForSurface(surfaceKey).map((w) => w.key);
            expect(keys, surfaceKey).toContain("documents");
        }
    });

    it("documents widget adds as widget card, not KPI tile", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const { doc: next, sectionKey } = createExperienceBuilderCard(doc, {
            title: "Documents",
            widthKey: "full",
            cardType: "widget",
            widgetKey: "documents",
            surfaceKey: "person_drawer",
            zone: "right_rail",
        });
        const section = next.sections.find((s) => s.key === sectionKey)!;
        expect(section.metadata?.[LAYOUT_EDITOR_WIDGET_CARD_METADATA_KEY]).toBe(true);
        expect(sectionIsKpiTile(section)).toBe(false);
        const validation = validateDrawerLayoutDoc(next, "person_drawer");
        expect(validation.ok, validation.errors.join("; ")).toBe(true);
    });
});

describe("person drawer related list authoring", () => {
    it("adding related list produces valid doc with empty child defaults", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const { doc: next } = createExperienceBuilderCard(doc, {
            title: "Linked children",
            widthKey: "full",
            cardType: "related_list",
            surfaceKey: "person_drawer",
        });
        const section = next.sections.find((s) => s.metadata?.layoutEditorSectionType === "related_list");
        expect(section).toBeTruthy();
        const config = readLayoutEditorRelatedListConfig(section!, "person_drawer");
        expect(config.primaryRow.fields).toEqual([]);
        expect(config.secondaryRow?.fields ?? []).toEqual([]);
        expect(config.tertiaryRow?.fields ?? []).toEqual([]);
        const validation = validateDrawerLayoutDoc(next, "person_drawer");
        expect(validation.ok, validation.errors.join("; ")).toBe(true);
    });

    it("related list validation errors use person drawer copy", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const { doc: withList } = createExperienceBuilderCard(doc, {
            title: "Children",
            widthKey: "full",
            cardType: "related_list",
            surfaceKey: "person_drawer",
        });
        const section = withList.sections.find((s) => s.metadata?.layoutEditorSectionType === "related_list")!;
        const bad = patchLayoutEditorRelatedListConfig(withList, section.key, {
            primaryRow: { fields: ["opportunity.attention_reason"] },
        });
        const validation = validateDrawerLayoutDoc(bad, "person_drawer");
        expect(validation.ok).toBe(false);
        const friendly = formatDrawerLayoutValidationErrors(validation.errors, "person_drawer");
        expect(friendly.join(" ")).not.toMatch(/opportunity drawer/i);
    });

    it("supports more than three related-list columns", () => {
        const uniqueFields = ["child.name", "child.dob_age", "child.program", "child.room", "child.schedule", "child.status"];
        const doc = buildPersonDrawerDefaultDoc();
        const { doc: withList, sectionKey } = createExperienceBuilderCard(doc, {
            title: "Children",
            widthKey: "full",
            cardType: "related_list",
            surfaceKey: "person_drawer",
        });
        const patched = patchLayoutEditorRelatedListConfig(withList, sectionKey, {
            primaryRow: { fields: uniqueFields },
        });
        const config = readLayoutEditorRelatedListConfig(
            patched.sections.find((s) => s.key === sectionKey)!,
            "person_drawer",
        );
        expect(config.primaryRow.fields.length).toBe(LAYOUT_EDITOR_RELATED_LIST_MAX_ROW_FIELDS);
        const validation = validateDrawerLayoutDoc(patched, "person_drawer");
        expect(validation.ok, validation.errors.join("; ")).toBe(true);
    });

    it("persists related-list column display metadata", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const located = findConnectedChildrenTable(doc);
        expect(located).toBeTruthy();
        const colIdx = located!.item.columns?.findIndex((c) => c.refKey === "child.name") ?? -1;
        expect(colIdx).toBeGreaterThanOrEqual(0);
        const patched = applyLayoutEditorFieldSettingsPatch(doc, {
            kind: "column",
            sectionKey: located!.sectionKey,
            blockItemId: located!.item.id,
            colIdx,
        }, {
            display: { showLabel: false, icon: "user", linkBehavior: "open_drawer" },
        });
        const section = patched.sections.find((s) => s.key === located!.sectionKey)!;
        const item = findConnectedChildrenTable(patched)!.item;
        const col = item.columns![colIdx]!;
        const display = readLayoutEditorDisplayConfig(col);
        expect(display.showLabel).toBe(false);
        expect(display.icon).toBe("user");
        expect(display.linkBehavior).toBe("open_drawer");
    });
});

describe("section reorder and composition grid", () => {
    it("reordering a section does not duplicate section keys", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const countBefore = doc.sections.length;
        const reordered = reorderSectionInZone(doc, "recent_activity", -1, "person_drawer");
        expect(reordered.sections.length).toBe(countBefore);
        const keys = reordered.sections.map((s) => s.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("does not duplicate rail sections in overflow", () => {
        const layout = resolveCompositionGridLayout(buildPersonDrawerDefaultDoc(), "person_drawer");
        const overflowKeys = layout.overflowSections.map((s) => s.key);
        for (const section of layout.rightRailSections) {
            expect(overflowKeys).not.toContain(section.key);
        }
    });
});
