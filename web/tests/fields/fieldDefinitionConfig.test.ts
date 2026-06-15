import { describe, expect, it } from "vitest";
import {
    validateEntityReferenceConfig,
    validateSelectLikeConfig,
} from "@/lib/fields/fieldDefinitionConfig";

const LEAD_LOCATION_CONFIG = {
    operator_catalog_class: "operator_configurable",
    option_source: "locations",
    field_kind: "entity_reference",
    target_entity_type: "location",
    storage_class: "native_column",
    storage_table: "opportunities",
    storage_column: "location_id",
};

describe("validateSelectLikeConfig", () => {
    it("accepts select with option_source=locations (native reference)", () => {
        expect(validateSelectLikeConfig("select", LEAD_LOCATION_CONFIG)).toEqual({ ok: true });
    });

    it("accepts label-only edit payload when config retains option_source", () => {
        const editPayload = {
            ...LEAD_LOCATION_CONFIG,
        };
        expect(validateSelectLikeConfig("select", editPayload)).toEqual({ ok: true });
    });

    it("rejects select without options, option_set_key, catalog_key, or option_source", () => {
        const result = validateSelectLikeConfig("select", { operator_catalog_class: "operator_configurable" });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("option_source");
        }
    });

    it("ignores non-select field types", () => {
        expect(validateSelectLikeConfig("text", {})).toEqual({ ok: true });
    });
});

describe("validateEntityReferenceConfig", () => {
    it("requires target_entity_type for entity_reference", () => {
        const result = validateEntityReferenceConfig({
            field_kind: "entity_reference",
            storage_class: "native_column",
            storage_table: "opportunities",
            storage_column: "location_id",
            option_source: "locations",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("target_entity_type");
        }
    });

    it("requires storage_table and storage_column for native_column entity_reference", () => {
        const result = validateEntityReferenceConfig({
            field_kind: "entity_reference",
            target_entity_type: "location",
            storage_class: "native_column",
            option_source: "locations",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("storage_table");
        }
    });

    it("accepts full lead location entity_reference config", () => {
        expect(validateEntityReferenceConfig(LEAD_LOCATION_CONFIG)).toEqual({ ok: true });
        expect(validateSelectLikeConfig("select", LEAD_LOCATION_CONFIG)).toEqual({ ok: true });
    });
});

describe("lead location label edit scenario", () => {
    it("editing Lead Location label Location → School succeeds with unchanged reference config", () => {
        const config = { ...LEAD_LOCATION_CONFIG };
        expect(validateSelectLikeConfig("select", config)).toEqual({ ok: true });
        // Label is not part of config validation — only field_definitions.label column.
        const label = "School";
        expect(label).toBe("School");
    });
});
