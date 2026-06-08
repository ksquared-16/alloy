/**
 * Childcare layout field catalog — starter allowlist and picker guards.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CHILDCARE_HIDDEN_REF_KEYS,
    CHILDCARE_OPERATOR_ENTITY_LABELS,
    CHILDCARE_STARTER_FIELD_CATALOG,
    childcareCatalogRefKeysForOperatorEntity,
    childcareCopyContainsBannedPhrase,
    collectChildcareUserFacingCopy,
    isChildcareCatalogRefKey,
    isChildcareHiddenRefKey,
    organizeChildcarePickerGroups,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import { buildLeadLayoutPickerGroups, CURATED_FIELDS, LAYOUT_ENTITY_GROUPS } from "@/lib/layout/fieldCatalog";

const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260608120000_childcare_layout_field_catalog_seed.sql",
);

function leadPickerFromCuratedFallback() {
    const raw = LAYOUT_ENTITY_GROUPS.map((g) => ({
        entityKey: g.entityKey,
        entityLabel: g.entityLabel,
        fields: CURATED_FIELDS[g.entityKey] ?? [],
    }));
    return buildLeadLayoutPickerGroups(raw, "opportunities");
}

describe("childcare starter field catalog manifest", () => {
    it("defines all five operator entity groups", () => {
        expect(Object.keys(CHILDCARE_OPERATOR_ENTITY_LABELS).sort()).toEqual([
            "child",
            "household",
            "lead",
            "location",
            "parent",
        ]);
    });

    it("includes expected lead fields", () => {
        const leadKeys = childcareCatalogRefKeysForOperatorEntity("lead");
        expect(leadKeys).toContain("opportunity.status_key");
        expect(leadKeys).toContain("opportunity.tour_date");
        expect(leadKeys).toContain("opportunity.program_type");
        expect(leadKeys).not.toContain("opportunity.job_date");
    });

    it("includes child enrollment fields under child operator entity", () => {
        const childKeys = childcareCatalogRefKeysForOperatorEntity("child");
        expect(childKeys).toContain("inquiry_child.desired_start_date");
        expect(childKeys).toContain("inquiry_child.desired_program_type");
        expect(childKeys).toContain("person.allergies");
        expect(childKeys).not.toContain("child.name");
    });

    it("hides internal and raw id refKeys", () => {
        expect(isChildcareHiddenRefKey("opportunity.opportunity_number")).toBe(true);
        expect(isChildcareHiddenRefKey("person.person_number")).toBe(true);
        expect(isChildcareHiddenRefKey("child_inquiry.program")).toBe(true);
        expect(isChildcareHiddenRefKey("inquiry_child.location_id")).toBe(false);
        expect(isChildcareCatalogRefKey("inquiry_child.location_id")).toBe(true);
    });

    it("every starter entry has a unique refKey", () => {
        const keys = CHILDCARE_STARTER_FIELD_CATALOG.map((e) => e.refKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("childcare layout field catalog seed migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("seeds key opportunity and person fields for all orgs", () => {
        for (const key of ["tour_time", "program_type", "preferred_name", "sms_opt_in", "family_notes"]) {
            expect(sql).toContain(`'${key}'`);
        }
    });

    it("seeds household and location catalog fields", () => {
        expect(sql).toContain("'household_status'");
        expect(sql).toContain("'operating_hours'");
    });
});

describe("childcare picker output", () => {
    it("organizes groups as Lead, Child, Parent, Household, Location", () => {
        const groups = leadPickerFromCuratedFallback();
        expect(groups.map((g) => g.entityLabel)).toEqual([
            "Lead",
            "Child",
            "Parent / Contact",
            "Household",
            "Location",
        ]);
    });

    it("never emits child_inquiry.* refKeys", () => {
        const refKeys = groupsFlatRefKeys(leadPickerFromCuratedFallback());
        expect(refKeys.some((k) => k.startsWith("child_inquiry."))).toBe(false);
    });

    it("user-facing copy has no Inquiry Child / OCM jargon", () => {
        const copy = collectChildcareUserFacingCopy(leadPickerFromCuratedFallback());
        for (const line of copy) {
            expect(childcareCopyContainsBannedPhrase(line)).toBe(false);
        }
    });

    it("allows inquiry_child.* in machine refKeys only", () => {
        const refKeys = groupsFlatRefKeys(leadPickerFromCuratedFallback());
        expect(refKeys.some((k) => k.startsWith("inquiry_child."))).toBe(true);
        const labels = collectChildcareUserFacingCopy(leadPickerFromCuratedFallback());
        expect(labels.some((l) => l.includes("inquiry_child"))).toBe(false);
    });

    it("hides blocked refKeys from picker output", () => {
        const refKeys = groupsFlatRefKeys(leadPickerFromCuratedFallback());
        for (const blocked of CHILDCARE_HIDDEN_REF_KEYS) {
            expect(refKeys).not.toContain(blocked);
        }
    });

    it("bootstraps expected childcare fields when DB rows are absent", () => {
        const groups = organizeChildcarePickerGroups([], "opportunities");
        expect(groups.find((g) => g.entityLabel === "Lead")?.fields.length).toBeGreaterThan(5);
        expect(groups.find((g) => g.entityLabel === "Child")?.fields.some((f) => f.refKey === "inquiry_child.notes")).toBe(
            true,
        );
    });
});

function groupsFlatRefKeys(groups: ReturnType<typeof leadPickerFromCuratedFallback>): string[] {
    return groups.flatMap((g) => g.fields.map((f) => f.refKey));
}
