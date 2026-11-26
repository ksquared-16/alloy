import { describe, expect, it } from "vitest";
import {
    buildFormSystemFieldPicker,
    buildFormRelationshipFieldPickerPlatformBaseline,
    fieldDefToFormRegistryEntry,
    pickerUsesCanonicalProviderDerivation,
    providerToFormRegistryEntry,
} from "@/lib/fields/formFieldRegistryPicker";
import { filterFormsDocumentsDataProviders, resetCanonicalDataProviderCacheForTests } from "@/lib/fields/canonicalDataProviderRegistry";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

describe("formFieldRegistryPicker", () => {
    it("converts field_definitions row to registry entry with option set", () => {
        const entry = fieldDefToFormRegistryEntry({
            entity_type: "inquiry_child",
            field_key: "preferred_start_month",
            field_type: "select",
            label: "Preferred Start Month",
            config: { option_set_key: "summer_months" },
            is_system: false,
            is_active: true,
        });
        expect(entry.field_key).toBe("preferred_start_month");
        expect(entry.suggested_kind).toBe("select");
        expect(entry.default_option_set_key).toBe("summer_months");
        expect(entry.entity_type).toBe("child");
    });

    it("uses canonical provider derivation when org defs exist", () => {
        resetCanonicalDataProviderCacheForTests();
        const orgDefs = [
            {
                entity_type: "person",
                field_key: "first_name",
                field_type: "text",
                label: "First name",
                is_system: true,
                is_active: true,
            },
        ];
        expect(pickerUsesCanonicalProviderDerivation(orgDefs)).toBe(true);
        const picker = buildFormSystemFieldPicker(orgDefs);
        expect(picker.length).toBeGreaterThan(0);
        const guardianEntries = picker.filter((e) => e.field_key === "guardian_first_name");
        expect(guardianEntries).toHaveLength(1);
        expect(guardianEntries[0]?.id).toBe("guardian_first_name");
    });

    it("empty org defs still yields canonical platform seeds; ambiguous guardian_email uses relationship picker", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = buildFormSystemFieldPicker([], OPERATIONAL_FORM_SYSTEM_FIELDS);
        expect(picker.length).toBeGreaterThan(0);
        expect(picker.some((e) => e.id === "guardian_email")).toBe(false);
        const relationshipPicker = buildFormRelationshipFieldPickerPlatformBaseline();
        expect(relationshipPicker.some((e) => e.id === "rel:person.contact_role.primary.email")).toBe(true);
    });

    it("tenant business fields appear in picker output", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = buildFormSystemFieldPicker([
            {
                entity_type: "customer",
                field_key: "referral_source",
                field_type: "text",
                label: "Referral source",
                is_system: false,
                is_active: true,
            },
        ]);
        expect(picker.some((e) => e.id.includes("referral_source"))).toBe(true);
    });

    it("new picker selection produces compatible field_source via provider adapter", () => {
        resetCanonicalDataProviderCacheForTests();
        const providers = filterFormsDocumentsDataProviders({
            tenantFieldDefinitions: [
                {
                    entity_type: "person",
                    field_key: "email",
                    field_type: "email",
                    label: "Email",
                    is_system: true,
                    is_active: true,
                },
            ],
        });
        const provider = providers.find((p) => p.refKey === "person.email");
        expect(provider).toBeDefined();
        const entry = providerToFormRegistryEntry(provider!);
        expect(entry.entity_type).toBe("guardian");
        expect(entry.field_key).toBe("guardian_email");
    });
});
