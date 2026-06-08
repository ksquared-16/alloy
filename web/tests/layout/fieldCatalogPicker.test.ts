/**
 * FC-2 — Layout config field picker (manifest-filtered catalog).
 */

import { describe, expect, it } from "vitest";
import {
    buildLeadLayoutPickerGroups,
    catalogGroupsForEntityType,
    CURATED_FIELDS,
    LAYOUT_ENTITY_GROUPS,
} from "@/lib/layout/fieldCatalog";
import {
    allPickerEligibleRefKeys,
    collectRefKeysFromCatalogGroups,
    isBlockedLayoutPickerRefKey,
    PLATFORM_FIELD_MANIFEST,
} from "@/lib/layout/platformFieldResolutionManifest";
import { INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";

function leadPickerFromCuratedFallback() {
    const raw = LAYOUT_ENTITY_GROUPS.map((g) => ({
        entityKey: g.entityKey,
        entityLabel: g.entityLabel,
        fields: CURATED_FIELDS[g.entityKey],
    }));
    return buildLeadLayoutPickerGroups(raw, "opportunities");
}

describe("field catalog picker — FC-2 canonical refKeys", () => {
    it("never emits child_inquiry.* from Lead picker groups", () => {
        const refKeys = collectRefKeysFromCatalogGroups(leadPickerFromCuratedFallback());
        expect(refKeys.some((k) => k.startsWith("child_inquiry."))).toBe(false);
    });

    it("never emits mis-grained child participation refKeys", () => {
        const refKeys = collectRefKeysFromCatalogGroups(leadPickerFromCuratedFallback());
        for (const blocked of [
            "child.program",
            "child.desired_start_date",
            "child.location",
            "child.status",
            "opportunity.location",
            "person.primary_phone",
            "inquiry_child.program",
        ]) {
            expect(refKeys).not.toContain(blocked);
        }
    });

    it("includes all seven inquiry_child native refKeys on Lead layouts", () => {
        const refKeys = collectRefKeysFromCatalogGroups(leadPickerFromCuratedFallback());
        for (const key of INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS) {
            expect(refKeys).toContain(`inquiry_child.${key}`);
        }
    });

    it("omits child durable group on Lead anchor until FC-5", () => {
        const groups = leadPickerFromCuratedFallback();
        const childGroup = groups.find((g) => g.entityKey === "child");
        expect(childGroup).toBeUndefined();
    });

    it("omits location and customer groups when nothing is resolvable", () => {
        const groups = leadPickerFromCuratedFallback();
        expect(groups.some((g) => g.entityKey === "location")).toBe(false);
        expect(groups.some((g) => g.entityKey === "customer")).toBe(false);
    });

    it("person/child drawer catalogs emit no child_inquiry.*", () => {
        for (const entityType of ["person", "child"] as const) {
            const groups = catalogGroupsForEntityType(entityType) ?? [];
            const refKeys = collectRefKeysFromCatalogGroups(groups);
            expect(refKeys.some((k) => k.startsWith("child_inquiry."))).toBe(false);
        }
    });

    it("child drawer uses canonical inquiry_child keys (not program/schedule)", () => {
        const groups = catalogGroupsForEntityType("child") ?? [];
        const enrollment = groups.find((g) => g.entityKey === "inquiry_child");
        const refKeys = enrollment?.fields.map((f) => f.refKey) ?? [];
        expect(refKeys).not.toContain("inquiry_child.program");
        expect(refKeys).not.toContain("inquiry_child.schedule");
        expect(refKeys).toContain("inquiry_child.desired_program_type");
        expect(refKeys).toContain("inquiry_child.desired_schedule_type");
    });

    it("waitlist catalog is not manifest-filtered (flat VM refKeys preserved)", () => {
        const groups = catalogGroupsForEntityType("placement_candidate") ?? [];
        expect(groups.length).toBeGreaterThan(0);
        expect(groups.some((g) => g.fields.some((f) => f.refKey.startsWith("waitlist.")))).toBe(true);
    });
});

describe("platformFieldResolutionManifest — blocked keys", () => {
    it("blocks deprecated and mis-grained refKeys", () => {
        expect(isBlockedLayoutPickerRefKey("child_inquiry.program")).toBe(true);
        expect(isBlockedLayoutPickerRefKey("child.program")).toBe(true);
        expect(isBlockedLayoutPickerRefKey("person.primary_phone")).toBe(true);
        expect(isBlockedLayoutPickerRefKey("inquiry_child.notes")).toBe(false);
    });

    it("Lead picker eligible set is manifest-backed", () => {
        const eligible = allPickerEligibleRefKeys("opportunities");
        expect(eligible.length).toBeGreaterThan(0);
        expect(eligible.every((k) => !isBlockedLayoutPickerRefKey(k))).toBe(true);
        expect(PLATFORM_FIELD_MANIFEST.length).toBeGreaterThan(eligible.length);
    });
});
