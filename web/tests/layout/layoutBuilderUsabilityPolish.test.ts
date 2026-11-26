/**
 * Experience Builder usability polish — Sprint 5.18D regression tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { listSectionWidgetItems } from "@/lib/layout/layoutBuilderWidgetStrip";
import {
    patchLayoutEditorRelatedListConfig,
    validateRelatedListSectionMetadata,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { renameSectionTitle } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import {
    buildRelatedListFieldPickerGroups,
    RELATED_LIST_FIELD_GROUP_ENTITY_KEYS,
} from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { normalizeLayoutRuntimeChildRow } from "@/lib/layout/runtime/normalizeLayoutRuntimeChildRow";
import { isAllowedOpportunityDrawerFieldRefKey } from "@/lib/layout/surfaceLayoutRegistry";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";

describe("layoutBuilderUsabilityPolish", () => {
    it("renameSectionTitle preserves internal spaces in card titles", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const sectionKey = doc.sections[0]!.key;
        const next = renameSectionTitle(doc, sectionKey, "Enrollment Details");
        const section = next.sections.find((s) => s.key === sectionKey);
        expect(section?.title).toBe("Enrollment Details");

        const ampersand = renameSectionTitle(next, sectionKey, "Household & Guardian Info");
        expect(ampersand.sections.find((s) => s.key === sectionKey)?.title).toBe("Household & Guardian Info");
    });

    it("KPI tile widget items resolve inspector field paths", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = createExperienceBuilderCard(doc, {
            title: "Open Tasks",
            widthKey: "third",
            cardType: "widget",
            widgetKey: "tasks",
        });
        const widgets = listSectionWidgetItems(result.doc, result.sectionKey);
        expect(widgets).toHaveLength(1);
        const widgetPath = `field:${result.sectionKey}:${widgets[0]!.itemId}`;
        expect(widgetPath.startsWith(`field:${result.sectionKey}:`)).toBe(true);
        expect(widgets[0]!.itemId).toBeTruthy();
    });

    it("allows child.age on the opportunity drawer surface and related-list config", () => {
        expect(isAllowedOpportunityDrawerFieldRefKey("child.age")).toBe(true);

        let doc = buildLeadDrawerDefaultDoc();
        const created = createExperienceBuilderCard(doc, {
            title: "Children",
            widthKey: "full",
            cardType: "related_list",
        });
        doc = patchLayoutEditorRelatedListConfig(created.doc, created.sectionKey, {
            entityType: "children",
            primaryRow: { fields: ["child.first_name", "child.last_name", "child.age", "inquiry_child.program_category_id"] },
        });

        expect(validateRelatedListSectionMetadata(doc)).toEqual([]);
        const surface = validateLayoutDocForSurface(doc, "opportunity_drawer");
        expect(surface.errors.some((e) => e.includes("child.age"))).toBe(false);
    });

    it("normalizes child.age from DOB-derived age on runtime child rows", () => {
        const row = normalizeLayoutRuntimeChildRow(
            { first_name: "Avery", last_name: "Nguyen", age: "3y" },
            0,
        );
        expect(row?.["child.age"]).toBe("3y");
        expect(row?.["child.age_band"]).toBe("3y");
    });

    it("groups related-list field picker options by entity with children defaults", () => {
        const childGroups = buildRelatedListFieldPickerGroups("children");
        const allowed = new Set(RELATED_LIST_FIELD_GROUP_ENTITY_KEYS.children);
        expect(childGroups.length).toBeGreaterThan(0);
        expect(childGroups.every((g) => allowed.has(g.entityKey))).toBe(true);
        expect(childGroups.some((g) => g.fields.some((f) => f.refKey === "child.age"))).toBe(true);
        expect(childGroups.some((g) => g.entityLabel.toLowerCase().includes("child"))).toBe(true);

        const contactGroups = buildRelatedListFieldPickerGroups("contacts");
        expect(contactGroups.every((g) => g.entityKey === "person")).toBe(true);

        const allGroups = buildRelatedListFieldPickerGroups("children", { includeAllEntities: true });
        expect(allGroups.length).toBeGreaterThan(childGroups.length);
    });
});
