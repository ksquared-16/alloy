import { describe, expect, it } from "vitest";
import { buildFormSystemFieldPicker } from "@/lib/fields/formFieldRegistryPicker";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { customFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { fieldDefToCatalog, mergeCatalogWithCuratedFallback } from "@/lib/layout/fieldCatalog";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { buildQueueRecordPickerCatalog } from "@/lib/layout/queueRecordFieldPickerCatalog";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

const PREFERRED_START_MONTH = {
    entity_type: "inquiry_child",
    field_key: "preferred_start_month",
    field_type: "select",
    label: "Preferred Start Month",
    help_text: "When the family hopes to start care.",
    config: { option_set_key: "preferred_start_months" },
    is_system: false,
    is_active: true,
};

describe("field registry trust — end-to-end", () => {
    it("new registry field appears in BP, Forms, and Layout pickers without hardcoded catalogs", () => {
        const orgChildRows = [
            {
                field_key: PREFERRED_START_MONTH.field_key,
                label: PREFERRED_START_MONTH.label,
                entity_type: PREFERRED_START_MONTH.entity_type,
                field_type: PREFERRED_START_MONTH.field_type,
                is_system: false,
                is_active: true,
            },
        ];

        const bpPalette = mergeLifecycleFieldPaletteForStage("waitlist", { child: orgChildRows });
        expect(bpPalette.some((f) => f.field_key === "preferred_start_month")).toBe(true);
        expect(bpPalette.some((f) => f.rule_id === customFieldRuleId("child", "preferred_start_month"))).toBe(
            true
        );

        const formsPicker = buildFormSystemFieldPicker([PREFERRED_START_MONTH], []);
        expect(formsPicker.some((e) => e.field_key === "preferred_start_month")).toBe(true);
        expect(formsPicker.some((e) => e.default_label === "Preferred Start Month")).toBe(true);
        expect(formsPicker.some((e) => e.id.startsWith("reg_"))).toBe(true);

        const layoutRegistry = [fieldDefToCatalog("inquiry_child", PREFERRED_START_MONTH)];
        const layoutMerged = mergeCatalogWithCuratedFallback("inquiry_child", layoutRegistry);
        expect(layoutMerged.some((f) => f.fieldKey === "preferred_start_month")).toBe(true);
        expect(layoutMerged.some((f) => f.refKey === "inquiry_child.preferred_start_month")).toBe(true);

        const queuePicker = buildQueueRecordPickerCatalog({
            isWaitlist: true,
            tenantFieldDefinitions: [PREFERRED_START_MONTH],
        });
        expect(
            queuePicker.groups.flatMap((g) => g.fields).some((f) => f.refKey === "inquiry_child.preferred_start_month"),
        ).toBe(true);

        const drawerPicker = buildOpportunityDrawerEditorFieldPickerGroups({
            tenantFieldDefinitions: [PREFERRED_START_MONTH],
        });
        expect(
            drawerPicker.flatMap((g) => g.fields).some((f) => f.refKey === "inquiry_child.preferred_start_month"),
        ).toBe(true);

        expect(OPERATIONAL_FORM_SYSTEM_FIELDS.some((e) => e.field_key === "preferred_start_month")).toBe(false);
    });

    it("registry-first Forms picker deduplicates legacy catalog when registry has canonical row", () => {
        const orgDefs = [
            {
                entity_type: "person",
                field_key: "first_name",
                field_type: "text",
                label: "First name",
                is_system: true,
                is_active: true,
            },
        ];
        const picker = buildFormSystemFieldPicker(orgDefs);
        const guardianHits = picker.filter((e) => e.field_key === "guardian_first_name" || e.id === "guardian_first_name");
        expect(guardianHits.length).toBeLessThanOrEqual(1);
        expect(picker.some((e) => e.field_key === "guardian_first_name" || e.default_label === "First name")).toBe(
            true
        );
    });

    it("layout manifest fallback applies only when registry group is empty", () => {
        const emptyFallback = mergeCatalogWithCuratedFallback("inquiry_child", []);
        expect(emptyFallback.length).toBeGreaterThan(0);
        const registryOnly = mergeCatalogWithCuratedFallback("inquiry_child", [
            fieldDefToCatalog("inquiry_child", PREFERRED_START_MONTH),
        ]);
        expect(registryOnly.some((f) => f.fieldKey === "preferred_start_month")).toBe(true);
    });

    it("registry-first BP palette includes org custom field even when catalog is empty for that key", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead", {
            child: [
                {
                    field_key: "preferred_start_month",
                    label: "Preferred Start Month",
                    entity_type: "inquiry_child",
                    is_system: false,
                    is_active: true,
                },
            ],
        });
        expect(palette.filter((f) => f.field_key === "preferred_start_month")).toHaveLength(1);
    });
});
