import { describe, expect, it } from "vitest";

import {
    classifyIdentityFieldParity,
    isIdentityFieldOfferedInPicker,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldPickerParity";
import { identityPickerFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import { resolveIdentityFieldValue } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import { isIdentityFieldSaveSupported } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

describe("identity field picker parity", () => {
    it("offers Full Name as computed display-only and resolves it", () => {
        const parity = classifyIdentityFieldParity("person.full_name", ["person"]);
        expect(parity.offeredInPicker).toBe(true);
        expect(parity.classification).toBe("computed_display_only");
        expect(parity.editable).toBe(false);
        expect(isIdentityFieldSaveSupported("person.full_name")).toBe(false);
        expect(
            resolveIdentityFieldValue(
                {
                    kind: "person",
                    value: {
                        personId: "p1",
                        name: "Kelly Kurzman",
                        firstName: "Kelly",
                        lastName: "Kurzman",
                        roleLabel: null,
                        isPrimary: true,
                        phone: null,
                        email: null,
                        initials: "KK",
                    },
                },
                "person.full_name",
            ),
        ).toBe("Kelly Kurzman");
    });

    it("removes Communication Preference from unsupported identity contexts", () => {
        expect(isIdentityFieldOfferedInPicker("person.communication_preference", ["person"])).toBe(false);
        const picker = identityPickerFieldsForNamespaces({ namespaces: ["person"] });
        expect(picker.some((f) => f.key === "person.communication_preference")).toBe(false);
    });

    it("keeps Phone as the canonical phone field and does not offer Mobile aliases", () => {
        expect(isIdentityFieldOfferedInPicker("person.phone", ["person"])).toBe(true);
        expect(isIdentityFieldOfferedInPicker("person.mobile", ["person"])).toBe(false);
        expect(isIdentityFieldOfferedInPicker("person.secondary_phone", ["person"])).toBe(false);
        const picker = identityPickerFieldsForNamespaces({ namespaces: ["person"] });
        expect(picker.some((f) => f.key === "person.phone")).toBe(true);
        expect(picker.some((f) => /mobile/i.test(f.key))).toBe(false);
    });

    it("offers Relationship to Child only in relationship-scoped namespaces", () => {
        expect(isIdentityFieldOfferedInPicker("person.relationship_to_child", ["person"])).toBe(false);
        expect(
            isIdentityFieldOfferedInPicker("person.relationship_to_child", [
                "person",
                "person_child_relationship",
            ]),
        ).toBe(true);
        const scoped = classifyIdentityFieldParity("person.relationship_to_child", [
            "person_child_relationship",
        ]);
        expect(scoped.classification).toBe("relationship_display_only");
        expect(scoped.editable).toBe(false);
    });

    it("adds Full Name as read-only policy on household config", () => {
        const base = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const next = addFieldToNestedGroup(base, "primary_contact", "person.full_name");
        const group = next.groups.find((g) => g.key === "primary_contact");
        expect(group?.selectedFieldKeys).toContain("person.full_name");
        expect(group?.fieldPolicies?.["person.full_name"]).toBe("read-only");
    });

    it("every normal person-namespace picker entry is classified as offered", () => {
        const picker = identityPickerFieldsForNamespaces({ namespaces: ["person"] });
        for (const field of picker) {
            const parity = classifyIdentityFieldParity(field.key, ["person"]);
            expect(parity.offeredInPicker, field.key).toBe(true);
            expect(parity.classification).not.toBe("unsupported_in_context");
        }
    });
});
