import { describe, expect, it } from "vitest";
import {
    buildConfigWithInlineOptions,
    getDefaultOptionValueFromConfig,
    newInlineOptionFromLabel,
    readInlineOptionsFromFieldConfig,
} from "@/lib/fields/fieldDefinitionInlineOptions";

describe("fieldDefinitionInlineOptions", () => {
    it("round-trips inline options on config", () => {
        const config = buildConfigWithInlineOptions(null, [
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
        ], "male");
        expect(readInlineOptionsFromFieldConfig(config)).toEqual([
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
        ]);
        expect(getDefaultOptionValueFromConfig(config)).toBe("male");
    });

    it("clears option_set_key when writing inline options", () => {
        const config = buildConfigWithInlineOptions({ option_set_key: "person_gender" }, [{ value: "a", label: "A" }], "");
        expect((config as { option_set_key?: string }).option_set_key).toBeUndefined();
    });

    it("dedupes option values from labels", () => {
        const first = newInlineOptionFromLabel("Tour Outcome", new Set());
        const second = newInlineOptionFromLabel("Tour Outcome", new Set([first.value]));
        expect(first.value).not.toBe(second.value);
    });
});
