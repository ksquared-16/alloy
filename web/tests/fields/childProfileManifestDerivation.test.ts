/**
 * CONFORMANCE — adding a durable child-profile fact is ONE manifest row.
 *
 * It used to be four: the manifest, the layout picker catalog (a row AND a ref-key list), the
 * identity surface resolvers, and the inline-save map. Four chances to forget one, and a
 * conformance test elsewhere that asserted "no picker allowlists" for a set that only held because
 * five keys happened to be enumerated everywhere.
 *
 * This is the same guard the relationship layer has: inject a hypothetical manifest row, and assert
 * every consumer picks it up with no other edit. If someone reintroduces a parallel list, this fails.
 */

import { describe, expect, it, vi } from "vitest";

const HYPOTHETICAL = {
    field_key: "carpool_notes",
    field_type: "text" as const,
    label: "Carpool notes",
    section_key: "child_profile",
    sort_order: 999,
};

vi.mock("@/lib/fields/customerMemberFieldRegistry", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/fields/customerMemberFieldRegistry")>();
    const manifest = [...actual.CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST, HYPOTHETICAL];
    const keys = [...actual.CUSTOMER_MEMBER_CONFIG_FIELD_KEYS, HYPOTHETICAL.field_key];
    return {
        ...actual,
        CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST: manifest,
        CUSTOMER_MEMBER_CONFIG_FIELD_KEYS: keys,
        isCustomerMemberConfigFieldKey: (k: string) => keys.includes(k as never),
    };
});

describe("a new child-profile field needs ONE manifest row", () => {
    it("appears in the derived ref-key list", async () => {
        const { CHILD_PROFILE_REF_KEYS } = await import("@/lib/fields/customerMemberProfileSurfaces");
        expect(CHILD_PROFILE_REF_KEYS).toContain("child.carpool_notes");
    });

    it("appears in the derived inline-save map, mapped back to its field key", async () => {
        const { CHILD_PROFILE_INLINE_SAVE_MAP } = await import("@/lib/fields/customerMemberProfileSurfaces");
        expect(CHILD_PROFILE_INLINE_SAVE_MAP["child.carpool_notes"]).toBe("carpool_notes");
    });

    it("produces a layout picker row with the manifest's label, type and order", async () => {
        const { deriveChildProfileCatalogRows } = await import("@/lib/fields/customerMemberProfileSurfaces");
        const row = deriveChildProfileCatalogRows().find((r) => r.refKey === "child.carpool_notes")!;
        expect(row).toBeTruthy();
        expect(row.pickerLabel).toBe("Carpool notes");
        expect(row.fieldType).toBe("text");
        expect(row.sortOrder).toBe(999);
        // Every manifest field stores the same way — that uniformity is what makes it derivable.
        expect(row.defEntityType).toBe("customer_member");
        expect(row.defFieldKey).toBe("carpool_notes");
        expect(row.storageTable).toBe("customer_members");
        expect(row.storageColumn).toBe("field_values");
    });

    it("resolves its ref back to its field key", async () => {
        const { childProfileFieldKeyFromRef } = await import("@/lib/fields/customerMemberProfileSurfaces");
        expect(childProfileFieldKeyFromRef("child.carpool_notes")).toBe("carpool_notes");
        expect(childProfileFieldKeyFromRef("child.not_a_manifest_field")).toBeNull();
        expect(childProfileFieldKeyFromRef("person.phone")).toBeNull();
    });

    it("derives the subject property the identity surface reads it from", async () => {
        const { childProfileSubjectProperty } = await import("@/lib/fields/customerMemberProfileSurfaces");
        expect(childProfileSubjectProperty("carpool_notes")).toBe("carpoolNotes");
        // The three legacy keys keep the property names that predate the manifest — named exceptions,
        // not a rule bent to fit them.
        expect(childProfileSubjectProperty("medical_notes")).toBe("medicalNotes");
        expect(childProfileSubjectProperty("special_instructions")).toBe("specialInstructions");
        expect(childProfileSubjectProperty("preferred_name")).toBe("preferredName");
    });
});

describe("the surfaces derive rather than enumerate", () => {
    it("no consumer hand-lists the child-profile keys any more", async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

        // The layout catalog and the inline-save map must not contain a literal list of config refs.
        const inlineSave = read("lib/adminV2/runtime/focusPanel/identity/identityInlineChildSave.ts");
        expect(inlineSave).toContain("CHILD_PROFILE_INLINE_SAVE_MAP");
        expect(inlineSave).not.toMatch(/"child\.allergies":\s*"allergies"/);

        const catalog = read("lib/layout/childcareLayoutFieldCatalog.ts");
        expect(catalog).toContain("deriveChildProfileCatalogRows");
        expect(catalog).toContain("CHILD_PROFILE_REF_KEYS");
        // The five original rows are gone as hand-authored entries.
        expect(catalog).not.toMatch(/childField\("child\.allergies"/);
        expect(catalog).not.toMatch(/childField\("child\.special_instructions"/);
    });

    it("the identity surface resolves a manifest field with no hand-written resolver", async () => {
        const { resolveIdentityFieldValue } = await import("@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose");
        const subject = { kind: "child" as const, value: { name: "Riley", carpoolNotes: "Rides with the Ruiz family" } as never };
        expect(resolveIdentityFieldValue(subject, "child.carpool_notes")).toBe("Rides with the Ruiz family");
        // A ref that is not a manifest field still resolves to nothing.
        expect(resolveIdentityFieldValue(subject, "child.not_a_field")).toBeNull();
    });
});
