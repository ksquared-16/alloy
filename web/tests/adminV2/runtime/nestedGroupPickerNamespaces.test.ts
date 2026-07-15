import { describe, expect, it, beforeEach } from "vitest";

import {
    CHILDREN_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
    availableFieldsForNestedGroup,
    defaultNestedSurfaceConfig,
    namespacesForNestedGroupPicker,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { identityPickerCategoriesForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

describe("nested group picker namespace parity", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("Children emergency_contacts uses person + relationship namespaces (not child-only def)", () => {
        expect(namespacesForNestedGroupPicker(CHILDREN_SURFACE_ID, "emergency_contacts")).toEqual([
            "person",
            "person_child_relationship",
        ]);
    });

    it("Children evidence sections use child + inquiry_child namespaces", () => {
        // Optional evidence groups (medical/documents/notes) get the shared override.
        expect(namespacesForNestedGroupPicker(CHILDREN_SURFACE_ID, "medical")).toEqual([
            "child",
            "inquiry_child",
        ]);
        expect(namespacesForNestedGroupPicker(CHILDREN_SURFACE_ID, "documents")).toEqual([
            "child",
            "inquiry_child",
        ]);
    });

    it("available fields and category menus share the same emergency namespace set", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const namespaces = namespacesForNestedGroupPicker(CHILDREN_SURFACE_ID, "emergency_contacts");
        const available = availableFieldsForNestedGroup(
            CHILDREN_SURFACE_ID,
            "emergency_contacts",
            config,
        );
        const categoryKeys = new Set(
            identityPickerCategoriesForNamespaces({ namespaces })
                .flatMap((category) => category.fields.map((field) => field.key)),
        );
        for (const field of available.slice(0, 25)) {
            expect(categoryKeys.has(field.key), field.key).toBe(true);
        }
        // Must not be child-namespace-only (def.acceptedNamespaces trap).
        expect(available.some((field) => field.entityNamespace === "person")).toBe(true);
    });

    it("Household primary_contact stays on person namespace", () => {
        expect(namespacesForNestedGroupPicker(HOUSEHOLD_SURFACE_ID, "primary_contact")).toContain("person");
    });
});
