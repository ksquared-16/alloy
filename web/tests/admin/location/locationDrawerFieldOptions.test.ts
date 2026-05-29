import { describe, expect, it } from "vitest";
import {
    mapOptionItemsToSelectOptions,
    optionSetKeysForLocationMetadataFields,
    resolveLocationMetadataSelectOptionsByFieldKey,
} from "@/lib/admin/location/locationDrawerFieldOptions";

describe("locationDrawerFieldOptions", () => {
    it("maps option_set_items.item_key to select value and label", () => {
        expect(
            mapOptionItemsToSelectOptions([
                { item_key: "infant", label: "Infant" },
                { item_key: "months", label: "Months" },
            ])
        ).toEqual([
            { value: "infant", label: "Infant" },
            { value: "months", label: "Months" },
        ]);
    });

    it("resolves category and age_range_unit options when option items are provided", () => {
        const setKeys = optionSetKeysForLocationMetadataFields([
            {
                field_key: "category",
                field_type: "select",
                config: { option_set_key: "childcare_program_type" },
            },
            {
                field_key: "age_range_unit",
                field_type: "select",
                config: { option_set_key: "location_age_range_unit" },
            },
        ]);
        expect(setKeys.category).toBe("childcare_program_type");
        expect(setKeys.age_range_unit).toBe("location_age_range_unit");

        const out = resolveLocationMetadataSelectOptionsByFieldKey({
            fieldDefs: [],
            optionItemsBySetKey: {
                childcare_program_type: [{ item_key: "infant", label: "Infant" }],
                location_age_range_unit: [{ item_key: "months", label: "Months" }],
            },
        });
        expect(out.category).toEqual([{ value: "infant", label: "Infant" }]);
        expect(out.age_range_unit).toEqual([{ value: "months", label: "Months" }]);
    });

    it("returns empty select maps when option items are not loaded", () => {
        expect(resolveLocationMetadataSelectOptionsByFieldKey({ fieldDefs: [] })).toEqual({});
    });
});
