/**
 * Sprint 5.18X — one section Edit button + canonical field settings metadata.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutRuntimeBlockEditProvider } from "@/components/layout/LayoutRuntimeBlockEditContext";
import {
    applyLayoutEditorFieldSettingsPatch,
    resolveLayoutEditorFieldNodeFromSerializedPath,
} from "@/lib/layout/layoutEditorCompositionModel";
import { resolveLayoutRuntimeSectionEditMode } from "@/lib/layout/layoutEditorBlockConfig";
import { readLayoutEditorRowTemplateConfig } from "@/lib/layout/layoutEditorRowTemplateConfig";
import {
    layoutRuntimeCollectionColumnIsInlineEditable,
    layoutRuntimeFieldIsEditable,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";

function householdSection(): LayoutSection {
    return {
        id: "hc",
        key: "household_contact",
        title: "Household",
        rows: [
            {
                id: "row-1",
                columns: [
                    {
                        id: "col-1",
                        width: 6,
                        items: [
                            {
                                id: "loc",
                                kind: "field",
                                refKey: "opportunity.location_id",
                                label: "Location",
                                editable: true,
                            },
                            {
                                id: "phone",
                                kind: "field",
                                refKey: "person.primary_phone",
                                label: "Phone",
                            },
                        ],
                    },
                    {
                        id: "col-2",
                        width: 6,
                        items: [
                            {
                                id: "contact-block",
                                kind: "field_group",
                                refKey: "contact_block",
                                rows: [
                                    {
                                        id: "g-row",
                                        columns: [
                                            {
                                                id: "g-col",
                                                width: 12,
                                                items: [
                                                    {
                                                        id: "email",
                                                        kind: "field",
                                                        refKey: "person.primary_email",
                                                        label: "Email",
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

function childrenRelatedListItem(overrides?: Partial<LayoutItem>): LayoutItem {
    return {
        id: "rl-children",
        kind: "related_list",
        refKey: "children",
        source: "children",
        displayMode: "table",
        metadata: {
            layoutEditorRowTemplate: { actions: ["edit_enrollment"] },
        },
        columns: [
            { refKey: "child.name", label: "Name" },
            { refKey: "child.date_of_birth", label: "DOB", editable: true },
            { refKey: "child.dob_age", label: "Age" },
            { refKey: "child.location", label: "School", editable: true },
            { refKey: "child.status", label: "Enrollment status", editable: true },
        ],
        ...overrides,
    };
}

function childrenEnrollmentSection(overrides?: Partial<LayoutItem>): LayoutSection {
    return {
        id: "ce",
        key: "children_enrollment",
        title: "Children",
        rows: [
            {
                id: "row-1",
                columns: [{ id: "col-1", width: 12, items: [childrenRelatedListItem(overrides)] }],
            },
        ],
    };
}

describe("layoutBuilderRuntimeParity 5.18X", () => {
    it("household section resolves one section-level edit_button when multiple editable descendants exist", () => {
        const section = householdSection();
        expect(resolveLayoutRuntimeSectionEditMode(section)).toBe("edit_button");
    });

    it("field-level Edit toggles are not rendered inside card content — only section header", () => {
        const source = readFileSync(
            resolve(__dirname, "../../components/layout/LayoutRuntimePlanView.tsx"),
            "utf8",
        );
        expect(source).toContain("function SectionHeaderEditAction");
        expect(source).toContain('return <LayoutRuntimeBlockEditToggle itemId={sectionKey} blockEdit={blockEdit} />');
        expect(source).not.toMatch(/GroupCell[\s\S]*?LayoutRuntimeBlockEditToggle/);
        expect(source).not.toMatch(/RelatedCell[\s\S]*?LayoutRuntimeBlockEditToggle/);
        expect(source).not.toMatch(/ColumnEditShell/);
        const editToggleCount = (source.match(/function LayoutRuntimeBlockEditToggle/g) ?? []).length;
        expect(editToggleCount).toBe(1);
    });

    it("related-list column editable metadata is read consistently by serialized path resolver", () => {
        const doc: LayoutDoc = {
            formatVersion: 1,
            surface: "drawer",
            entityType: "opportunities",
            metadata: {},
            sections: [childrenEnrollmentSection()],
        };
        const node = resolveLayoutEditorFieldNodeFromSerializedPath(
            doc,
            "column:children_enrollment:rl-children:1",
        );
        expect(node?.refKey).toBe("child.date_of_birth");
        expect(node?.editable).toBe(true);

        const propertiesStyleNode = {
            editable: doc.sections[0]!.rows[0]!.columns[0]!.items[0]!.columns![1]!.editable === true,
        };
        expect(propertiesStyleNode.editable).toBe(node?.editable);
    });

    it("related list section Edit appears when DOB column is editable", () => {
        const section = childrenEnrollmentSection();
        expect(resolveLayoutRuntimeSectionEditMode(section)).toBe("edit_button");
        const html = renderToStaticMarkup(
            <LayoutRuntimeBlockEditProvider editMode="edit_button">
                <button type="button" data-testid="layout-runtime-block-edit-children_enrollment">
                    Edit
                </button>
            </LayoutRuntimeBlockEditProvider>,
        );
        expect(html).toContain('data-testid="layout-runtime-block-edit-children_enrollment"');
    });

    it("row action edit_enrollment does not cause section Edit", () => {
        const section = childrenEnrollmentSection({
            columns: [{ refKey: "child.name", label: "Name" }],
            metadata: {
                layoutEditorBlockConfig: { editMode: "inline_editable" },
                layoutEditorRowTemplate: { actions: ["edit_enrollment", "open_child_drawer"] },
            },
        });
        expect(readLayoutEditorRowTemplateConfig(section.rows[0]!.columns[0]!.items[0]!.metadata).actions).toContain(
            "edit_enrollment",
        );
        expect(resolveLayoutRuntimeSectionEditMode(section)).toBe("display_only");
    });

    it("save adapter alone does not cause section Edit", () => {
        expect(
            layoutRuntimeFieldIsEditable({ refKey: "opportunity.location_id", editable: false }, "production"),
        ).toBe(false);
        expect(
            layoutRuntimeCollectionColumnIsInlineEditable(
                { refKey: "child.date_of_birth", editable: false },
                "production",
            ),
        ).toBe(false);

        const section: LayoutSection = {
            id: "s",
            key: "main",
            title: "Main",
            rows: [
                {
                    id: "r",
                    columns: [
                        {
                            id: "c",
                            width: 12,
                            items: [
                                {
                                    id: "f1",
                                    kind: "field",
                                    refKey: "opportunity.location_id",
                                    label: "Location",
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        expect(resolveLayoutRuntimeSectionEditMode(section)).toBe("display_only");
    });

    it("canonical field settings writes one metadata shape for field items and related-list columns", () => {
        const fieldDoc: LayoutDoc = {
            formatVersion: 1,
            surface: "drawer",
            entityType: "opportunities",
            metadata: {},
            sections: [
                {
                    id: "s",
                    key: "main",
                    title: "Main",
                    rows: [
                        {
                            id: "r",
                            columns: [
                                {
                                    id: "c",
                                    width: 12,
                                    items: [
                                        {
                                            id: "f1",
                                            kind: "field",
                                            refKey: "opportunity.location_id",
                                            label: "Location",
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        const fieldNode = resolveLayoutEditorFieldNodeFromSerializedPath(fieldDoc, "field:main:f1");
        expect(fieldNode).toBeTruthy();
        const afterField = applyLayoutEditorFieldSettingsPatch(fieldDoc, fieldNode!.path, { editable: true });
        expect(afterField.sections[0]!.rows[0]!.columns[0]!.items[0]!.editable).toBe(true);
        expect(
            layoutRuntimeFieldIsEditable(afterField.sections[0]!.rows[0]!.columns[0]!.items[0]!, "production"),
        ).toBe(true);

        let columnDoc: LayoutDoc = {
            formatVersion: 1,
            surface: "drawer",
            entityType: "opportunities",
            metadata: {},
            sections: [childrenEnrollmentSection()],
        };
        const columnNode = resolveLayoutEditorFieldNodeFromSerializedPath(
            columnDoc,
            "column:children_enrollment:rl-children:1",
        );
        columnDoc = applyLayoutEditorFieldSettingsPatch(columnDoc, columnNode!.path, { editable: false }, columnNode!.refKey);
        const updatedColumn = resolveLayoutEditorFieldNodeFromSerializedPath(
            columnDoc,
            "column:children_enrollment:rl-children:1",
        );
        expect(updatedColumn?.editable).toBe(false);
        expect(
            layoutRuntimeCollectionColumnIsInlineEditable(
                columnDoc.sections[0]!.rows[0]!.columns[0]!.items[0]!.columns![1]!,
                "production",
            ),
        ).toBe(false);
    });
});
