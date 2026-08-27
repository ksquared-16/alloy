/**
 * FC-CM-1 — customer_member field registry tests.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
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

    it("keeps the five original FC-CM-1 keys, in order, ahead of anything added later", () => {
        // The list is no longer frozen — Slice 5 appends durable child-profile facts to it. What
        // must not change is the ORIGINAL five: their keys are stamped into published forms and
        // stored field_values rows, so reordering or renaming one is a data-bearing change.
        expect(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.slice(0, 5)).toEqual([
            "preferred_name",
            "gender",
            "allergies",
            "medical_notes",
            "special_instructions",
        ]);
    });

    it("derives every key from the manifest — the manifest is the only place a key is declared", () => {
        expect(CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((r) => r.field_key)).toEqual([
            ...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
        ]);
        const sortOrders = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((r) => r.sort_order);
        expect(new Set(sortOrders).size, "two fields competing for one slot order arbitrarily").toBe(sortOrders.length);
    });

    it("classifies health data explicitly, and classifies only what is actually health data", () => {
        const health = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.filter((r) => r.sensitivity === "health").map(
            (r) => r.field_key,
        );
        expect(health).toEqual(["allergies", "medical_notes", "special_diet"]);
        // A food a child dislikes is a preference. Calling it health data would put ordinary
        // profile text behind health access rules and make the classification meaningless.
        expect(health).not.toContain("foods_refused");
        expect(health).not.toContain("favorite_foods");
    });

    it("creates no competing destination for a Health foundation kind (D-H5)", () => {
        // Enrollment may bind a child-grain NOTE. It may not invent the structured lifecycle for
        // allergy | condition | medication | immunization — the Health sprint owns that.
        for (const key of ["conditions", "medications", "immunizations", "immunization_records", "allergy_list"]) {
            expect(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS as readonly string[]).not.toContain(key);
        }
    });

    it("reserves native columns and config keys from custom field creation", () => {
        expect(isReservedCustomerMemberFieldKey("first_name")).toBe(true);
        expect(isReservedCustomerMemberFieldKey("allergies")).toBe(true);
        expect(isReservedCustomerMemberFieldKey("custom_tag")).toBe(false);
    });

    it("maps config keys to child.* layout refKeys", () => {
        expect([...CUSTOMER_MEMBER_CONFIG_LAYOUT_REF_KEYS]).toEqual(
            CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.map((k) => `child.${k}`),
        );
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

    it("documents field_values PATCH on customer-members route", () => {
        expect(CUSTOMER_MEMBER_FIELD_VALUES_PATCH.implemented).toBe(true);
        expect(CUSTOMER_MEMBER_FIELD_VALUES_PATCH.fieldValuesEntityType).toBe("customer_member");
        expect(CUSTOMER_MEMBER_FIELD_VALUES_PATCH.referenceImplementation).toContain("customer-members/[id]/route.ts");
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
        for (const key of CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.slice(0, 5)) {
            expect(sql).toContain(`'${key}'`);
        }
        expect(sql).toContain("'customer_member'");
        expect(sql).not.toContain("'person', 'allergies'");
        expect(sql).not.toContain("'person', 'gender'");
    });
});

describe("every manifest row has a database destination", () => {
    // The manifest now derives the four code surfaces, but a field_definitions row is seeded by a
    // migration — the one surface no amount of derivation can reach. A manifest key with no seed
    // renders as nothing in every tenant and reads exactly like "the operator hid that field".
    const migrationsDir = resolve(__dirname, "../../../../supabase/migrations");
    const seededKeys = new Set<string>();
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
        const body = readFileSync(resolve(migrationsDir, file), "utf8");
        const at = body.indexOf("public.field_definitions");
        if (at < 0) continue;
        // Scan only the field_definitions statement — the SECTION seed above it uses the same
        // ('customer_member', '<key>') shape, and 'medical' is a section, not a field.
        for (const m of body.slice(at).matchAll(/\('customer_member',\s*'([a-z_]+)'/g)) seededKeys.add(m[1]);
    }

    it("seeds every configurable key somewhere in the migration history", () => {
        const unseeded = CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.filter((k) => !seededKeys.has(k));
        expect(unseeded, "manifest keys with no field_definitions seed").toEqual([]);
    });

    it("seeds nothing that the manifest does not declare", () => {
        const orphaned = [...seededKeys].filter((k) => !CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.includes(k as never));
        expect(orphaned, "seeded rows no code surface knows about").toEqual([]);
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
