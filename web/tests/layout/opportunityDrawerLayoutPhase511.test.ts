/**
 * Visual Layout Configuration Builder — Phase 5.11 tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildBlockContextFieldPickerGroups } from "@/lib/layout/layoutEditorBlockFieldCatalog";
import { contactRoleFieldRefs } from "@/lib/layout/layoutEditorContactRoles";
import {
    addFieldToCustomBlockRow,
    addRowToCustomBlock,
    createCustomBlockInSection,
    listCustomBlockRowLayout,
} from "@/lib/layout/layoutEditorFreeformBlocks";
import { listSectionCompositionRows } from "@/lib/layout/layoutEditorSectionComposition";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const fullNameField = (refKey: string, label = "Full name"): LayoutCatalogField => ({
    refKey,
    fieldLabel: label,
    fieldType: "text",
    entityKey: "person",
    entityLabel: "Person",
    fieldKey: refKey.split(".").pop() ?? refKey,
});

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

function findBlock(doc: LayoutDoc, blockItemId: string) {
    return doc.sections
        .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.items)))
        .find((it) => it.id === blockItemId);
}

function reloadDoc(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

describe("nested block row field placement", () => {
    it("creates custom block and adds 1-column row with Full Name", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Primary Contact",
            blockType: "custom_layout_block",
            dataContext: "contact",
        });
        expect(insert.ok, insert.ok ? "" : insert.error).toBe(true);
        if (!insert.ok) return;

        let doc = addRowToCustomBlock(insert.doc, insert.blockItemId, 1);
        const block = findBlock(doc, insert.blockItemId)!;
        const rowIndex = (block.rows?.length ?? 1) - 1;
        const name = fullNameField("person.primary_contact_name");
        const added = addFieldToCustomBlockRow(doc, insert.blockItemId, rowIndex, 0, name);
        expect(added.ok, added.ok ? "" : added.error).toBe(true);
        if (!added.ok) return;

        const layout = listCustomBlockRowLayout(findBlock(added.doc, insert.blockItemId)!);
        const targetRow = layout[rowIndex];
        expect(targetRow?.columns[0]?.items[0]?.refKey).toBe("person.primary_contact_name");
    });

    it("adds Email and Phone side by side in a 2-column block row", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Contact fields",
            blockType: "custom_layout_block",
            dataContext: "contact",
        });
        if (!insert.ok) throw new Error(insert.error);

        let doc = addRowToCustomBlock(insert.doc, insert.blockItemId, 2);
        const rowIndex = (findBlock(doc, insert.blockItemId)?.rows?.length ?? 1) - 1;
        const email = addFieldToCustomBlockRow(doc, insert.blockItemId, rowIndex, 0, EMAIL_FIELD);
        expect(email.ok, email.ok ? "" : email.error).toBe(true);
        if (!email.ok) return;
        const phone = addFieldToCustomBlockRow(email.doc, insert.blockItemId, rowIndex, 1, PHONE_FIELD);
        expect(phone.ok, phone.ok ? "" : phone.error).toBe(true);
        if (!phone.ok) return;

        const layout = listCustomBlockRowLayout(findBlock(phone.doc, insert.blockItemId)!);
        const row = layout[rowIndex];
        expect(row?.columnCount).toBe(2);
        expect(row?.columns[0]?.items[0]?.refKey).toBe("person.primary_email");
        expect(row?.columns[1]?.items[0]?.refKey).toBe("person.primary_phone");
    });

    it("save/reload preserves nested block row fields", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Persist block",
            blockType: "custom_layout_block",
            dataContext: "contact",
        });
        if (!insert.ok) throw new Error(insert.error);
        let doc = addRowToCustomBlock(insert.doc, insert.blockItemId, 2);
        const rowIndex = (findBlock(doc, insert.blockItemId)?.rows?.length ?? 1) - 1;
        const email = addFieldToCustomBlockRow(doc, insert.blockItemId, rowIndex, 0, EMAIL_FIELD);
        if (!email.ok) throw new Error(email.error);
        doc = email.doc;
        const phone = addFieldToCustomBlockRow(doc, insert.blockItemId, rowIndex, 1, PHONE_FIELD);
        if (!phone.ok) throw new Error(phone.error);
        doc = phone.doc;

        const reloaded = reloadDoc(doc);
        const layout = listCustomBlockRowLayout(findBlock(reloaded, insert.blockItemId)!);
        expect(layout[rowIndex]?.columns[0]?.items[0]?.refKey).toBe("person.primary_email");
        expect(layout[rowIndex]?.columns[1]?.items[0]?.refKey).toBe("person.primary_phone");
    });

    it("does not insert nested block fields at section root", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Nested only",
            blockType: "custom_layout_block",
            dataContext: "contact",
        });
        if (!insert.ok) throw new Error(insert.error);
        let doc = addRowToCustomBlock(insert.doc, insert.blockItemId, 1);
        const rowIndex = (findBlock(doc, insert.blockItemId)?.rows?.length ?? 1) - 1;
        const added = addFieldToCustomBlockRow(
            doc,
            insert.blockItemId,
            rowIndex,
            0,
            fullNameField("person.primary_contact_name"),
        );
        if (!added.ok) throw new Error(added.error);
        doc = added.doc;

        const sectionRows = listSectionCompositionRows(doc, "household_contact");
        const sectionFieldRefs = sectionRows.flatMap((r) =>
            r.columns.flatMap((c) => c.items.flatMap((it) => (it.kind === "field" ? [it.item.refKey] : []))),
        );
        expect(sectionFieldRefs).not.toContain("person.primary_contact_name");

        const block = findBlock(doc, insert.blockItemId)!;
        expect(block.rows?.some((row) => row.columns.some((col) => col.items.some((f) => f.refKey === "person.primary_contact_name")))).toBe(true);
    });
});

describe("child row template nested fields", () => {
    it("accepts Program + Desired Start + DOB in the same configured row", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "children_enrollment", {
            title: "Child row",
            blockType: "child_row_template",
            dataContext: "child",
        });
        if (!insert.ok) throw new Error(insert.error);

        const layout = listCustomBlockRowLayout(findBlock(insert.doc, insert.blockItemId)!);
        const row = layout[1];
        expect(row?.columnCount).toBe(3);
        expect(row?.columns[0]?.items[0]?.refKey).toBe("child.program");
        expect(row?.columns[1]?.items[0]?.refKey).toBe("child.desired_start_date");
        expect(row?.columns[2]?.items[0]?.refKey).toBe("child.dob_age");

        const runtimeLayout = resolveChildRowTemplateRowLayout(findBlock(insert.doc, insert.blockItemId)!);
        expect(runtimeLayout?.[1]?.slots[0]?.refKey).toBe("child.program");
        expect(runtimeLayout?.[1]?.slots[1]?.refKey).toBe("child.desired_start_date");
        expect(runtimeLayout?.[1]?.slots[2]?.refKey).toBe("child.dob_age");
    });
});

describe("block context field picker", () => {
    it("defaults contact block picker to role-aware fields first", () => {
        const refs = contactRoleFieldRefs("secondary");
        const groups = buildBlockContextFieldPickerGroups({
            dataContext: "contact",
            contactRole: "secondary",
        });
        expect(groups[0]?.entityKey).toBe("contact_role");
        expect(groups[0]?.fields[0]?.refKey).toBe(refs.name);
        expect(groups[0]?.fields.map((f) => f.refKey)).toEqual([refs.name, refs.email, refs.phone]);
    });

    it("defaults child row template picker to child row fields first", () => {
        const groups = buildBlockContextFieldPickerGroups({
            dataContext: "child",
            isChildRowTemplate: true,
        });
        expect(groups[0]?.entityKey).toBe("child_row");
        expect(groups[0]?.fields[0]?.refKey).toBe("child.name");
    });
});

describe("runtime nested block rows", () => {
    it("field_group nested rows expose side-by-side columns for preview/runtime", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Runtime block",
            blockType: "custom_layout_block",
            dataContext: "contact",
        });
        if (!insert.ok) throw new Error(insert.error);
        let doc = addRowToCustomBlock(insert.doc, insert.blockItemId, 2);
        const rowIndex = (findBlock(doc, insert.blockItemId)?.rows?.length ?? 1) - 1;
        const email = addFieldToCustomBlockRow(doc, insert.blockItemId, rowIndex, 0, EMAIL_FIELD);
        if (!email.ok) throw new Error(email.error);
        doc = email.doc;
        const phone = addFieldToCustomBlockRow(doc, insert.blockItemId, rowIndex, 1, PHONE_FIELD);
        if (!phone.ok) throw new Error(phone.error);

        const block = findBlock(phone.doc, insert.blockItemId)!;
        expect(block.kind).toBe("field_group");
        expect(block.rows?.[rowIndex]?.columns.length).toBe(2);
        expect(block.rows?.[rowIndex]?.columns[0]?.items[0]?.refKey).toBe("person.primary_email");
        expect(block.rows?.[rowIndex]?.columns[1]?.items[0]?.refKey).toBe("person.primary_phone");
    });
});
