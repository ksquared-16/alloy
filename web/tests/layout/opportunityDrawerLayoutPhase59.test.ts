/**
 * Visual Layout Configuration Builder — Phase 5.9 tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    readLayoutEditorBlockConfig,
    writeLayoutEditorBlockConfig,
} from "@/lib/layout/layoutEditorBlockConfig";
import {
    isAllowedLayoutEditorDisplayType,
    isAllowedLayoutEditorLinkBehavior,
} from "@/lib/layout/layoutEditorConstraints";
import { readLayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import { validateLayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import { isLayoutEditorBlockRuntimeEffective } from "@/lib/layout/layoutEditorBlockRegistry";
import {
    addRowToCustomBlock,
    buildCustomLayoutBlock,
    createCustomBlockInSection,
    deleteCustomBlock,
    listCustomBlockRows,
    patchCustomBlockConfig,
    setCustomBlockRowColumnCount,
} from "@/lib/layout/layoutEditorFreeformBlocks";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";

describe("create custom block", () => {
    it("creates a named custom layout block in household section", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = createCustomBlockInSection(doc, "household_contact", {
            title: "Billing summary",
            blockType: "custom_layout_block",
            dataContext: "household",
            editMode: "display_only",
            showTitle: true,
        });
        expect(result.ok, result.ok ? "" : result.error).toBe(true);
        if (!result.ok) return;
        const item = result.doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.id === result.blockItemId);
        expect(item?.label).toBe("Billing summary");
        expect(item?.refKey).toBe("layout_block");
        expect(readLayoutEditorBlockConfig(item?.metadata).blockType).toBe("custom_layout_block");
    });

    it("renames block title via patchCustomBlockConfig", () => {
        const built = buildCustomLayoutBlock({
            title: "Old title",
            blockType: "card",
            dataContext: "lead",
        });
        let doc = buildLeadDrawerDefaultDoc();
        const insert = createCustomBlockInSection(doc, "household_contact", {
            title: "Old title",
            blockType: "card",
            dataContext: "lead",
        });
        if (!insert.ok) throw new Error(insert.error);
        doc = patchCustomBlockConfig(insert.doc, insert.blockItemId, { title: "Renamed block" });
        const item = doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.id === insert.blockItemId);
        expect(item?.label).toBe("Renamed block");
        expect(built.kind).toBe("field_group");
    });

    it("hides block title via showTitle metadata", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Hidden title block",
            blockType: "card",
            dataContext: "lead",
            showTitle: false,
        });
        if (!insert.ok) throw new Error(insert.error);
        const item = insert.doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.id === insert.blockItemId);
        expect(readLayoutEditorBlockConfig(item?.metadata).showTitle).toBe(false);
    });

    it("deletes custom block", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Temp",
            blockType: "row_group",
            dataContext: "lead",
        });
        if (!insert.ok) throw new Error(insert.error);
        const next = deleteCustomBlock(insert.doc, "household_contact", insert.blockItemId);
        const found = next.sections
            .find((s) => s.key === "household_contact")
            ?.rows.flatMap((r) => r.columns.flatMap((c) => c.items))
            .some((it) => it.id === insert.blockItemId);
        expect(found).toBe(false);
    });
});

describe("row builder inside blocks", () => {
    it("adds rows to custom block", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Contact layout",
            blockType: "custom_layout_block",
            dataContext: "contact",
        });
        if (!insert.ok) throw new Error(insert.error);
        let doc = addRowToCustomBlock(insert.doc, insert.blockItemId, 1);
        doc = addRowToCustomBlock(doc, insert.blockItemId, 2);
        const item = doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.id === insert.blockItemId);
        expect(item?.rows?.length).toBeGreaterThanOrEqual(3);
    });

    it("contact card starter rows include Full Name then Email + Phone", () => {
        const block = buildCustomLayoutBlock({
            title: "Primary Contact",
            blockType: "contact_card",
            dataContext: "contact",
            contactRole: "primary",
        });
        const rows = listCustomBlockRows(block);
        expect(rows[0]?.fields[0]?.label).toBe("Full name");
        expect(rows[1]?.columnCount).toBe(2);
        expect(rows[1]?.fields.map((f) => f.label)).toEqual(["Email", "Phone"]);
    });

    it("places Program + Desired Start Date + DOB on same child row template columns", () => {
        const block = buildCustomLayoutBlock({
            title: "Children",
            blockType: "child_row_template",
            dataContext: "child",
        });
        const rows = listCustomBlockRows(block);
        const refs = rows[0]?.fields.map((f) => f.refKey) ?? [];
        expect(refs).toContain("child.program");
        expect(refs).toContain("child.desired_start_date");
        expect(refs).toContain("child.dob_age");
    });

    it("supports multi-field row via column count patch", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Two-up",
            blockType: "row_group",
            dataContext: "contact",
            columnCount: 1,
        });
        if (!insert.ok) throw new Error(insert.error);
        const doc = setCustomBlockRowColumnCount(insert.doc, insert.blockItemId, 0, 2);
        const item = doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.id === insert.blockItemId);
        expect(item?.rows?.[0]?.columns.length).toBe(2);
    });
});

describe("contact role blocks", () => {
    it("secondary contact role generates role-aware field refs", () => {
        const block = buildCustomLayoutBlock({
            title: "Secondary Contact",
            blockType: "contact_card",
            dataContext: "contact",
            contactRole: "secondary",
        });
        expect(readLayoutEditorContactRole(block.metadata)).toBe("secondary");
        const rows = listCustomBlockRows(block);
        expect(rows[0]?.fields[0]?.refKey).toBe("person.secondary_contact_name");
        expect(rows[1]?.fields[0]?.refKey).toBe("person.secondary_email");
        expect(rows[1]?.fields[1]?.refKey).toBe("person.secondary_phone");
    });

    it("defaults secondary visibility to show when matching role exists", () => {
        const block = buildCustomLayoutBlock({
            title: "Secondary Contact",
            blockType: "contact_card",
            dataContext: "contact",
            contactRole: "secondary",
        });
        expect(readLayoutEditorBlockConfig(block.metadata).visibilityRule).toBe("show_when_matching_role_exists");
        expect(block.visibleWhen?.type).toBe("exists");
        expect(block.visibleWhen?.path).toBe("person.secondary_contact_name");
    });
});

describe("edit behavior metadata", () => {
    it("persists edit button mode", () => {
        const block = buildCustomLayoutBlock({
            title: "Editable card",
            blockType: "card",
            dataContext: "lead",
            editMode: "edit_button",
        });
        expect(readLayoutEditorBlockConfig(block.metadata).editMode).toBe("edit_button");
    });

    it("persists display-only mode", () => {
        const block = buildCustomLayoutBlock({
            title: "Read-only card",
            blockType: "card",
            dataContext: "lead",
            editMode: "display_only",
        });
        expect(readLayoutEditorBlockConfig(block.metadata).editMode).toBe("display_only");
    });
});

describe("runtime-effective custom blocks", () => {
    it("marks layout_block refKey as structurally allowed", () => {
        const insert = createCustomBlockInSection(buildLeadDrawerDefaultDoc(), "household_contact", {
            title: "Runtime block",
            blockType: "custom_layout_block",
            dataContext: "household",
        });
        if (!insert.ok) throw new Error(insert.error);
        const errors = validateLayoutDocForSurface(insert.doc, "opportunity_drawer").errors;
        expect(errors.some((e) => e.includes("layout_block"))).toBe(false);
    });

    it("custom contact card template is runtime effective", () => {
        expect(isLayoutEditorBlockRuntimeEffective("contact_custom")).toBe(true);
    });
});

describe("registry constraints", () => {
    it("rejects invalid display type", () => {
        expect(validateLayoutEditorDisplayConfig({ displayType: "not_a_type" as never }, "test")).not.toHaveLength(0);
        expect(isAllowedLayoutEditorDisplayType("text")).toBe(true);
        expect(isAllowedLayoutEditorDisplayType("not_a_type")).toBe(false);
    });

    it("rejects invalid link behavior via constraint helper", () => {
        expect(isAllowedLayoutEditorLinkBehavior("open_drawer")).toBe(true);
        expect(isAllowedLayoutEditorLinkBehavior("launch_missiles")).toBe(false);
    });

    it("stores block config in allowed metadata keys", () => {
        const metadata = writeLayoutEditorBlockConfig(undefined, {
            blockType: "card",
            dataContext: "lead",
            editMode: "edit_button",
            showTitle: true,
        });
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.key === "household_contact");
        const col = section?.rows[0]?.columns[1] ?? section?.rows[0]?.columns[0];
        if (!col) throw new Error("missing column");
        col.items.push({
            id: "grp-test-59",
            kind: "field_group",
            refKey: "layout_block",
            label: "Test",
            metadata,
            rows: [],
        });
        const errors = validateLayoutDocForSurface(doc, "opportunity_drawer").errors;
        expect(errors.filter((e) => e.includes("layoutEditorBlockConfig"))).toHaveLength(0);
    });
});
