/**
 * Layout builder field picker — filtering and partitioning helpers.
 */

import { describe, expect, it } from "vitest";
import {
    countAvailableFieldsInGroup,
    fieldMatchesPickerQuery,
    partitionCatalogFieldsForPicker,
} from "@/lib/layout/layoutFieldPickerHelpers";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";

function field(refKey: string, label: string, entityKey = "person"): LayoutCatalogField {
    const fieldKey = refKey.split(".").pop() ?? refKey;
    return {
        refKey,
        fieldKey,
        fieldLabel: label,
        fieldType: "text",
        entityKey,
        entityLabel: entityKey,
    };
}

describe("layoutFieldPickerHelpers", () => {
    const personFields = [
        field("person.first_name", "First name"),
        field("person.last_name", "Last name"),
        field("person.email", "Email"),
    ];

    it("matches search within entity field labels and refKeys", () => {
        expect(fieldMatchesPickerQuery(personFields[0], "first")).toBe(true);
        expect(fieldMatchesPickerQuery(personFields[2], "first")).toBe(false);
        expect(fieldMatchesPickerQuery(personFields[2], "person.email")).toBe(true);
    });

    it("partitions available vs used fields for the active entity", () => {
        const used = new Set(["person.first_name"]);
        const { available, used: usedOut } = partitionCatalogFieldsForPicker(personFields, used, "");
        expect(available.map((f) => f.refKey)).toEqual(["person.last_name", "person.email"]);
        expect(usedOut.map((f) => f.refKey)).toEqual(["person.first_name"]);
    });

    it("scopes search to the selected entity field list only", () => {
        const childFields = [field("child.gender", "Gender", "child"), ...personFields];
        const { available } = partitionCatalogFieldsForPicker(childFields, new Set(), "gender");
        expect(available.map((f) => f.refKey)).toEqual(["child.gender"]);
    });

    it("counts remaining available fields per group for nav badges", () => {
        const used = new Set(["person.first_name", "person.email"]);
        expect(countAvailableFieldsInGroup(personFields, used)).toBe(1);
    });
});
