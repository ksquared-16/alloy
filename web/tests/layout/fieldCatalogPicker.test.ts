/**
 * FC-2 / childcare — Layout config field picker tests.
 */

import { describe, expect, it } from "vitest";
import {
    buildLeadLayoutPickerGroups,
    catalogGroupsForEntityType,
    catalogCopyContainsBannedInquiryPhrase,
    collectUserFacingCatalogCopy,
    CURATED_FIELDS,
    LAYOUT_ENTITY_GROUPS,
} from "@/lib/layout/fieldCatalog";
import {
    childcareCatalogRefKeysForOperatorEntity,
    collectChildcareUserFacingCopy,
    childcareCopyContainsBannedPhrase,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import { INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";

function leadPickerFromCuratedFallback() {
    const raw = LAYOUT_ENTITY_GROUPS.map((g) => ({
        entityKey: g.entityKey,
        entityLabel: g.entityLabel,
        fields: CURATED_FIELDS[g.entityKey] ?? [],
    }));
    return buildLeadLayoutPickerGroups(raw, "opportunities");
}

describe("field catalog picker — childcare starter catalog", () => {
    it("never emits child_inquiry.* from Lead picker groups", () => {
        const refKeys = leadPickerFromCuratedFallback().flatMap((g) => g.fields.map((f) => f.refKey));
        expect(refKeys.some((k) => k.startsWith("child_inquiry."))).toBe(false);
    });

    it("never emits mis-grained child participation refKeys", () => {
        const refKeys = leadPickerFromCuratedFallback().flatMap((g) => g.fields.map((f) => f.refKey));
        for (const blocked of ["child.program", "child.desired_start_date", "opportunity.location", "person.primary_phone"]) {
            expect(refKeys).not.toContain(blocked);
        }
    });

    it("includes inquiry_child native refKeys under Child group", () => {
        const childGroup = leadPickerFromCuratedFallback().find((g) => g.entityLabel === "Child");
        const refKeys = childGroup?.fields.map((f) => f.refKey) ?? [];
        for (const key of INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS) {
            expect(refKeys).toContain(`inquiry_child.${key}`);
        }
    });

    it("exposes five operator entity groups on Lead layouts", () => {
        const labels = leadPickerFromCuratedFallback().map((g) => g.entityLabel);
        expect(labels).toEqual(["Lead", "Child", "Parent / Contact", "Household", "Location"]);
    });

    it("user-facing copy never mentions Inquiry Child / Child Inquiry", () => {
        const surfaces = [leadPickerFromCuratedFallback(), catalogGroupsForEntityType("person") ?? []];
        for (const groups of surfaces) {
            for (const copy of collectChildcareUserFacingCopy(groups)) {
                expect(childcareCopyContainsBannedPhrase(copy)).toBe(false);
            }
            for (const copy of collectUserFacingCatalogCopy(groups)) {
                expect(catalogCopyContainsBannedInquiryPhrase(copy)).toBe(false);
            }
        }
    });

    it("waitlist catalog is unchanged (flat VM refKeys)", () => {
        const groups = catalogGroupsForEntityType("placement_candidate") ?? [];
        expect(groups.some((g) => g.fields.some((f) => f.refKey.startsWith("waitlist.")))).toBe(true);
    });
});

describe("childcare catalog coverage", () => {
    it("lead catalog includes tour and program fields", () => {
        const keys = childcareCatalogRefKeysForOperatorEntity("lead");
        expect(keys).toContain("opportunity.tour_date");
        expect(keys).toContain("opportunity.program_type");
    });
});
