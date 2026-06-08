/**
 * FC-CM-1 — customer_member field registry tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    CUSTOMER_MEMBER_CONFIG_LAYOUT_REF_KEYS,
    CUSTOMER_MEMBER_ENTITY_TYPE,
    CUSTOMER_MEMBER_FIELD_VALUES_PATCH,
    isCustomerMemberConfigFieldKey,
    isReservedCustomerMemberFieldKey,
} from "@/lib/fields/customerMemberFieldRegistry";
import { FIELD_DEFINITION_ENTITY_TYPES } from "@/lib/fields/inquiryChildFieldRegistry";
import {
    CHILDCARE_REQUIRES_CUSTOMER_MEMBER_FIELD_DEF_REF_KEYS,
    isChildcareCatalogRefKey,
    isChildcareHiddenRefKey,
    isCustomerMemberConfigChildRefKey,
} from "@/lib/layout/childcareLayoutFieldCatalog";
import { buildLeadLayoutPickerGroups, CURATED_FIELDS, LAYOUT_ENTITY_GROUPS } from "@/lib/layout/fieldCatalog";
import { computeCustomerMemberConfigParityGaps } from "@/lib/fields/customerMemberFieldParity";

const fcCm1MigrationPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260609120000_customer_member_field_definitions_fc_cm1.sql",
);

function leadPickerFromCuratedFallback() {
    const raw = LAYOUT_ENTITY_GROUPS.map((g) => ({
        entityKey: g.entityKey,
        entityLabel: g.entityLabel,
        fields: CURATED_FIELDS[g.entityKey] ?? [],
    }));
    return buildLeadLayoutPickerGroups(raw, "opportunities");
}

describe("customerMemberFieldRegistry", () => {
    it("includes customer_member in field definition entity types", () => {
        expect(FIELD_DEFINITION_ENTITY_TYPES).toContain(CUSTOMER_MEMBER_ENTITY_TYPE);
    });

    it("defines five configurable child profile field keys", () => {
        expect(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS).toEqual([
            "preferred_name",
            "gender",
            "allergies",
            "medical_notes",
            "special_instructions",
        ]);
    });

    it("reserves native columns and config keys from custom field creation", () => {
        expect(isReservedCustomerMemberFieldKey("first_name")).toBe(true);
        expect(isReservedCustomerMemberFieldKey("allergies")).toBe(true);
        expect(isReservedCustomerMemberFieldKey("custom_tag")).toBe(false);
    });

    it("maps config keys to child.* layout refKeys", () => {
        expect(CUSTOMER_MEMBER_CONFIG_LAYOUT_REF_KEYS).toEqual([
            "child.preferred_name",
            "child.gender",
            "child.allergies",
            "child.medical_notes",
            "child.special_instructions",
        ]);
        for (const refKey of CUSTOMER_MEMBER_CONFIG_LAYOUT_REF_KEYS) {
            expect(isChildcareCatalogRefKey(refKey)).toBe(true);
            expect(isCustomerMemberConfigChildRefKey(refKey)).toBe(true);
        }
    });

    it("does not expose child config as person.* in picker", () => {
        for (const key of CUSTOMER_MEMBER_CONFIG_FIELD_KEYS) {
            expect(isChildcareHiddenRefKey(`person.${key}`)).toBe(true);
            expect(isChildcareCatalogRefKey(`person.${key}`)).toBe(false);
        }
    });

    it("documents field_values PATCH follow-up as not yet implemented", () => {
        expect(CUSTOMER_MEMBER_FIELD_VALUES_PATCH.implemented).toBe(false);
        expect(CUSTOMER_MEMBER_FIELD_VALUES_PATCH.fieldValuesEntityType).toBe("customer_member");
    });
});

describe("customer_member config parity", () => {
    it("reports gaps when config field_definitions rows are missing", () => {
        const gaps = computeCustomerMemberConfigParityGaps([{ field_key: "allergies", entity_type: "customer_member" }]);
        expect(gaps).toContain("gender");
        expect(gaps).not.toContain("allergies");
    });
});

describe("FC-CM-1 migration draft", () => {
    const sql = readFileSync(fcCm1MigrationPath, "utf8");

    it("seeds customer_member child profile config fields for all orgs", () => {
        for (const key of CUSTOMER_MEMBER_CONFIG_FIELD_KEYS) {
            expect(sql).toContain(`'${key}'`);
        }
        expect(sql).toContain("'customer_member'");
        expect(sql).not.toContain("'person', 'allergies'");
        expect(sql).not.toContain("'person', 'gender'");
    });
});

describe("childcare catalog alignment with FC-CM-1", () => {
    it("catalog requires refKeys match customer_member config manifest", () => {
        expect([...CHILDCARE_REQUIRES_CUSTOMER_MEMBER_FIELD_DEF_REF_KEYS].sort()).toEqual(
            [...CUSTOMER_MEMBER_CONFIG_LAYOUT_REF_KEYS].sort(),
        );
    });

    it("lead picker includes child config fields as child.* not person.*", () => {
        const refKeys = leadPickerFromCuratedFallback().flatMap((g) => g.fields.map((f) => f.refKey));
        for (const refKey of CUSTOMER_MEMBER_CONFIG_LAYOUT_REF_KEYS) {
            expect(refKeys).toContain(refKey);
        }
        for (const key of CUSTOMER_MEMBER_CONFIG_FIELD_KEYS) {
            expect(refKeys).not.toContain(`person.${key}`);
        }
        expect(refKeys.some((k) => k.startsWith("child_inquiry."))).toBe(false);
    });

    it("native child profile keys remain on customer_members not person bridge", () => {
        expect(isCustomerMemberConfigFieldKey("first_name")).toBe(false);
        const childGroup = leadPickerFromCuratedFallback().find((g) => g.entityLabel === "Child");
        const refKeys = childGroup?.fields.map((f) => f.refKey) ?? [];
        expect(refKeys).toContain("child.first_name");
        expect(refKeys).toContain("child.last_name");
        expect(refKeys).toContain("child.date_of_birth");
    });
});
