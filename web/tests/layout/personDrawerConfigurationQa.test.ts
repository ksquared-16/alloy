/**
 * Person drawer configuration QA — conditional visibility, editability, household contacts, stacked layouts.
 */

import { describe, expect, it } from "vitest";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { addSectionFieldItem } from "@/lib/layout/layoutEditorSectionComposition";
import { applyLayoutEditorFieldSettingsPatch } from "@/lib/layout/layoutEditorCompositionModel";
import { findLayoutItemLocation } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import {
    buildCrossFieldVisibilityCondition,
    LAYOUT_EDITOR_CROSS_FIELD_VISIBILITY_METADATA_KEY,
    readLayoutEditorCrossFieldVisibilityDraft,
    resolveLayoutEditorFieldVisibilityRule,
} from "@/lib/layout/layoutEditorVisibilityRules";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import {
    isLayoutRuntimeEditableRefKeySupported,
    layoutRuntimeFieldIsEditable,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    buildLayoutRuntimePersonNativePatch,
    collectLayoutRuntimePersonNativeBaseline,
    isLayoutRuntimePersonNativeEditableRefKey,
} from "@/lib/layout/runtime/layoutRuntimePersonNativeFieldEdit";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import { enrichPersonDrawerSecondaryContactScalars } from "@/lib/layout/runtime/enrichPersonDrawerSecondaryContactScalars";
import {
    applySectionRowLayout,
    segmentSectionsForRowLayout,
    sectionStackedRowGroupGridStyle,
} from "@/lib/layout/layoutEditorSectionLayout";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";

const EMPLOYEE_FIELD: LayoutCatalogField = {
    entityKey: "person",
    entityLabel: "Parent / Contact",
    fieldKey: "is_employee",
    fieldLabel: "Employee",
    fieldType: "boolean",
    refKey: "person.is_employee",
};

const EMPLOYEE_ID_FIELD: LayoutCatalogField = {
    entityKey: "person",
    entityLabel: "Parent / Contact",
    fieldKey: "employee_id",
    fieldLabel: "Employee ID",
    fieldType: "text",
    refKey: "person.employee_id",
};

describe("person drawer configuration QA", () => {
    it("persists conditional visibility draft when sourcePath is empty", () => {
        let doc = buildPersonDrawerDefaultDoc();
        const added = addSectionFieldItem(doc, "contact_information", 0, 0, EMPLOYEE_ID_FIELD, {
            surfaceKey: "person_drawer",
        });
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        doc = added.doc;
        const item = doc.sections
            .flatMap((section) => section.rows.flatMap((row) => row.columns.flatMap((col) => col.items)))
            .find((entry) => entry.refKey === "person.employee_id");
        expect(item).toBeTruthy();
        if (!item) return;

        doc = applyLayoutEditorFieldSettingsPatch(
            doc,
            { kind: "field", sectionKey: "contact_information", itemId: item.id },
            {
                visibility: "conditional",
                crossFieldVisibility: { sourcePath: "", operator: "equals", value: "" },
            },
            item.refKey,
        );

        const loc = findLayoutItemLocation(doc, item.id);
        expect(loc?.item.metadata?.[LAYOUT_EDITOR_CROSS_FIELD_VISIBILITY_METADATA_KEY]).toEqual({
            sourcePath: "",
            operator: "equals",
            value: "",
        });
        expect(resolveLayoutEditorFieldVisibilityRule(loc!.item, loc!.item.refKey)).toBe("conditional");
        expect(loc?.item.visibleWhen).toBeUndefined();
    });

    it("writes visibleWhen once conditional sourcePath is configured", () => {
        let doc = buildPersonDrawerDefaultDoc();
        const added = addSectionFieldItem(doc, "contact_information", 0, 0, EMPLOYEE_ID_FIELD, {
            surfaceKey: "person_drawer",
        });
        expect(added.ok).toBe(true);
        if (!added.ok) return;
        doc = added.doc;
        const item = doc.sections
            .flatMap((section) => section.rows.flatMap((row) => row.columns.flatMap((col) => col.items)))
            .find((entry) => entry.refKey === "person.employee_id");
        if (!item) return;

        doc = applyLayoutEditorFieldSettingsPatch(
            doc,
            { kind: "field", sectionKey: "contact_information", itemId: item.id },
            {
                crossFieldVisibility: {
                    sourcePath: "person.is_employee",
                    operator: "is_true",
                },
            },
            item.refKey,
        );

        const loc = findLayoutItemLocation(doc, item.id);
        expect(loc?.item.visibleWhen).toEqual(buildCrossFieldVisibilityCondition({
            sourcePath: "person.is_employee",
            operator: "is_true",
        }));
        expect(readLayoutEditorCrossFieldVisibilityDraft(loc!.item, loc!.item.refKey)).toEqual({
            sourcePath: "person.is_employee",
            operator: "is_true",
        });
        expect(validateLayoutDocForSurface(doc, "person_drawer").ok).toBe(true);
    });

    it("runtime hides employee id when employee flag is false", () => {
        const condition = buildCrossFieldVisibilityCondition({
            sourcePath: "person.is_employee",
            operator: "is_true",
        })!;
        expect(evaluateLayoutCondition({ "person.is_employee": true }, condition)).toBe(true);
        expect(evaluateLayoutCondition({ "person.is_employee": false }, condition)).toBe(false);
    });

    it("allows inline editable only for person fields with writeback adapters", () => {
        expect(isLayoutRuntimePersonNativeEditableRefKey("person.employer")).toBe(true);
        expect(isLayoutRuntimeEditableRefKeySupported("person.employer")).toBe(true);
        expect(isLayoutRuntimeEditableRefKeySupported("person.unsupported_field")).toBe(false);
    });

    it("builds person native patch for employee fields", () => {
        const baseline = collectLayoutRuntimePersonNativeBaseline({
            "person.is_employee": false,
            "person.employee_id": "",
        });
        const draft = {
            ...baseline,
            "person.is_employee": "true",
            "person.employee_id": "E-100",
        };
        expect(buildLayoutRuntimePersonNativePatch(baseline, draft)).toEqual({
            is_employee: true,
            employee_id: "E-100",
        });
    });

    it("marks configured employee fields editable in production runtime", () => {
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "person.is_employee" },
                "production",
            ),
        ).toBe(true);
        expect(
            layoutRuntimeFieldIsEditable(
                { editable: true, refKey: "person.employer" },
                "production",
            ),
        ).toBe(true);
    });

    it("enriches secondary contact scalars from household resolver", () => {
        const record = enrichPersonDrawerSecondaryContactScalars({
            id: "person-primary",
            "person.id": "person-primary",
            _household_adult_links: [
                {
                    person_id: "person-secondary",
                    display_name: "Jordan Parent",
                    role_type: "parent",
                },
            ],
            _customer_persons: [
                {
                    person_id: "person-secondary",
                    email: "jordan@example.com",
                    phone: "555-333-4444",
                },
            ],
        });
        expect(record["person.secondary_contact_name"]).toBe("Jordan Parent");
        expect(record["person.secondary_email"]).toBe("jordan@example.com");
        expect(record["person.secondary_phone"]).toBe("555-333-4444");
    });

    it("buildPersonLayoutRuntimeRecordFromVm projects secondary parent from household links", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "person-primary",
            vmRecord: {
                id: "person-primary",
                first_name: "Alex",
                last_name: "Primary",
                _household_adult_links: [
                    {
                        person_id: "person-secondary",
                        display_name: "Sam Secondary",
                        role_type: "parent",
                    },
                ],
                _customer_persons: [
                    {
                        person_id: "person-secondary",
                        email: "sam@example.com",
                    },
                ],
            },
        });
        expect(record["person.secondary_contact_name"]).toBe("Sam Secondary");
        expect(record["person.secondary_email"]).toBe("sam@example.com");
    });

    it("segments half + stacked-half row groups for builder and runtime flow", () => {
        let doc = buildPersonDrawerDefaultDoc();
        const zoneSections = doc.sections.filter((section) => section.key !== "drawer_header");
        const anchor = zoneSections[0]?.key;
        const middle = zoneSections[1]?.key;
        const trailing = zoneSections[2]?.key;
        if (!anchor || !middle || !trailing) return;

        doc = applySectionRowLayout(doc, anchor, "half_stacked_right");
        const grouped = doc.sections.filter((section) =>
            [anchor, middle, trailing].includes(section.key),
        );
        const segments = segmentSectionsForRowLayout(grouped);
        expect(segments[0]?.kind).toBe("stacked_row");
        if (segments[0]?.kind === "stacked_row") {
            expect(segments[0].layout).toBe("stacked_right_equal");
            expect(sectionStackedRowGroupGridStyle(segments[0].layout).gridTemplateColumns).toBe("1fr 1fr");
        }
    });

    it("documents sms/email opt-in source alignment with communications eligibility", () => {
        const baseline = collectLayoutRuntimePersonNativeBaseline({
            "person.sms_opt_in": true,
            "person.email_opt_in": false,
            sms_opt_in: true,
            email_opt_in: false,
            metadata: { sms_opt_in: true, email_opt_in: false },
        });
        expect(baseline["person.sms_opt_in"]).toBe("true");
        expect(baseline["person.email_opt_in"]).toBe("false");
        expect(isLayoutRuntimeEditableRefKeySupported("person.sms_opt_in")).toBe(true);
        expect(isLayoutRuntimeEditableRefKeySupported("person.email_opt_in")).toBe(true);
    });
});

describe("person drawer configuration QA — employee field pairing", () => {
    it("can configure employee + employee id on same doc", () => {
        let doc = buildPersonDrawerDefaultDoc();
        const employee = addSectionFieldItem(doc, "contact_information", 0, 0, EMPLOYEE_FIELD, {
            surfaceKey: "person_drawer",
        });
        expect(employee.ok).toBe(true);
        if (!employee.ok) return;
        doc = employee.doc;
        const employeeId = addSectionFieldItem(doc, "contact_information", 0, 0, EMPLOYEE_ID_FIELD, {
            surfaceKey: "person_drawer",
        });
        expect(employeeId.ok).toBe(true);
    });
});
