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
