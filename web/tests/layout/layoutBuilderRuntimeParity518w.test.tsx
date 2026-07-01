/**
 * Sprint 5.18W — unified inline edit configuration + age display support.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LayoutRuntimeBlockEditProvider } from "@/components/layout/LayoutRuntimeBlockEditContext";
import { deriveAgeFromDateOfBirth, formatAgeFromDateOfBirthIso, formatAgePartsDisplay } from "@/lib/fields/derived/ageFromDateOfBirth";
import { buildBlockContextFieldPickerGroups } from "@/lib/layout/layoutEditorBlockFieldCatalog";
import {
    readLayoutEditorBlockConfig,
    resolveLayoutRuntimeBlockEditMode,
    resolveLayoutRuntimeItemsEditMode,
} from "@/lib/layout/layoutEditorBlockConfig";
import { readLayoutEditorRowTemplateConfig } from "@/lib/layout/layoutEditorRowTemplateConfig";
import { patchLayoutEditorFieldEditable } from "@/lib/layout/layoutEditorCompositionModel";
import { patchLayoutEditorRelatedListConfig } from "@/lib/layout/layoutEditorRelatedListConfig";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import {
    layoutRuntimeCollectionColumnIsInlineEditable,
    layoutRuntimeFieldIsEditable,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import type { LayoutItem } from "@/lib/layout/layoutV2";

function householdContactBlock(): LayoutItem {
    return {
        id: "contact-block",
        kind: "field_group",
        refKey: "contact_block",
        metadata: { layoutEditorBlockConfig: { editMode: "inline_editable", blockType: "contact_card" } },
        rows: [
            {
                id: "row-1",
                columns: [
                    {
                        id: "col-1",
                        width: 12,
                        items: [
                            { id: "phone", kind: "field", refKey: "person.primary_phone", label: "Phone" },
                            { id: "email", kind: "field", refKey: "person.primary_email", label: "Email" },
                        ],
                    },
                ],
            },
        ],
    };
}

function childrenRelatedList(overrides?: Partial<LayoutItem>): LayoutItem {
    return {
        id: "rl-children",
        kind: "related_list",
        refKey: "children",
        source: "children",
        displayMode: "table",
        metadata: {
            layoutEditorBlockConfig: { editMode: "inline_editable", blockType: "child_row_template" },
            layoutEditorRowTemplate: { actions: ["edit_enrollment"] },
        },
        columns: [
            { refKey: "child.name", label: "Child name" },
            { refKey: "child.location", label: "School", editable: true },
            { refKey: "child.status", label: "Enrollment status", editable: true },
            { refKey: "child.dob_age", label: "Age" },
        ],
        ...overrides,
    };
}

describe("layoutBuilderRuntimeParity 5.18W", () => {
    describe("canonical edit configuration", () => {
        it("phone/email do not trigger Edit unless editable: true", () => {
            const contactBlock = householdContactBlock();
            expect(resolveLayoutRuntimeBlockEditMode(contactBlock, readLayoutEditorBlockConfig(contactBlock.metadata))).toBe(
                "display_only",
            );
            expect(
                layoutRuntimeFieldIsEditable({ refKey: "person.primary_phone", editable: false }, "production"),
            ).toBe(false);
            expect(
                layoutRuntimeFieldIsEditable({ refKey: "person.primary_email", editable: false }, "production"),
            ).toBe(false);
        });

        it("standalone editable location field triggers column edit_button", () => {
            const items: LayoutItem[] = [
                { id: "loc", kind: "field", refKey: "opportunity.location_id", label: "Location", editable: true },
                { id: "phone", kind: "field", refKey: "person.primary_phone", label: "Phone" },
            ];
            expect(resolveLayoutRuntimeItemsEditMode(items)).toBe("edit_button");
        });

        it("related list shows Edit when one column has editable: true", () => {
            const item = childrenRelatedList();
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe("edit_button");
            const html = renderToStaticMarkup(
                <LayoutRuntimeBlockEditProvider editMode="edit_button">
                    <button type="button" data-testid={`layout-runtime-block-edit-${item.id}`}>
                        Edit
                    </button>
                </LayoutRuntimeBlockEditProvider>,
            );
            expect(html).toContain('data-testid="layout-runtime-block-edit-rl-children"');
        });

        it("related list does not show Edit when only row actions are enabled", () => {
            const item = childrenRelatedList({
                columns: [{ refKey: "child.name", label: "Child name" }],
                metadata: {
                    layoutEditorBlockConfig: { editMode: "inline_editable" },
                    layoutEditorRowTemplate: { actions: ["edit_enrollment", "open_child_drawer"] },
                },
            });
            expect(readLayoutEditorRowTemplateConfig(item.metadata).actions).toContain("edit_enrollment");
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe(
                "display_only",
            );
        });

        it("field and related-list column share editable metadata shape", () => {
            const fieldEditable = layoutRuntimeFieldIsEditable(
                { refKey: "opportunity.location_id", editable: true },
                "production",
            );
            const columnEditable = layoutRuntimeCollectionColumnIsInlineEditable(
                { refKey: "child.location", editable: true },
                "production",
            );
            expect(fieldEditable).toBe(true);
            expect(columnEditable).toBe(true);
        });

        it("block edit mode is derived from editable descendants — stored block editMode is ignored", () => {
            const item = childrenRelatedList({
                metadata: { layoutEditorBlockConfig: { editMode: "display_only" } },
            });
            expect(readLayoutEditorBlockConfig(item.metadata).editMode).toBe("display_only");
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe(
                "edit_button",
            );

            const displayOnly = childrenRelatedList({
                columns: [{ refKey: "child.name", label: "Child name" }],
                metadata: { layoutEditorBlockConfig: { editMode: "inline_editable" } },
            });
            expect(resolveLayoutRuntimeBlockEditMode(displayOnly, readLayoutEditorBlockConfig(displayOnly.metadata))).toBe(
                "display_only",
            );
        });

        it("default seeded fields are not implicitly editable", () => {
            const doc = buildLeadDrawerDefaultDoc();
            const household = doc.sections.find((s) => s.key === "household_contact");
            expect(household).toBeTruthy();
            const fields = household!.rows.flatMap((r) => r.columns.flatMap((c) => c.items)).filter((i) => i.kind === "field");
            for (const field of fields) {
                expect(field.editable).not.toBe(true);
            }
        });
    });

    describe("related-list column editable survives sync", () => {
        it("preserves column editable when section config syncs", () => {
            let doc = buildLeadDrawerDefaultDoc();
            const sectionKey = "children_enrollment";
            const sectionBefore = doc.sections.find((s) => s.key === sectionKey)!;
            const relatedBefore = sectionBefore.rows
                .flatMap((r) => r.columns.flatMap((c) => c.items))
                .find((i) => i.kind === "related_list");
            expect(relatedBefore).toBeTruthy();
            const locationIdx = relatedBefore!.columns!.findIndex((c) => c.refKey === "child.location");
            expect(locationIdx).toBeGreaterThanOrEqual(0);
            doc = patchLayoutEditorFieldEditable(
                doc,
                { kind: "column", sectionKey: sectionKey!, blockItemId: relatedBefore!.id, colIdx: locationIdx },
                true,
            );
            doc = patchLayoutEditorRelatedListConfig(doc, sectionKey!, {
                primaryRow: { fields: ["child.name", "child.dob_age", "child.location"] },
            });
            const section = doc.sections.find((s) => s.key === sectionKey)!;
            const related = section.rows.flatMap((r) => r.columns.flatMap((c) => c.items)).find((i) => i.kind === "related_list");
            expect(related?.columns?.find((c) => c.refKey === "child.location")?.editable).toBe(true);
        });
    });

    describe("age field support", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        const dob = "2022-02-15";
        const asOf = new Date("2024-06-15T12:00:00Z");

        it("formats age as years, years_months, months, and full_text", () => {
            const derived = deriveAgeFromDateOfBirth(dob, asOf);
            expect(derived?.value).toEqual({ years: 2, months: 4 });
            expect(formatAgePartsDisplay(2, 4, "years")).toBe("2y");
            expect(formatAgePartsDisplay(2, 4, "years_months")).toBe("2y 4m");
            expect(formatAgePartsDisplay(2, 4, "months")).toBe("28m");
            expect(formatAgePartsDisplay(2, 4, "full_text")).toBe("2 years 4 months");
            expect(formatAgeFromDateOfBirthIso(dob, "years_months", asOf)).toBe("2y 4m");
        });

        it("runtime repeater column applies configured age format from DOB", () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
            const row = { "child.date_of_birth": dob };
            const col = {
                refKey: "child.dob_age",
                label: "Age",
                metadata: { layoutEditorDisplay: { ageFormat: "years_months" } },
            };
            expect(formatLayoutRuntimeRepeaterColumnDisplay(row, col)).toBe("2y 4m");
            vi.useRealTimers();
        });

        it("child.dob_age is available in child-row field picker catalog", () => {
            const groups = buildBlockContextFieldPickerGroups({ dataContext: "child", isChildRowTemplate: true });
            const refs = groups.flatMap((g) => g.fields.map((f) => f.refKey));
            expect(refs).toContain("child.dob_age");
        });

        it("age remains computed from DOB — no stored age migration required", () => {
            const derived = deriveAgeFromDateOfBirth("2020-01-01");
            expect(derived?.kind).toBe("age_from_date_of_birth");
            expect(derived?.source_value).toBe("2020-01-01");
            expect(derived?.display).toBeTruthy();
        });
    });
});
