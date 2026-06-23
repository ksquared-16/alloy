/**
 * Person / child drawer layout editor — surface identity + context-aware validation.
 */

import { describe, expect, it } from "vitest";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { addSectionFieldItem } from "@/lib/layout/layoutEditorSectionComposition";
import { addFieldToCustomBlockRow } from "@/lib/layout/layoutEditorFreeformBlocks";
import { validateDrawerLayoutDoc } from "@/lib/layout/drawerLayoutEditorModel";
import { patchLayoutDocSectionCollapse } from "@/lib/layout/runtime/layoutRuntimeSectionCollapse";
import { patchItem, addItem, makeFieldItem } from "@/lib/layout/builderOps";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { layoutBuilderWidgetOptionsForSurface } from "@/lib/layout/layoutBuilderPaletteModel";
import { buildCrossFieldVisibilityCondition } from "@/lib/layout/layoutEditorVisibilityRules";

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
});
