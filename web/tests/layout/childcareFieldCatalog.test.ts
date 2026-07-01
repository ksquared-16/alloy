/**
 * Childcare layout field catalog — starter allowlist and picker guards.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CHILDCARE_FC3_DEFERRED_REF_KEYS,
    CHILDCARE_CATALOG_BY_REFKEY,
    CHILDCARE_HIDDEN_REF_KEYS,
    CHILDCARE_OPERATOR_ENTITY_LABELS,
    CHILDCARE_PRIMARY_CONTACT_PROJECTION_REF_KEYS,
    CHILDCARE_REMOVED_FROM_PICKER_REF_KEYS,
    CHILDCARE_REQUIRES_CUSTOMER_MEMBER_FIELD_DEF_REF_KEYS,
    CHILDCARE_STARTER_FIELD_CATALOG,
    childcareCatalogRefKeysForOperatorEntity,
    childcareCopyContainsBannedPhrase,
    collectChildcareUserFacingCopy,
    isChildcareCatalogRefKey,
    isChildcareFieldDefBackedRefKey,
    isChildcareHiddenRefKey,
    isCustomerMemberConfigChildRefKey,
    isCustomerMemberSourcedChildRefKey,
    isPrimaryContactProjectionRefKey,
    organizeChildcarePickerGroups,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import { buildLeadLayoutPickerGroups, catalogGroupsForEntityType, CURATED_FIELDS, LAYOUT_ENTITY_GROUPS } from "@/lib/layout/fieldCatalog";

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

function groupsFlatRefKeys(groups: ReturnType<typeof leadPickerFromCuratedFallback>): string[] {
    return groups.flatMap((g) => g.fields.map((f) => f.refKey));
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

    it("includes lead tour fields but not per-child enrollment duplicates", () => {
        const leadKeys = childcareCatalogRefKeysForOperatorEntity("lead");
        expect(leadKeys).toContain("opportunity.status_key");
        expect(leadKeys).toContain("opportunity.tour_date");
        expect(leadKeys).not.toContain("opportunity.program_type");
        expect(leadKeys).not.toContain("opportunity.schedule_type");
        expect(leadKeys).not.toContain("opportunity.desired_start_date");
        expect(leadKeys).not.toContain("opportunity.job_date");
    });

    it("sources durable child profile from customer_members not person bridge", () => {
        expect(isCustomerMemberSourcedChildRefKey("child.first_name")).toBe(true);
        expect(isCustomerMemberSourcedChildRefKey("child.last_name")).toBe(true);
        expect(isCustomerMemberSourcedChildRefKey("child.date_of_birth")).toBe(true);
        expect(isCustomerMemberConfigChildRefKey("child.preferred_name")).toBe(true);
        expect(isCustomerMemberSourcedChildRefKey("child.preferred_name")).toBe(false);
    });

    it("includes child enrollment fields under child operator entity", () => {
        const childKeys = childcareCatalogRefKeysForOperatorEntity("child");
        expect(childKeys).toContain("inquiry_child.desired_start_date");
        expect(childKeys).toContain("inquiry_child.desired_program_type");
        expect(childKeys).toContain("child.allergies");
        expect(childKeys).toContain("child.gender");
        expect(childKeys).not.toContain("person.allergies");
        expect(childKeys).not.toContain("person.gender");
        expect(childKeys).not.toContain("child.name");
    });

    it("sources child medical/profile config on customer_member not person bridge", () => {
        expect(isCustomerMemberConfigChildRefKey("child.allergies")).toBe(true);
        expect(isCustomerMemberConfigChildRefKey("child.gender")).toBe(true);
        expect(isChildcareHiddenRefKey("person.allergies")).toBe(true);
        expect(isChildcareHiddenRefKey("person.gender")).toBe(true);
    });

    it("includes parent employee fields", () => {
        const parentKeys = childcareCatalogRefKeysForOperatorEntity("parent");
        expect(parentKeys).toContain("person.is_employee");
        expect(parentKeys).toContain("person.employee_id");
    });

    it("defines native site location columns in catalog but not on opportunity drawer anchor", () => {
        expect(CHILDCARE_CATALOG_BY_REFKEY.has("location.label")).toBe(true);
        expect(CHILDCARE_CATALOG_BY_REFKEY.has("location.address1")).toBe(true);
        expect(CHILDCARE_CATALOG_BY_REFKEY.has("location.postal_code")).toBe(true);
        expect(isChildcareCatalogRefKey("location.label", "opportunities")).toBe(false);
        expect(isChildcareCatalogRefKey("location.address1", "opportunities")).toBe(false);
        expect(CHILDCARE_CATALOG_BY_REFKEY.has("location.name")).toBe(false);
        expect(CHILDCARE_CATALOG_BY_REFKEY.has("location.address_line1")).toBe(false);
    });

    it("hides internal, removed, and raw id refKeys", () => {
        expect(isChildcareHiddenRefKey("opportunity.opportunity_number")).toBe(true);
        expect(isChildcareHiddenRefKey("person.person_number")).toBe(true);
        expect(isChildcareHiddenRefKey("child_inquiry.program")).toBe(true);
        expect(isChildcareHiddenRefKey("person.relationship_to_child")).toBe(true);
        expect(isChildcareCatalogRefKey("person.address_line1", "person")).toBe(true);
        expect(isChildcareCatalogRefKey("person.address_line1", "opportunities")).toBe(false);
        expect(isChildcareCatalogRefKey("person.secondary_phone", "opportunities")).toBe(false);
        expect(isChildcareHiddenRefKey("inquiry_child.location_id")).toBe(false);
        expect(isChildcareCatalogRefKey("inquiry_child.location_id")).toBe(true);
        expect(isChildcareHiddenRefKey("opportunity.location_id")).toBe(false);
        expect(isChildcareCatalogRefKey("opportunity.location_id")).toBe(true);
    });

    it("every starter entry has a unique refKey", () => {
        const keys = CHILDCARE_STARTER_FIELD_CATALOG.map((e) => e.refKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("childcare layout field catalog seed migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("seeds valid opportunity tour and person contact config fields", () => {
        for (const key of ["tour_time", "sms_opt_in", "family_notes", "communication_preference"]) {
            expect(sql).toContain(`'${key}'`);
        }
    });

    it("does not seed child profile or medical fields on person entity", () => {
        const insertSection = sql.slice(0, sql.indexOf("-- Deactivate wrong seeds"));
        for (const key of [
            "preferred_name",
            "allergies",
            "medical_notes",
            "gender",
            "special_instructions",
            "program_type",
            "schedule_type",
            "desired_start_date",
            "relationship_to_child",
            "primary_contact",
            "address_line1",
            "household_status",
        ]) {
            expect(insertSection).not.toMatch(new RegExp(`'${key}'`, "g"));
        }
        expect(insertSection).not.toContain("'location', 'name'");
        expect(insertSection).not.toContain("'location', 'address_line1'");
        expect(sql).toContain("20260609120000_customer_member_field_definitions_fc_cm1.sql");
    });

    it("deactivates prior wrong seeds via cleanup block", () => {
        expect(sql).toContain("is_active = false");
        expect(sql).toContain("('person', 'relationship_to_child')");
        expect(sql).toContain("('location', 'name')");
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
        ]);
    });

    it("Child group has Enrollment details subtitle", () => {
        const childGroup = leadPickerFromCuratedFallback().find((g) => g.entityLabel === "Child");
        expect(childGroup?.groupSubtitle).toBe("Enrollment details");
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
        for (const removed of CHILDCARE_REMOVED_FROM_PICKER_REF_KEYS) {
            expect(refKeys).not.toContain(removed);
        }
    });

    it("offers person address on person anchor only, not as generic lead contact field", () => {
        const leadRefs = groupsFlatRefKeys(leadPickerFromCuratedFallback());
        expect(leadRefs).not.toContain("person.address_line1");
        expect(leadRefs).not.toContain("location.address1");

        const personGroups = organizeChildcarePickerGroups([], "person");
        const personRefs = personGroups.flatMap((g) => g.fields.map((f) => f.refKey));
        expect(personRefs).toContain("person.address_line1");
        expect(personRefs).toContain("person.city");
    });

    it("does not offer relationship_to_child or legacy secondary phone", () => {
        const refKeys = groupsFlatRefKeys(leadPickerFromCuratedFallback());
        expect(refKeys).not.toContain("person.relationship_to_child");
        expect(refKeys).not.toContain("person.secondary_phone");
    });

    it("bootstraps expected childcare fields when DB rows are absent", () => {
        const groups = organizeChildcarePickerGroups([], "opportunities");
        expect(groups.find((g) => g.entityLabel === "Lead")?.fields.length).toBeGreaterThan(5);
        expect(groups.find((g) => g.entityLabel === "Child")?.fields.some((f) => f.refKey === "inquiry_child.notes")).toBe(
            true,
        );
        expect(groups.find((g) => g.entityLabel === "Parent / Contact")?.fields.some((f) => f.refKey === "person.is_employee")).toBe(
            true,
        );
    });
});

describe("customer_member field def migration gate", () => {
    it("documents child config fields pending customer_member registry", () => {
        for (const key of CHILDCARE_REQUIRES_CUSTOMER_MEMBER_FIELD_DEF_REF_KEYS) {
            expect(isCustomerMemberConfigChildRefKey(key)).toBe(true);
            expect(isChildcareCatalogRefKey(key)).toBe(true);
        }
    });
});

describe("FC-3 deferred relationship projections", () => {
    it("documents deferred refKeys as hidden", () => {
        for (const key of CHILDCARE_FC3_DEFERRED_REF_KEYS) {
            expect(isChildcareHiddenRefKey(key)).toBe(true);
            expect(isChildcareCatalogRefKey(key)).toBe(false);
        }
    });
});

describe("lead primary contact projections", () => {
    it("includes primary contact projections on opportunity anchor Parent / Contact group", () => {
        const groups = leadPickerFromCuratedFallback();
        const parentGroup = groups.find((g) => g.entityLabel === "Parent / Contact");
        expect(parentGroup).toBeDefined();
        const refKeys = parentGroup!.fields.map((f) => f.refKey);
        for (const key of CHILDCARE_PRIMARY_CONTACT_PROJECTION_REF_KEYS) {
            expect(refKeys).toContain(key);
        }
        expect(parentGroup!.fields.find((f) => f.refKey === "person.primary_contact_name")?.fieldLabel).toBe(
            "Primary contact name",
        );
    });

    it("primary contact projections are not field_definitions-backed catalog entries", () => {
        for (const key of CHILDCARE_PRIMARY_CONTACT_PROJECTION_REF_KEYS) {
            expect(isPrimaryContactProjectionRefKey(key)).toBe(true);
            expect(isChildcareFieldDefBackedRefKey(key)).toBe(false);
        }
    });

    it("excludes primary contact projections from person drawer picker (native person fields only)", () => {
        const personGroups = catalogGroupsForEntityType("person") ?? [];
        const refKeys = personGroups.flatMap((g) => g.fields.map((f) => f.refKey));
        for (const key of CHILDCARE_PRIMARY_CONTACT_PROJECTION_REF_KEYS) {
            expect(refKeys).not.toContain(key);
        }
        expect(refKeys).toContain("person.first_name");
        expect(refKeys).toContain("person.email");
    });

    it("keeps fake customer primary contact text fields hidden", () => {
        const refKeys = groupsFlatRefKeys(leadPickerFromCuratedFallback());
        expect(refKeys).not.toContain("customer.primary_contact");
        expect(refKeys).not.toContain("customer.primary_contact_name");
        expect(isChildcareHiddenRefKey("customer.primary_contact")).toBe(true);
    });

    it("lead picker copy has no Inquiry Child jargon", () => {
        const copy = collectChildcareUserFacingCopy(leadPickerFromCuratedFallback());
        for (const line of copy) {
            expect(childcareCopyContainsBannedPhrase(line)).toBe(false);
        }
    });
});
