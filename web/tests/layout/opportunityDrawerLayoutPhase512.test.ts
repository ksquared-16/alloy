/**
 * Visual Layout Configuration Builder — Phase 5.12 tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    addSectionFieldItem,
    addSectionRow,
    addSectionWidgetItem,
    listSectionCompositionRows,
} from "@/lib/layout/layoutEditorSectionComposition";
import { summarizeSectionCompositionDiagnostic } from "@/lib/layout/layoutEditorSectionCompositionDiagnostics";
import { resolveVisualEditorActionState } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { sectionHasLayoutOwnedComposition } from "@/lib/layout/runtime/resolveLayoutEditorHouseholdRendering";
import { shouldUseDrawerHouseholdProfileSubstitution } from "@/lib/layout/runtime/resolveLayoutEditorHouseholdRendering";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const EMAIL_FIELD: LayoutCatalogField = {
    refKey: "person.primary_email",
    fieldLabel: "Email",
    fieldType: "text",
    entityKey: "person",
    entityLabel: "Person",
    fieldKey: "primary_email",
};

const PHONE_FIELD: LayoutCatalogField = {
    refKey: "person.primary_phone",
    fieldLabel: "Phone",
    fieldType: "phone",
    entityKey: "person",
    entityLabel: "Person",
    fieldKey: "primary_phone",
};

function reloadDoc(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

describe("publish workflow action state", () => {
    it("allows save when published layout has unsaved edits", () => {
        const state = resolveVisualEditorActionState({
            dirty: true,
            validationOk: true,
            recordStatus: "published",
            busy: false,
        });
        expect(state.canSave).toBe(true);
        expect(state.canPublish).toBe(false);
    });
});

describe("runtime composition source", () => {
    it("honors layout doc rows when section has composed items", () => {
        const section = buildLeadDrawerDefaultDoc().sections.find((s) => s.key === "household_contact")!;
        expect(sectionHasLayoutOwnedComposition(section)).toBe(true);
        expect(
            shouldUseDrawerHouseholdProfileSubstitution({
                sectionKey: "household_contact",
                compositionSectionSurface: true,
                operatorSurfaces: true,
                honorLayoutDocBlocks: false,
            }),
        ).toBe(true);
        expect(
            shouldUseDrawerHouseholdProfileSubstitution({
                sectionKey: "household_contact",
                compositionSectionSurface: true,
                operatorSurfaces: true,
                honorLayoutDocBlocks: false,
            }) && !sectionHasLayoutOwnedComposition(section),
        ).toBe(false);
    });

    it("reports side-by-side and stacked row structures in diagnostics", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "lead_source", 2);
        const sideRow = doc.sections.find((s) => s.key === "lead_source")!.rows.length - 1;
        const email = addSectionFieldItem(doc, "lead_source", sideRow, 0, EMAIL_FIELD);
        if (!email.ok) throw new Error(email.error);
        const phone = addSectionFieldItem(email.doc, "lead_source", sideRow, 1, PHONE_FIELD);
        if (!phone.ok) throw new Error(phone.error);
        doc = phone.doc;

        const sideBySide = summarizeSectionCompositionDiagnostic(doc, "lead_source", {
            layoutRecordId: "layout-1",
            layoutVersion: 3,
            surface: "editor_preview",
            honorLayoutDocBlocks: true,
        });
        expect(sideBySide?.columnCounts[sideRow]).toBe(2);

        doc = addSectionRow(doc, "lead_source", 1);
        const emailRow = doc.sections.find((s) => s.key === "lead_source")!.rows.length - 1;
        const emailOnly = addSectionFieldItem(doc, "lead_source", emailRow, 0, EMAIL_FIELD);
        if (!emailOnly.ok) throw new Error(emailOnly.error);
        doc = addSectionRow(emailOnly.doc, "lead_source", 1);
        const phoneRow = doc.sections.find((s) => s.key === "lead_source")!.rows.length - 1;
        const phoneOnly = addSectionFieldItem(doc, "lead_source", phoneRow, 0, PHONE_FIELD);
        if (!phoneOnly.ok) throw new Error(phoneOnly.error);
        doc = phoneOnly.doc;

        const stacked = summarizeSectionCompositionDiagnostic(reloadDoc(doc), "lead_source", {
            layoutRecordId: "layout-1",
            layoutVersion: 4,
            surface: "live_drawer_runtime",
            honorLayoutDocBlocks: true,
        });
        expect(stacked?.columnCounts[emailRow]).toBe(1);
        expect(stacked?.columnCounts[phoneRow]).toBe(1);
        expect(stacked?.runtimeCompositionSource).toBe("published_entity_layout_doc");
    });
});

describe("widget add", () => {
    it("adds widget to section row column", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "activity", 1);
        const rowIndex = doc.sections.find((s) => s.key === "activity")!.rows.length - 1;
        const result = addSectionWidgetItem(doc, "activity", rowIndex, 0, "notes");
        expect(result.ok, result.ok ? "" : result.error).toBe(true);
        if (!result.ok) return;
        const rows = listSectionCompositionRows(result.doc, "activity");
        expect(rows[rowIndex]?.columns[0]?.items[0]?.kind).toBe("widget");
    });

    it("rejects unknown widget keys", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "activity", 1);
        const rowIndex = doc.sections.find((s) => s.key === "activity")!.rows.length - 1;
        const result = addSectionWidgetItem(doc, "activity", rowIndex, 0, "not_a_widget");
        expect(result.ok).toBe(false);
    });

    it("rejects duplicate singleton attention widget in same section", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "activity", 1);
        const rowIndex = doc.sections.find((s) => s.key === "activity")!.rows.length - 1;
        const first = addSectionWidgetItem(doc, "activity", rowIndex, 0, "attention");
        expect(first.ok, first.ok ? "" : first.error).toBe(true);
        if (!first.ok) return;
        const second = addSectionWidgetItem(first.doc, "activity", rowIndex, 0, "attention");
        expect(second.ok).toBe(false);
        if (!second.ok) {
            expect(second.error).toMatch(/only one/i);
        }
    });
});

describe("column composition persistence", () => {
    it("preserves side-by-side then stacked row edits after reload", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "household_contact", 2);
        const sideRow = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        let email = addSectionFieldItem(doc, "household_contact", sideRow, 0, EMAIL_FIELD);
        if (!email.ok) throw new Error(email.error);
        let phone = addSectionFieldItem(email.doc, "household_contact", sideRow, 1, PHONE_FIELD);
        if (!phone.ok) throw new Error(phone.error);
        doc = phone.doc;

        doc = addSectionRow(doc, "household_contact", 1);
        const emailRow = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        email = addSectionFieldItem(doc, "household_contact", emailRow, 0, EMAIL_FIELD);
        if (!email.ok) throw new Error(email.error);
        doc = addSectionRow(email.doc, "household_contact", 1);
        const phoneRow = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        phone = addSectionFieldItem(doc, "household_contact", phoneRow, 0, PHONE_FIELD);
        if (!phone.ok) throw new Error(phone.error);
        doc = phone.doc;

        const reloaded = reloadDoc(doc);
        const rows = listSectionCompositionRows(reloaded, "household_contact");
        expect(rows[sideRow]?.columnCount).toBe(2);
        expect(rows[emailRow]?.columns[0]?.items[0]?.item.refKey).toBe("person.primary_email");
        expect(rows[phoneRow]?.columns[0]?.items[0]?.item.refKey).toBe("person.primary_phone");
    });
});
