import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFormSystemFieldPicker } from "@/lib/fields/formFieldRegistryPicker";
import {
    CHILDCARE_CANONICAL_OPERATOR_FIELDS,
    CHILDCARE_PROGRAM_FIELD_MODEL,
    childcareFieldCatalogClass,
    isChildcareCanonicalField,
    isChildcareFieldsHubVisibleEntity,
    isChildcareLegacyOrSystemField,
    isChildcareOperatorPickerVisible,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import { isOperatorHiddenField } from "@/lib/fields/fieldSettingsOperatorUi";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { fieldDefToCatalog, mergeCatalogWithCuratedFallback } from "@/lib/layout/fieldCatalog";

const root = resolve(__dirname, "../..");

describe("childcareFieldCatalogDoctrine", () => {
    it("hides legacy home-services location fields by default", () => {
        for (const key of ["access_method", "customer_id", "vendor_id", "beds", "home_type"]) {
            expect(isChildcareLegacyOrSystemField("location", key)).toBe(true);
            expect(isOperatorHiddenField("location", { field_key: key, is_system: true, label: key })).toBe(true);
        }
    });

    it("includes childcare canonical location fields as operator configurable", () => {
        for (const key of ["license_capacity", "director_name", "director_email", "site_phone"]) {
            expect(isChildcareCanonicalField("location", key)).toBe(true);
            expect(isChildcareOperatorPickerVisible("location", key, { is_system: true })).toBe(true);
        }
    });

    it("excludes job/work-order fields from enrollment surfaces", () => {
        for (const key of ["title", "service_key", "is_recurring", "completed_at", "scheduled_at"]) {
            expect(isChildcareLegacyOrSystemField("job", key)).toBe(true);
            expect(isChildcareOperatorPickerVisible("job", key, { is_system: true })).toBe(false);
        }
        expect(isChildcareFieldsHubVisibleEntity("job")).toBe(false);
    });

    it("excludes legacy opportunity home-services fields", () => {
        for (const key of ["job_date", "job_time_window", "specialty_cleaning_type"]) {
            expect(isChildcareLegacyOrSystemField("opportunity", key)).toBe(true);
        }
    });

    it("includes inquiry child desired program category canonical field", () => {
        expect(CHILDCARE_CANONICAL_OPERATOR_FIELDS.inquiry_child).toContain("desired_program_category_id");
        expect(isChildcareOperatorPickerVisible("inquiry_child", "desired_program_category_id", { is_system: true })).toBe(
            true
        );
        expect(isChildcareLegacyOrSystemField("inquiry_child", "desired_program_type")).toBe(true);
    });

    it("program field model points at OCM desired_program_category_id with location-scoped options", () => {
        expect(CHILDCARE_PROGRAM_FIELD_MODEL.canonical_field_key).toBe("desired_program_category_id");
        expect(CHILDCARE_PROGRAM_FIELD_MODEL.storage_table).toBe("opportunity_customer_members");
        expect(CHILDCARE_PROGRAM_FIELD_MODEL.option_source).toBe("programs_for_location");
        expect(CHILDCARE_PROGRAM_FIELD_MODEL.depends_on_field_key).toBe("location_id");
    });

    it("legacy fields remain available behind system/workflow toggle classification", () => {
        expect(childcareFieldCatalogClass("location", "access_method")).toBe("legacy_home_services");
        expect(childcareFieldCatalogClass("inquiry_child", "outcome_status_key")).toBe("system_workflow");
        expect(
            isOperatorHiddenField("inquiry_child", {
                field_key: "outcome_status_key",
                is_system: true,
                label: "Status",
            })
        ).toBe(true);
    });

    it("canonical fields appear in layout picker merge", () => {
        const row = {
            field_key: "desired_program_category_id",
            label: "Program",
            field_type: "select",
        };
        const catalog = fieldDefToCatalog("inquiry_child", row);
        expect(catalog.refKey).toBe("inquiry_child.desired_program_category_id");
        const merged = mergeCatalogWithCuratedFallback("inquiry_child", [catalog]);
        expect(merged.some((f) => f.fieldKey === "desired_program_category_id")).toBe(true);
    });

    it("canonical fields appear in forms picker", () => {
        const picker = buildFormSystemFieldPicker(
            [
                {
                    entity_type: "inquiry_child",
                    field_key: "desired_program_category_id",
                    field_type: "select",
                    label: "Program",
                    is_system: true,
                    is_active: true,
                },
                {
                    entity_type: "inquiry_child",
                    field_key: "desired_start_date",
                    field_type: "date",
                    label: "Desired start date",
                    is_system: true,
                    is_active: true,
                },
            ],
            []
        );
        expect(picker.some((e) => e.field_key === "desired_program_category_id")).toBe(true);
        expect(picker.some((e) => e.default_label === "Desired start date")).toBe(true);
        expect(picker.some((e) => e.field_key === "access_method")).toBe(false);
    });

    it("canonical fields appear in business process stage requirements palette", () => {
        const palette = mergeLifecycleFieldPaletteForStage("waitlist", {
            child: [
                {
                    field_key: "desired_program_category_id",
                    label: "Program",
                    entity_type: "inquiry_child",
                    is_system: true,
                    is_active: true,
                },
                {
                    field_key: "desired_start_date",
                    label: "Desired start date",
                    entity_type: "inquiry_child",
                    is_system: true,
                    is_active: true,
                },
            ],
        });
        expect(palette.some((f) => f.field_key === "desired_program_category_id")).toBe(true);
        expect(palette.some((f) => f.field_key === "access_method")).toBe(false);
    });

    it("legacy fields do not appear in forms or BP pickers by default", () => {
        const formsPicker = buildFormSystemFieldPicker(
            [
                {
                    entity_type: "location",
                    field_key: "access_method",
                    field_type: "select",
                    label: "Access method",
                    is_system: true,
                    is_active: true,
                },
            ],
            []
        );
        expect(formsPicker).toHaveLength(0);
    });

    it("E1 repair migration is idempotent (no deletes, NOT EXISTS inserts)", () => {
        const sql = readFileSync(
            resolve(root, "../supabase/migrations/20260611120000_childcare_field_catalog_e1_repair.sql"),
            "utf8"
        );
        expect(sql).toContain("WHERE NOT EXISTS");
        expect(sql).not.toMatch(/DELETE FROM public\.field_definitions/i);
        expect(sql).toContain("desired_program_category_id");
        expect(sql).toContain("legacy_home_services");
    });
});
