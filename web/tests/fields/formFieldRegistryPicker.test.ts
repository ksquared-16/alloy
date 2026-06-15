import { describe, expect, it } from "vitest";
import { buildFormSystemFieldPicker, fieldDefToFormRegistryEntry } from "@/lib/fields/formFieldRegistryPicker";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

describe("formFieldRegistryPicker", () => {
    it("converts field_definitions row to registry entry with option set", () => {
        const entry = fieldDefToFormRegistryEntry({
            entity_type: "inquiry_child",
            field_key: "preferred_start_month",
            field_type: "select",
            label: "Preferred Start Month",
            config: { option_set_key: "summer_months" },
            is_system: false,
            is_active: true,
        });
        expect(entry.field_key).toBe("preferred_start_month");
        expect(entry.suggested_kind).toBe("select");
        expect(entry.default_option_set_key).toBe("summer_months");
        expect(entry.entity_type).toBe("child");
    });

    it("registry-first picker uses fallback only for unmached legacy fields", () => {
        const picker = buildFormSystemFieldPicker([], OPERATIONAL_FORM_SYSTEM_FIELDS);
        expect(picker.length).toBeGreaterThan(0);
        expect(picker.length).toBeLessThanOrEqual(OPERATIONAL_FORM_SYSTEM_FIELDS.length);
    });

    it("registry-first picker does not duplicate guardian_first_name when person first_name is in registry", () => {
        const picker = buildFormSystemFieldPicker([
            {
                entity_type: "person",
                field_key: "first_name",
                field_type: "text",
                label: "First name",
                is_system: true,
                is_active: true,
            },
        ]);
        const guardianEntries = picker.filter((e) => e.field_key === "guardian_first_name");
        expect(guardianEntries).toHaveLength(1);
        expect(guardianEntries[0]?.id).toBe("guardian_first_name");
    });
});
