/**
 * Drawer surface field catalog / validator alignment regression tests.
 */

import { describe, expect, it } from "vitest";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { buildPersonDrawerEditorFieldPickerGroups } from "@/lib/layout/personDrawerLayoutEditorFieldCatalog";
import { buildChildDrawerEditorFieldPickerGroups } from "@/lib/layout/childDrawerLayoutEditorFieldCatalog";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import {
    filterCatalogGroupsForDrawerSurface,
    isAllowedOpportunityDrawerFieldRefKey,
    isAllowedPersonDrawerFieldRefKey,
    isAllowedChildDrawerFieldRefKey,
} from "@/lib/layout/surfaceLayoutRegistry";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";
import { tryAddFieldRefToSection } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS } from "@/lib/layout/runtime/resolveHouseholdAddressFieldValues";
import { PERSON_ADDRESS_LAYOUT_REF_KEYS } from "@/lib/layout/personDrawerAddressLayoutRefs";
import { contactRoleFieldRefs } from "@/lib/layout/layoutEditorContactRoles";
import { isLayoutRuntimeEditableRefKeySupported } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { layoutRuntimeFieldReadOnlyReason } from "@/lib/layout/runtime/layoutRuntimeFieldReadOnlyReason";
import { CHILDCARE_CATALOG_BY_REFKEY } from "@/lib/layout/childcareLayoutFieldCatalog";

function flatRefKeys(groups: { fields: { refKey: string }[] }[]): string[] {
    return groups.flatMap((g) => g.fields.map((f) => f.refKey));
}

describe("drawer surface field picker / validator alignment", () => {
    it("opportunity picker omits location.label (site label uses opportunity.location_id)", () => {
        const refs = flatRefKeys(buildOpportunityDrawerEditorFieldPickerGroups());
        expect(refs).not.toContain("location.label");
        expect(isAllowedOpportunityDrawerFieldRefKey("location.label")).toBe(false);
    });

    it("every opportunity picker ref passes surface validator", () => {
        const refs = flatRefKeys(buildOpportunityDrawerEditorFieldPickerGroups());
        for (const refKey of refs) {
            expect(isAllowedOpportunityDrawerFieldRefKey(refKey), refKey).toBe(true);
        }
    });

    it("opportunity primary contact picker exposes person address refs and not site address", () => {
        const refs = flatRefKeys(buildOpportunityDrawerEditorFieldPickerGroups());
        const primaryRefs = contactRoleFieldRefs("primary");
        expect(refs).toContain(primaryRefs.addressLine1);
        expect(refs).toContain(primaryRefs.city);
        expect(refs).not.toContain("location.address1");
        expect(refs).not.toContain("person.address_line1");
    });

    it("opportunity secondary contact picker exposes role-scoped address refs only", () => {
        const refs = flatRefKeys(buildOpportunityDrawerEditorFieldPickerGroups());
        const secondaryRefs = contactRoleFieldRefs("parents");
        expect(refs).toContain(secondaryRefs.addressLine1);
        expect(refs).toContain(secondaryRefs.postalCode);
    });

    it("person drawer picker exposes person address refs allowed by validator", () => {
        const refs = flatRefKeys(buildPersonDrawerEditorFieldPickerGroups());
        for (const refKey of PERSON_ADDRESS_LAYOUT_REF_KEYS) {
            expect(refs, refKey).toContain(refKey);
            expect(isAllowedPersonDrawerFieldRefKey(refKey), refKey).toBe(true);
        }
    });

    it("household address refs remain separate and clearly labeled in catalog", () => {
        expect(CHILDCARE_CATALOG_BY_REFKEY.get("location.household_address_line1")?.pickerLabel).toBe(
            "Household address line 1",
        );
        expect(CHILDCARE_CATALOG_BY_REFKEY.get("location.address1")?.pickerLabel).toBe("Site address line 1");
        const refs = flatRefKeys(buildPersonDrawerEditorFieldPickerGroups());
        expect(refs).toContain("location.household_address_line1");
        expect(refs).not.toContain("location.address1");
    });

    it("person address saves on person drawer; contact role address stays read-only on opportunity", () => {
        expect(isLayoutRuntimeEditableRefKeySupported("person.address_line1")).toBe(true);
        expect(isLayoutRuntimeEditableRefKeySupported("person.primary_address_line1")).toBe(false);
        expect(isLayoutRuntimeEditableRefKeySupported("person.secondary_phone")).toBe(true);
        expect(isLayoutRuntimeEditableRefKeySupported("person.emergency_contact_email")).toBe(true);
        expect(layoutRuntimeFieldReadOnlyReason("person.primary_address_line1")).toContain("read-only");
        expect(layoutRuntimeFieldReadOnlyReason("location.household_address")).toContain("Household address");
        expect(layoutRuntimeFieldReadOnlyReason("person.secondary_contact_name")).toContain("derived");
    });

    it("every person picker ref passes surface validator", () => {
        const refs = flatRefKeys(buildPersonDrawerEditorFieldPickerGroups());
        for (const refKey of refs) {
            expect(isAllowedPersonDrawerFieldRefKey(refKey), refKey).toBe(true);
        }
    });

    it("person picker exposes household address fields allowed by validator", () => {
        const refs = flatRefKeys(buildPersonDrawerEditorFieldPickerGroups());
        expect(refs).toContain("location.household_address");
        expect(refs).toContain("location.household_address_line1");
        expect(refs).toContain("location.household_address_city");
        expect(refs).toContain("location.household_address_postal_code");
        for (const refKey of HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS) {
            expect(isAllowedPersonDrawerFieldRefKey(refKey), refKey).toBe(true);
        }
    });

    it("child picker exposes household address fields allowed by validator", () => {
        const refs = flatRefKeys(buildChildDrawerEditorFieldPickerGroups());
        expect(refs).toContain("location.household_address_line1");
        expect(refs).toContain("location.household_address_postal_code");
        for (const refKey of HOUSEHOLD_ADDRESS_LAYOUT_FIELD_REFS) {
            expect(isAllowedChildDrawerFieldRefKey(refKey), refKey).toBe(true);
        }
    });

    it("default Opportunity/Person/Child docs pass surface validation", () => {
        expect(validateLayoutDocForSurface(buildLeadDrawerDefaultDoc()).ok).toBe(true);
        expect(validateLayoutDocForSurface(buildPersonDrawerDefaultDoc()).ok).toBe(true);
        expect(validateLayoutDocForSurface(buildChildDrawerDefaultDoc()).ok).toBe(true);
    });

    it("tryAddFieldRefToSection rejects location.label on opportunity drawer", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = tryAddFieldRefToSection(doc, "household_contact", "location.label", "Location name");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("location.label");
            expect(result.error).toContain("not allowed");
        }
    });

    it("filterCatalogGroupsForDrawerSurface removes disallowed refs from supplemented groups", () => {
        const supplemented = filterCatalogGroupsForDrawerSurface("opportunity_drawer", [
            {
                entityKey: "location",
                entityLabel: "Location",
                fields: [
                    {
                        entityKey: "location",
                        entityLabel: "Location",
                        refKey: "location.label",
                        fieldKey: "label",
                        fieldLabel: "Location name",
                        fieldType: "text",
                    },
                    {
                        entityKey: "opportunity",
                        entityLabel: "Lead",
                        refKey: "opportunity.location_id",
                        fieldKey: "location_id",
                        fieldLabel: "Location",
                        fieldType: "select",
                    },
                ],
            },
        ]);
        const refs = flatRefKeys(supplemented);
        expect(refs).not.toContain("location.label");
        expect(refs).toContain("opportunity.location_id");
    });
});
