import { describe, expect, it } from "vitest";
import {
    CONFIGURABLE_PLACEMENT_FIELD_TEMPLATES,
    findConfigurablePlacementFieldTemplate,
    listConfigurablePlacementFieldTemplatesForEntity,
    listMissingPlacementFieldTemplatesForEntity,
    placementCascadeConfigForEntityField,
} from "@/lib/fields/configurablePlacementFieldCatalog";
import {
    isConfigurableReferenceOrPlacementConfig,
    mergeFieldDefinitionConfigForWrite,
    shouldIncludeConfigOnFieldDefinitionPatch,
    validateSelectLikeConfig,
} from "@/lib/fields/fieldDefinitionConfig";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";

const LEAD_SCHOOL_CONFIG = {
    operator_catalog_class: "operator_configurable",
    option_source: "locations",
    field_kind: "entity_reference",
    target_entity_type: "location",
    storage_class: "native_column",
    storage_table: "opportunities",
    storage_column: "location_id",
};

const CHILD_PROGRAM_CONFIG = {
    operator_catalog_class: "operator_configurable",
    option_source: "programs_for_location",
    field_kind: "entity_reference",
    target_entity_type: "location_program_category",
    depends_on_field_key: "location_id",
    storage_class: "native_column",
    storage_table: "opportunity_customer_members",
    storage_column: "program_category_id",
};

const CHILD_ROOM_CONFIG = {
    operator_catalog_class: "operator_configurable",
    option_source: "rooms_for_location_program",
    field_kind: "entity_reference",
    target_entity_type: "location",
    depends_on_field_key: "program_category_id",
    storage_class: "native_column",
    storage_table: "opportunity_customer_members",
    storage_column: "program_room_cohort_key",
};

describe("fieldDefinitionConfig — reference validation", () => {
    it("accepts select with option_source only", () => {
        expect(validateSelectLikeConfig("select", LEAD_SCHOOL_CONFIG)).toEqual({ ok: true });
        expect(validateSelectLikeConfig("select", CHILD_PROGRAM_CONFIG)).toEqual({ ok: true });
        expect(validateSelectLikeConfig("select", CHILD_ROOM_CONFIG)).toEqual({ ok: true });
    });

    it("rejects select without options, option_set_key, catalog_key, or option_source", () => {
        const result = validateSelectLikeConfig("select", { operator_catalog_class: "operator_configurable" });
        expect(result.ok).toBe(false);
    });
});

describe("fieldDefinitionConfig — PATCH merge behavior", () => {
    it("label-only PATCH omits config for reference fields", () => {
        expect(
            shouldIncludeConfigOnFieldDefinitionPatch({
                fieldType: "select",
                existingConfig: LEAD_SCHOOL_CONFIG,
                optionSetKey: "",
            }),
        ).toBe(false);
    });

    it("merges partial PATCH config with existing reference metadata", () => {
        const merged = mergeFieldDefinitionConfigForWrite(LEAD_SCHOOL_CONFIG, {});
        expect(validateSelectLikeConfig("select", merged)).toEqual({ ok: true });
        expect(merged.option_source).toBe("locations");
        expect(merged.field_kind).toBe("entity_reference");
    });

    it("simulates label-only edit: empty incoming config merged with stored reference config succeeds", () => {
        const merged = mergeFieldDefinitionConfigForWrite(LEAD_SCHOOL_CONFIG, {});
        expect(validateSelectLikeConfig("select", merged)).toEqual({ ok: true });
        expect(isConfigurableReferenceOrPlacementConfig(merged)).toBe(true);
    });
});

describe("configurablePlacementFieldCatalog", () => {
    it("exposes School/Program/Room templates for lead and child entities", () => {
        const lead = listConfigurablePlacementFieldTemplatesForEntity("opportunity");
        const child = listConfigurablePlacementFieldTemplatesForEntity("inquiry_child");
        expect(lead.some((t) => t.template_key === "school" && t.field_key === "location_id")).toBe(true);
        expect(child.some((t) => t.template_key === "school")).toBe(true);
        expect(child.some((t) => t.template_key === "program")).toBe(true);
        expect(child.some((t) => t.template_key === "room")).toBe(true);
    });

    it("lists missing templates when field_definitions row absent", () => {
        const missing = listMissingPlacementFieldTemplatesForEntity("inquiry_child", ["outcome_status_key"]);
        expect(missing.map((t) => t.field_key)).toEqual(
            expect.arrayContaining(["location_id", "program_category_id", "program_room_cohort_key"]),
        );
    });

    it("program template depends on school; room depends on program category", () => {
        const program = findConfigurablePlacementFieldTemplate("inquiry_child", "program_category_id");
        const room = findConfigurablePlacementFieldTemplate("inquiry_child", "program_room_cohort_key");
        expect(program?.config.depends_on_field_key).toBe("location_id");
        expect(room?.config.depends_on_field_key).toBe("program_category_id");
    });

    it("catalog count includes lead school + child placement trio", () => {
        expect(CONFIGURABLE_PLACEMENT_FIELD_TEMPLATES.length).toBe(4);
    });
});

describe("layout runtime reads catalog cascade config", () => {
    it("program control is location-scoped select from catalog", () => {
        const control = resolveLayoutRuntimeFieldControl("inquiry_child.program_category_id");
        expect(control.controlType).toBe("select");
        expect(control.option_source).toBe("programs_for_location");
        expect(control.depends_on_field_key).toBe("location_id");
    });

    it("room control depends on program category from catalog", () => {
        const control = resolveLayoutRuntimeFieldControl("inquiry_child.program_room_cohort_key");
        expect(control.option_source).toBe("rooms_for_location_program");
        expect(control.depends_on_field_key).toBe("program_category_id");
    });

    it("field_definitions.config overrides catalog when provided", () => {
        const control = resolveLayoutRuntimeFieldControl("inquiry_child.program_room_cohort_key", {
            field_type: "select",
            config: { option_source: "rooms_for_location_program", depends_on_field_key: "location_id" },
        });
        expect(control.depends_on_field_key).toBe("location_id");
    });

    it("placementCascadeConfigForEntityField resolves child program cascade", () => {
        expect(placementCascadeConfigForEntityField("inquiry_child", "program_category_id")).toMatchObject({
            option_source: "programs_for_location",
            depends_on_field_key: "location_id",
        });
    });
});

describe("BP field requirements can reference placement fields", () => {
    it("lead school appears in lifecycle palette and accepts org label overlay", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead", {
            opportunity: [
                {
                    field_key: "location_id",
                    label: "School",
                    entity_type: "opportunity",
                    is_system: true,
                    is_active: true,
                },
            ],
        });
        const school = palette.find((f) => f.rule_id === "opportunity:location");
        expect(school).toBeTruthy();
        expect(school?.field_label).toBe("School");
    });
});
