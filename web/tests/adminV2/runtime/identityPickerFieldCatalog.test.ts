import { describe, expect, it } from "vitest";

import { identityPickerCategoriesForNamespaces, identityPickerFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";

describe("identity picker field catalog", () => {
    it("groups fields by configured category labels", () => {
        const categories = identityPickerCategoriesForNamespaces({
            namespaces: ["child", "inquiry_child"],
        });
        expect(categories.length).toBeGreaterThan(0);
        expect(categories.every((c) => c.label.length > 0)).toBe(true);
    });

    it("excludes derived child.name as selectable", () => {
        const fields = identityPickerFieldsForNamespaces({ namespaces: ["child"] });
        expect(fields.some((f) => f.key === "child.name")).toBe(false);
    });

    it("does not expose duplicate selectable Program aliases", () => {
        const fields = identityPickerFieldsForNamespaces({ namespaces: ["inquiry_child"] });
        const programFields = fields.filter((f) => f.label.toLowerCase() === "program");
        expect(programFields.length).toBeLessThanOrEqual(1);
    });

    it("never surfaces raw ref keys as labels", () => {
        const fields = identityPickerFieldsForNamespaces({ namespaces: ["child", "inquiry_child"] });
        expect(fields.every((f) => !f.label.includes("child."))).toBe(true);
    });
});
