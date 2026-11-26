import { describe, expect, it } from "vitest";
import {
    buildFormSystemFieldPicker,
    buildFormSystemFieldPickerPlatformBaseline,
    providerToFormRegistryEntry,
} from "@/lib/fields/formFieldRegistryPicker";
import { filterFormsDocumentsDataProviders, resetCanonicalDataProviderCacheForTests } from "@/lib/fields/canonicalDataProviderRegistry";
import {
    canonicalProviderToFormFieldSource,
    formFieldSourceToCanonicalProvider,
} from "@/lib/fields/formsFieldSourceBinding";
import { findFormsDocumentsDataProvider } from "@/lib/fields/canonicalDataProviderRegistry";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { validatePosConnectedFieldBinding, fieldDefinitionKey } from "@/lib/forms/binding/validatePosConnectedFieldBinding";
import { buildPacketFieldPlan } from "@/lib/pos/packet/packetFieldPlan";
import type { FormSchemaV1 } from "@/lib/forms/schema";

describe("formsFieldSourceBinding round trip", () => {
    const cases = [
        {
            name: "Guardian/Primary Contact email",
            providerRef: "person.email",
            expectedSource: { entity_type: "guardian", field_key: "guardian_email" },
            expectedCanonical: { entity_type: "person", field_key: "email" },
        },
        {
            name: "Child name",
            providerRef: "customer_member.first_name",
            expectedSource: { entity_type: "child", field_key: "child_first_name" },
            expectedCanonical: { entity_type: "customer_member", field_key: "first_name" },
        },
        {
            name: "Child date of birth",
            providerRef: "customer_member.dob",
            expectedSource: { entity_type: "child", field_key: "child_date_of_birth" },
            expectedCanonical: { entity_type: "customer_member", field_key: "dob" },
        },
        {
            name: "Enrollment/program field",
            providerRef: "inquiry_child.program_category_id",
            expectedSource: { entity_type: "enrollment", field_key: "program_category_id" },
            expectedCanonical: { entity_type: "inquiry_child", field_key: "program_category_id" },
        },
        {
            name: "Household-level field",
            providerRef: "customer.display_name",
            expectedSource: { entity_type: "customer", field_key: "customer_account_name" },
            expectedCanonical: { entity_type: "customer", field_key: "display_name" },
        },
    ] as const;

    it.each(cases)("$name preserves semantic identity", ({ providerRef, expectedSource, expectedCanonical }) => {
        resetCanonicalDataProviderCacheForTests();
        const provider = findFormsDocumentsDataProvider(providerRef);
        expect(provider).toBeDefined();

        const source = canonicalProviderToFormFieldSource(provider!);
        expect(source.entity_type).toBe(expectedSource.entity_type);
        expect(source.field_key).toBe(expectedSource.field_key);

        const resolution = formFieldSourceToCanonicalProvider(source);
        expect(resolution.canonicalRef).toMatchObject(expectedCanonical);
        expect(resolution.persistedSource).toEqual(source);
    });

    it("tenant-defined custom field uses registry grain in field_source when no legacy alias", () => {
        resetCanonicalDataProviderCacheForTests();
        const provider = {
            refKey: "person.referral_source",
            label: "Referral source",
            kind: "business_field" as const,
            outputShape: "scalar" as const,
            entityNamespace: "guardian",
            settingsEntity: "person",
            fieldType: "text",
            isSystem: false,
            availability: { pipeline: true, waitlist: true },
        };
        const entry = providerToFormRegistryEntry(provider, {
            entity_type: "person",
            field_key: "referral_source",
            field_type: "text",
            label: "Referral source",
            is_system: false,
            is_active: true,
        });
        const field = formFieldFromRegistryEntry(entry, {});
        expect(field.field_source?.entity_type).toBe("guardian");
        expect(field.field_source?.field_key).toBe("referral_source");

        const resolution = formFieldSourceToCanonicalProvider(field.field_source!);
        expect(resolution.status).toBe("canonical");
        expect(resolution.canonicalRef).toMatchObject({ entity_type: "person", field_key: "referral_source" });
    });

    it("platform field round-trips through legacy alias storage", () => {
        resetCanonicalDataProviderCacheForTests();
        const provider = findFormsDocumentsDataProvider("person.phone");
        expect(provider?.kind).toBe("platform_field");
        const source = canonicalProviderToFormFieldSource(provider!);
        expect(source.field_key).toBe("guardian_phone");
        const back = formFieldSourceToCanonicalProvider(source);
        expect(back.canonicalRef).toMatchObject({ entity_type: "person", field_key: "phone" });
    });

    it("unknown binding returns typed unresolved result", () => {
        const resolution = formFieldSourceToCanonicalProvider({
            entity_type: "made_up",
            field_key: "unknown_field",
        });
        expect(resolution.status).toBe("unknown");
        expect(resolution.canonicalRef).toBeNull();
    });

    it("wrong-entity binding does not normalize to unrelated canonical field", () => {
        const resolution = formFieldSourceToCanonicalProvider({
            entity_type: "guardian",
            field_key: "program_category_id",
        });
        expect(resolution.canonicalRef?.entity_type).not.toBe("inquiry_child");
    });

    it("legacy load-only signature binding hydrates as legacy_load_only", () => {
        const resolution = formFieldSourceToCanonicalProvider({
            entity_type: "enrollment",
            field_key: "enrollment_acknowledgement_signature",
        });
        expect(resolution.status).toBe("legacy_load_only");
    });

    it("child identity vs enrollment data remain distinct", () => {
        const childName = formFieldSourceToCanonicalProvider({
            entity_type: "child",
            field_key: "child_first_name",
        });
        const program = formFieldSourceToCanonicalProvider({
            entity_type: "enrollment",
            field_key: "program_category_id",
        });
        expect(childName.canonicalRef?.entity_type).toBe("customer_member");
        expect(program.canonicalRef?.entity_type).toBe("inquiry_child");
        expect(childName.canonicalRef?.entity_type).not.toBe(program.canonicalRef?.entity_type);
    });
});

describe("formsDocuments schema compatibility", () => {
    it("adult (guardian) fields normalize to a canonical person binding; other fields keep registry vocabulary", () => {
        // The Processing identity engine (extractBoundPerson) only maps fields whose
        // field_source is a canonical PERSON binding, so adult/guardian fields are normalized
        // at author time (see sourceFromEntry). Everything else keeps its registry vocabulary.
        const PERSON_FIELD_KEY_BY_ID: Record<string, string> = {
            guardian_first_name: "first_name",
            guardian_last_name: "last_name",
            guardian_email: "email",
            guardian_phone: "phone",
        };
        for (const entry of OPERATIONAL_FORM_SYSTEM_FIELDS) {
            if (entry.id === "enrollment_acknowledgement_signature") continue;
            const field = formFieldFromRegistryEntry(entry, {});
            const personKey = PERSON_FIELD_KEY_BY_ID[entry.id];
            if (personKey) {
                expect(field.field_source?.entity_type).toBe("person");
                expect(field.field_source?.field_key).toBe(personKey);
                // The field id (entry.field_key, e.g. "guardian_email") is unchanged so
                // intake-meta resolution by field id is unaffected.
                expect(field.id).toBe(entry.field_key);
            } else {
                expect(field.field_source?.entity_type).toBe(entry.entity_type);
                expect(field.field_source?.field_key).toBe(entry.field_key);
            }
            if (entry.shared_value_key) {
                expect(field.field_source?.shared_value_key).toBe(entry.shared_value_key);
            }
        }
    });

    it("legacy fields do not duplicate new picker entries for same canonical ref", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = buildFormSystemFieldPicker([
            {
                entity_type: "person",
                field_key: "email",
                field_type: "email",
                label: "Email",
                is_system: true,
                is_active: true,
            },
        ]);
        const emailEntries = picker.filter((e) => e.field_key === "guardian_email");
        expect(emailEntries).toHaveLength(1);
    });

    it("packet dedupe keys remain stable for legacy bindings", () => {
        const childEntry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_first_name")!;
        const schema: FormSchemaV1 = {
            schema_version: 1,
            title: "Test",
            sections: [{ id: "main", title: "Main", field_ids: ["child_first_name"] }],
            fields: [formFieldFromRegistryEntry(childEntry, {})],
        };
        const plan = buildPacketFieldPlan([
            { form_id: "f1", schema: { fields: schema.fields } },
            { form_id: "f2", schema: { fields: schema.fields } },
        ]);
        expect(plan.entries).toHaveLength(1);
        expect(plan.entries[0]?.canonical_key).toContain("child");
    });

    it("publish validation rejects unsupported provider kinds", () => {
        resetCanonicalDataProviderCacheForTests();
        const keys = new Set([fieldDefinitionKey("person", "email")]);
        const result = validatePosConnectedFieldBinding(
            {
                fields: [
                    {
                        id: "bad",
                        label: "Bad",
                        required: false,
                        type: "text",
                        field_source: { entity_type: "made_up", field_key: "not_real" },
                    },
                ],
            },
            keys,
        );
        expect(result.ok).toBe(false);
        expect(result.violations[0]?.reason).toBe("unknown_binding");
    });
});

describe("form picker first-paint baseline", () => {
    it("platform baseline is non-empty without tenant defs or operational fallback", () => {
        resetCanonicalDataProviderCacheForTests();
        const baseline = buildFormSystemFieldPickerPlatformBaseline();
        expect(baseline.length).toBeGreaterThan(0);
        expect(baseline.some((e) => e.entity_type === "child")).toBe(true);
    });

    it("tenant merge replaces platform entry labels but preserves canonical identity", () => {
        resetCanonicalDataProviderCacheForTests();
        const merged = buildFormSystemFieldPicker([
            {
                entity_type: "person",
                field_key: "email",
                field_type: "email",
                label: "Primary email address",
                is_system: true,
                is_active: true,
            },
        ]);
        const email = merged.find((e) => e.field_key === "guardian_email");
        expect(email?.default_label).toBe("Primary email address");
        expect(email?.field_key).toBe("guardian_email");
    });

    it("canonical derivation excludes unsupported provider kinds from picker", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = filterFormsDocumentsDataProviders({});
        expect(picker.every((p) => p.kind === "business_field" || p.kind === "platform_field")).toBe(true);
        expect(picker.every((p) => p.outputShape === "scalar")).toBe(true);
    });
});
