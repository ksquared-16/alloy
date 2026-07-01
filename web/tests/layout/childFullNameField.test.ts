import { describe, expect, it } from "vitest";
import { readLayoutRuntimeRepeaterFieldRaw } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import { CHILDCARE_STARTER_FIELD_CATALOG } from "@/lib/layout/childcareLayoutFieldCatalog";
import { CURATED_FIELDS } from "@/lib/layout/fieldCatalog";
import { organizeChildcarePickerGroups } from "@/lib/layout/childcareLayoutFieldCatalog";
import { isChildcareCatalogRefKey } from "@/lib/layout/childcareLayoutFieldCatalog";

describe("child.full_name computed field", () => {
    it("composes first and last name from repeater row at read time (not hardcoded on row)", () => {
        const row = {
            "child.first_name": "Alex",
            "child.last_name": "Kelly",
        };
        expect(readLayoutRuntimeRepeaterFieldRaw(row, "child.full_name")).toBe("Alex Kelly");
        expect(row).not.toHaveProperty("child.full_name");
    });

    it("is in starter catalog as computed display-only field", () => {
        const entry = CHILDCARE_STARTER_FIELD_CATALOG.find((f) => f.refKey === "child.full_name");
        expect(entry).toBeDefined();
        expect(entry?.computed).toBe(true);
        expect(entry?.pickerLabel).toBe("Full name");
    });

    it("appears in curated fallback and childcare picker groups", () => {
        const curated = CURATED_FIELDS.child.find((f) => f.refKey === "child.full_name");
        expect(curated?.fieldLabel).toBe("Full name");

        expect(isChildcareCatalogRefKey("child.full_name", "opportunities")).toBe(true);

        const groups = organizeChildcarePickerGroups([], "opportunities");
        const childGroup = groups.find((g) => g.entityKey === "child");
        const pickerField = childGroup?.fields.find((f) => f.refKey === "child.full_name");
        expect(pickerField?.fieldLabel).toBe("Full name");
    });
});
