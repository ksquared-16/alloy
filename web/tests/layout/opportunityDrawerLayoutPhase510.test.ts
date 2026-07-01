/**
 * Visual Layout Configuration Builder — Phase 5.10 tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    isAllowedLayoutEditorActionKey,
    makeLayoutEditorActionButtonItem,
    validateLayoutEditorActionButtonConfig,
} from "@/lib/layout/layoutEditorActionButton";
import { validateLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import { makeFieldItem } from "@/lib/layout/builderOps";
import {
    addSectionFieldItem,
    addSectionListItem,
    addSectionRow,
    addSectionTextItem,
    addSectionActionButtonItem,
    listSectionCompositionRows,
    moveSectionItemHorizontal,
    moveSectionRow,
    patchSectionTextItem,
    removeSectionRow,
    setSectionRowColumnCount,
} from "@/lib/layout/layoutEditorSectionComposition";
import {
    isSectionEditorHidden,
    setSectionEditorHidden,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";

const NAME_FIELD: LayoutCatalogField = {
    refKey: "person.primary_contact_name",
    fieldLabel: "Full name",
    fieldType: "text",
    sourceEntity: "person",
};
const EMAIL_FIELD: LayoutCatalogField = {
    refKey: "person.primary_email",
    fieldLabel: "Email",
    fieldType: "text",
    sourceEntity: "person",
};
const PHONE_FIELD: LayoutCatalogField = {
    refKey: "person.primary_phone",
    fieldLabel: "Phone",
    fieldType: "phone",
    sourceEntity: "person",
};

describe("section row composition", () => {
    it("adds row to section", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const before = doc.sections.find((s) => s.key === "household_contact")!.rows.length;
        const next = addSectionRow(doc, "household_contact", 1);
        const after = next.sections.find((s) => s.key === "household_contact")!.rows.length;
        expect(after).toBe(before + 1);
    });

    it("adds 2-column row and places Email + Phone side by side", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = addSectionRow(doc, "household_contact", 2);
        const rowIndex = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        const name = addSectionFieldItem(doc, "household_contact", rowIndex - 1, 0, NAME_FIELD);
        expect(name.ok, name.ok ? "" : name.error).toBe(true);
        if (!name.ok) return;
        doc = name.doc;
        doc = addSectionRow(doc, "household_contact", 2);
        const sideRow = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        const email = addSectionFieldItem(doc, "household_contact", sideRow, 0, EMAIL_FIELD);
        const phone = addSectionFieldItem(email.ok ? email.doc : doc, "household_contact", sideRow, 1, PHONE_FIELD);
        expect(email.ok && phone.ok).toBe(true);
        if (!email.ok || !phone.ok) return;
        doc = phone.doc;
        const rows = listSectionCompositionRows(doc, "household_contact");
        const target = rows[sideRow];
        expect(target?.columnCount).toBe(2);
        expect(target?.columns[0]?.items[0]?.title).toContain("Email");
        expect(target?.columns[1]?.items[0]?.title).toContain("Phone");
    });

    it("adds Full Name in row 1 via single-column row", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "household_contact", 1);
        const rowIndex = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        const result = addSectionFieldItem(doc, "household_contact", rowIndex, 0, NAME_FIELD);
        expect(result.ok, result.ok ? "" : result.error).toBe(true);
        if (!result.ok) return;
        const rows = listSectionCompositionRows(result.doc, "household_contact");
        expect(rows[rowIndex]?.columns[0]?.items[0]?.title).toContain("Full name");
    });
});

describe("section item types", () => {
    it("adds text item", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "household_contact", 1);
        const rowIndex = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        const result = addSectionTextItem(doc, "household_contact", rowIndex, 0, "{last_name} Household", "Household");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        doc = patchSectionTextItem(result.doc, "household_contact", result.itemId, { template: "The Smith Household" });
        const item = doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[rowIndex]?.columns[0]?.items.find((it) => it.id === result.itemId);
        expect(item?.template).toBe("The Smith Household");
    });

    it("adds list item", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "children_enrollment", 1);
        const rowIndex = 0;
        const result = addSectionListItem(doc, "children_enrollment", rowIndex, 0);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const item = result.doc.sections
            .find((s) => s.key === "children_enrollment")
            ?.rows[rowIndex]?.columns[0]?.items.find((it) => it.id === result.itemId);
        expect(item?.kind).toBe("related_list");
    });

    it("adds action button item", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "children_enrollment", 1);
        const result = addSectionActionButtonItem(doc, "children_enrollment", 0, 0, {
            label: "Edit",
            actionKey: "edit_enrollment",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const rows = listSectionCompositionRows(result.doc, "children_enrollment");
        expect(rows[0]?.columns[0]?.items.some((it) => it.kind === "action_button")).toBe(true);
    });
});

describe("section item movement", () => {
    it("moves item left/right across columns", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "household_contact", 2);
        const rowIndex = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        const email = addSectionFieldItem(doc, "household_contact", rowIndex, 0, EMAIL_FIELD);
        if (!email.ok) throw new Error(email.error);
        doc = moveSectionItemHorizontal(email.doc, "household_contact", email.itemId, 1);
        const rows = listSectionCompositionRows(doc, "household_contact");
        expect(rows[rowIndex]?.columns[1]?.items.some((it) => it.itemId === email.itemId)).toBe(true);
    });

    it("moves row up/down", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const startLen = doc.sections.find((s) => s.key === "household_contact")!.rows.length;
        doc = addSectionRow(doc, "household_contact", 1);
        doc = addSectionRow(doc, "household_contact", 1);
        expect(doc.sections.find((s) => s.key === "household_contact")!.rows.length).toBe(startLen + 2);
        doc = moveSectionRow(doc, "household_contact", startLen + 1, -1);
        doc = removeSectionRow(doc, "household_contact", doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1);
        expect(doc.sections.find((s) => s.key === "household_contact")!.rows.length).toBe(startLen + 1);
    });
});

describe("title visibility", () => {
    it("hides section title via layoutEditorHidden", () => {
        const doc = setSectionEditorHidden(buildLeadDrawerDefaultDoc(), "household_contact", true);
        const section = doc.sections.find((s) => s.key === "household_contact")!;
        expect(isSectionEditorHidden(section)).toBe(true);
    });
});

describe("side-by-side row layout structure", () => {
    it("setSectionRowColumnCount preserves items across columns", () => {
        let doc = addSectionRow(buildLeadDrawerDefaultDoc(), "household_contact", 1);
        const rowIndex = doc.sections.find((s) => s.key === "household_contact")!.rows.length - 1;
        const a = addSectionFieldItem(doc, "household_contact", rowIndex, 0, EMAIL_FIELD);
        const b = addSectionFieldItem(a.ok ? a.doc : doc, "household_contact", rowIndex, 0, PHONE_FIELD);
        if (!a.ok || !b.ok) throw new Error("add failed");
        doc = setSectionRowColumnCount(b.doc, "household_contact", rowIndex, 2);
        const row = doc.sections.find((s) => s.key === "household_contact")!.rows[rowIndex]!;
        expect(row.columns.length).toBe(2);
        expect(row.columns.flatMap((c) => c.items).length).toBe(2);
    });
});

describe("registry validation", () => {
    it("rejects invalid action key", () => {
        expect(validateLayoutEditorActionButtonConfig({ actionKey: "launch_missiles" }, "test")).not.toHaveLength(0);
        expect(isAllowedLayoutEditorActionKey("edit_enrollment")).toBe(true);
        expect(isAllowedLayoutEditorActionKey("launch_missiles")).toBe(false);
    });

    it("rejects invalid display type", () => {
        expect(validateLayoutEditorDisplayConfig({ displayType: "not_valid" as never }, "test")).not.toHaveLength(0);
    });

    it("builds action button item with registry metadata", () => {
        const item = makeLayoutEditorActionButtonItem({ label: "Edit", actionKey: "edit_enrollment" });
        expect(item.refKey).toBe("_action_button");
        expect(item.metadata?.layoutEditorActionButton).toBeTruthy();
    });
});

describe("runtime structural ref keys", () => {
    it("allows template and action button field items in layout doc fields", () => {
        expect(makeFieldItem("person.primary_email", "Email", "text").refKey).toBe("person.primary_email");
        expect(makeLayoutEditorActionButtonItem().refKey).toBe("_action_button");
    });
});
