import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFormSystemFieldPicker } from "@/lib/fields/formFieldRegistryPicker";
import {
    childcareFieldCatalogClass,
    isChildcareOperatorPickerVisible,
    isEnrollmentOperatorFieldVisible,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import { isOperatorHiddenField } from "@/lib/fields/fieldSettingsOperatorUi";
import {
    filterFieldRuleIdsToPalette,
    mergeLifecycleFieldPaletteForStage,
    validateFieldRuleIdsAgainstPalette,
} from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { customFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { fieldDefToCatalog, mergeCatalogWithCuratedFallback } from "@/lib/layout/fieldCatalog";

const root = resolve(__dirname, "../..");

function leadOrgFixture() {
    return {
        opportunity: [
            { field_key: "appointment_id", label: "Appointment ID", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "discount_amount", label: "Discount Amount", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "discount_code", label: "Discount Code", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "estimated_price", label: "Estimated Price", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "job_date", label: "Job Date", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "job_time_window", label: "Job Time Window", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "quote_subtotal", label: "Quote Subtotal", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "quote_total", label: "Quote Total", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "recurring_price", label: "Recurring Price", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "status_key", label: "Status Key", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "status_group", label: "Status Group", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "vertical", label: "Vertical", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "inquiry_source", label: "Inquiry source", entity_type: "opportunity", is_system: true, is_active: true },
            { field_key: "tour_date", label: "Tour date", entity_type: "opportunity", is_system: true, is_active: true },
        ],
        customer: [
            { field_key: "stripe_customer_id", label: "Stripe Customer ID", entity_type: "customer", is_system: true, is_active: true },
            { field_key: "external_id", label: "External ID", entity_type: "customer", is_system: true, is_active: true },
            { field_key: "external_source", label: "External Source", entity_type: "customer", is_system: true, is_active: true },
            { field_key: "vertical", label: "Vertical", entity_type: "customer", is_system: true, is_active: true },
            { field_key: "customer_type", label: "Customer Type", entity_type: "customer", is_system: true, is_active: true },
            { field_key: "name", label: "Family name", entity_type: "customer", is_system: true, is_active: true },
        ],
        child: [
            {
                field_key: "program_category_id",
                label: "Program",
                entity_type: "inquiry_child",
                is_system: true,
                is_active: true,
            },
            {
                field_key: "location_id",
                label: "Location",
                entity_type: "inquiry_child",
                is_system: true,
                is_active: true,
            },
            {
                field_key: "program_room_cohort_key",
                label: "Room",
                entity_type: "inquiry_child",
                is_system: true,
                is_active: true,
            },
            {
                field_key: "schedule_type",
                label: "Schedule",
                entity_type: "inquiry_child",
                is_system: true,
                is_active: true,
            },
            {
                field_key: "start_date",
                label: "Start Date",
                entity_type: "inquiry_child",
                is_system: true,
                is_active: true,
            },
            {
                field_key: "outcome_status_key",
                label: "Status",
                entity_type: "inquiry_child",
                is_system: true,
                is_active: true,
            },
            {
                field_key: "notes",
                label: "Notes",
                entity_type: "inquiry_child",
                is_system: true,
                is_active: true,
            },
        ],
    };
}

describe("enrollment field visibility convergence (E3)", () => {
    it("BP Stage Requirements Lead excludes quote/discount/job/pricing/status-key fields", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead", leadOrgFixture());
        const keys = palette.filter((f) => f.entity === "opportunity").map((f) => f.field_key);
        for (const hidden of [
            "appointment_id",
            "discount_amount",
            "discount_code",
            "estimated_price",
            "job_date",
            "job_time_window",
            "quote_subtotal",
            "quote_total",
            "recurring_price",
            "status_key",
            "status_group",
            "vertical",
        ]) {
            expect(keys).not.toContain(hidden);
        }
        expect(keys).toContain("inquiry_source");
    });

    it("BP Stage Requirements Family excludes Stripe/external/vertical/internal customer fields", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead", leadOrgFixture());
        const keys = palette.filter((f) => f.entity === "customer").map((f) => f.field_key);
        for (const hidden of [
            "stripe_customer_id",
            "external_id",
            "external_source",
            "vertical",
            "customer_type",
        ]) {
            expect(keys).not.toContain(hidden);
        }
        expect(keys).toContain("name");
    });

    it("BP Stage Requirements Child has a single canonical Program entry", () => {
        const palette = mergeLifecycleFieldPaletteForStage("waitlist", leadOrgFixture());
        const programEntries = palette.filter(
            (f) =>
                f.entity === "child" &&
                (f.field_key === "program_category_id" || f.rule_id === "child:program_interest")
        );
        expect(programEntries).toHaveLength(1);
        expect(programEntries[0]?.field_key).toBe("program_category_id");
    });

    it("BP Stage Requirements Child includes canonical Program and placement fields", () => {
        const palette = mergeLifecycleFieldPaletteForStage("waitlist", leadOrgFixture());
        const childKeys = palette.filter((f) => f.entity === "child").map((f) => f.field_key);
        expect(childKeys).toContain("program_category_id");
        expect(childKeys).toContain("location_id");
        expect(childKeys).toContain("program_room_cohort_key");
        expect(childKeys).toContain("schedule_type");
        expect(childKeys).toContain("start_date");
        expect(palette.some((f) => f.rule_id === "child:first_name")).toBe(true);
        expect(palette.some((f) => f.rule_id === "child:last_name")).toBe(true);
        expect(palette.some((f) => f.rule_id === "child:date_of_birth")).toBe(true);
    });

    it("BP palette uses same visibility helper as Fields and Forms", () => {
        for (const [entity, key] of [
            ["opportunity", "quote_total"],
            ["customer", "stripe_customer_id"],
        ] as const) {
            expect(isEnrollmentOperatorFieldVisible(entity, key, { is_system: true })).toBe(false);
            expect(isOperatorHiddenField(entity, { field_key: key, is_system: true, label: key })).toBe(true);
            expect(isChildcareOperatorPickerVisible(entity, key, { is_system: true })).toBe(false);
        }
        const formsPicker = buildFormSystemFieldPicker(
            leadOrgFixture().opportunity.map((r) => ({
                entity_type: "opportunity",
                field_key: r.field_key,
                field_type: "text",
                label: r.label,
                is_system: true,
                is_active: true,
            }))
        );
        expect(formsPicker.some((e) => e.field_key === "quote_total")).toBe(false);
        expect(formsPicker.some((e) => e.field_key === "inquiry_source")).toBe(true);
    });

    it("Fields default list hides legacy/integration fields", () => {
        for (const [entity, key] of [
            ["opportunity", "discount_code"],
            ["customer", "external_source"],
            ["location", "access_method_id"],
            ["inquiry_child", "outcome_status_key"],
        ] as const) {
            expect(
                isOperatorHiddenField(entity, {
                    field_key: key,
                    is_system: true,
                    label: key,
                })
            ).toBe(true);
        }
    });

    it("Advanced/system toggle can reveal hidden fields", () => {
        expect(
            isEnrollmentOperatorFieldVisible("opportunity", "quote_total", { is_system: true }, { include_advanced: true })
        ).toBe(true);
        expect(
            isEnrollmentOperatorFieldVisible(
                "customer",
                "stripe_customer_id",
                { is_system: true },
                { include_advanced: true }
            )
        ).toBe(true);
    });

    it("saved stage requirements with hidden fields parse safely but drop from palette selection", () => {
        const org = leadOrgFixture();
        const palette = mergeLifecycleFieldPaletteForStage("lead", org);
        const hiddenRule = customFieldRuleId("opportunity", "quote_total");
        const effective = {
            required_rule_ids: ["person:first_name", hiddenRule],
            recommended_rule_ids: [] as string[],
        };
        const paletteIds = new Set(palette.map((f) => f.rule_id));
        expect(paletteIds.has(hiddenRule)).toBe(false);
        expect(filterFieldRuleIdsToPalette(effective.required_rule_ids, palette)).toEqual(["person:first_name"]);
        expect(validateFieldRuleIdsAgainstPalette(effective.required_rule_ids, palette)).toBeNull();
    });

    it("F1 field propagation still works for newly created operator field", () => {
        const custom = {
            field_key: "preferred_start_month",
            label: "Preferred Start Month",
            entity_type: "inquiry_child",
            field_type: "select",
            is_system: false,
            is_active: true,
        };
        const bpPalette = mergeLifecycleFieldPaletteForStage("waitlist", { child: [custom] });
        expect(bpPalette.some((f) => f.field_key === "preferred_start_month")).toBe(true);

        const formsPicker = buildFormSystemFieldPicker([custom], []);
        expect(formsPicker.some((e) => e.field_key === "preferred_start_month")).toBe(true);

        const layoutMerged = mergeCatalogWithCuratedFallback("inquiry_child", [
            fieldDefToCatalog("inquiry_child", custom),
        ]);
        expect(layoutMerged.some((f) => f.fieldKey === "preferred_start_month")).toBe(true);
    });

    it("layout and form picker tests still pass for canonical program", () => {
        const row = {
            field_key: "program_category_id",
            label: "Program",
            field_type: "select",
        };
        const catalog = fieldDefToCatalog("inquiry_child", row);
        const merged = mergeCatalogWithCuratedFallback("inquiry_child", [catalog]);
        expect(merged.some((f) => f.fieldKey === "program_category_id")).toBe(true);

        const picker = buildFormSystemFieldPicker(
            [
                {
                    entity_type: "inquiry_child",
                    field_key: "program_category_id",
                    field_type: "select",
                    label: "Program",
                    is_system: true,
                    is_active: true,
                },
            ],
            []
        );
        expect(picker.some((e) => e.field_key === "program_category_id")).toBe(true);
    });

    it("E3 repair migration is idempotent (no deletes)", () => {
        const sql = readFileSync(
            resolve(root, "../supabase/migrations/20260614120000_enrollment_field_catalog_e3_repair.sql"),
            "utf8"
        );
        expect(sql).not.toMatch(/DELETE FROM public\.field_definitions/i);
        expect(sql).toContain("operator_catalog_class");
        expect(sql).toContain("stripe_customer_id");
        expect(sql).toContain("legacy_compatibility");
    });

    it("classifies integration and legacy_compatibility tiers", () => {
        expect(childcareFieldCatalogClass("customer", "stripe_customer_id")).toBe("integration");
        // No built-in legacy_compatibility keys remain (the canonical-fields migration dropped the
        // last alias); the tier survives for config-forced classification only.
        expect(
            childcareFieldCatalogClass("inquiry_child", "some_org_field", {
                operator_catalog_class: "legacy_compatibility",
            })
        ).toBe("legacy_compatibility");
        expect(childcareFieldCatalogClass("opportunity", "quote_total")).toBe("legacy_home_services");
    });
});
