import { describe, expect, it } from "vitest";
import {
    buildFormRelationshipFieldPickerPlatformBaseline,
    buildFormSystemFieldPickerPlatformBaseline,
} from "@/lib/fields/formFieldRegistryPicker";
import { resetCanonicalDataProviderCacheForTests } from "@/lib/fields/canonicalDataProviderRegistry";
import {
    buildFormsCollectionBindingSeeds,
    buildFormsRelationshipProviderSeeds,
    findFormsRelationshipProvider,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import {
    assertRelationshipLineageRoundTrip,
    preserveLegacyFieldSourceOnHydration,
    relationshipProviderToFormFieldSource,
} from "@/lib/fields/formsRelationshipFieldSourceBinding";
import {
    collectionBindingAuthoringEnabled,
    collectionBindingAuthoringEnabledForRef,
    collectionBindingFromProvider,
    validateNestedFieldForIterationEntity,
} from "@/lib/fields/formsCollectionRepeatBinding";
import {
    isLegacyAmbiguousContactSystemFieldId,
    formsRelationshipRoleFromSource,
    legacyGuardianFlatCanonicalRef,
} from "@/lib/fields/formsLegacyContactRoleCompatibility";
import {
    formsRelationshipWriteModeForProvider,
    relationshipBindingMustBeReadOnlyAtPublish,
} from "@/lib/fields/formsRelationshipWriteSemantics";
import {
    isFormsRelationshipAuthorableInP2,
    isFormsRelationshipPublishableInP2,
} from "@/lib/fields/formsRelationshipOperationalSupport";
import { transportFieldSourceForRelationshipProvider } from "@/lib/fields/formsRelationshipTransport";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { validatePosConnectedFieldBinding } from "@/lib/forms/binding/validatePosConnectedFieldBinding";
import { validateFormsDocumentsP2Bindings } from "@/lib/forms/binding/validateFormsDocumentsP2Bindings";
import { buildRelationshipPrefillFieldMap } from "@/lib/forms/prefill/formsRelationshipPrefillMap";
import { buildPacketFieldPlan } from "@/lib/pos/packet/packetFieldPlan";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { formFieldSourceToCanonicalProvider } from "@/lib/fields/formsFieldSourceBinding";

describe("Forms P2 relationship identity and transport", () => {
    it("uses manifest leaf transport keys — not invented role_contact_* keys", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.primary.email")!;
        const source = relationshipProviderToFormFieldSource(provider);
        expect(source.field_key).toBe("primary_email");
        expect(source.entity_type).toBe("guardian");
        expect(source.relationship?.leaf_provider_ref_key).toBe("person.primary_email");
        expect(source.relationship?.provider_ref_key).toBe("person.contact_role.primary.email");
        expect(source.field_key).not.toMatch(/primary_contact_email/);
    });

    it("Primary Contact → Email round-trips canonical lineage", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.primary.email")!;
        const source = relationshipProviderToFormFieldSource(provider);
        expect(assertRelationshipLineageRoundTrip(source)).toBe(true);
        expect(formFieldSourceToCanonicalProvider(source).persistedSource).toEqual(source);
    });

    it("canonical provider → persisted binding → provider ref resolves", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.primary.phone")!;
        const source = relationshipProviderToFormFieldSource(provider);
        const back = formFieldSourceToCanonicalProvider(source);
        expect(back.canonicalRef).toMatchObject({ entity_type: "person", field_key: "primary_phone" });
    });

    it("legacy guardian_email is unchanged on hydration", () => {
        const legacy = { entity_type: "guardian", field_key: "guardian_email" } as const;
        const hydrated = preserveLegacyFieldSourceOnHydration(legacy);
        expect(hydrated).toEqual(legacy);
        expect(hydrated.relationship).toBeUndefined();
    });

    it("legacy guardian_email canonical ref remains person.email without role", () => {
        const resolution = formFieldSourceToCanonicalProvider({
            entity_type: "guardian",
            field_key: "guardian_email",
        });
        expect(resolution.canonicalRef).toMatchObject({ entity_type: "person", field_key: "email" });
        expect(legacyGuardianFlatCanonicalRef("guardian_email")).toMatchObject({ entity_type: "person", field_key: "email" });
        expect(isLegacyAmbiguousContactSystemFieldId("guardian_email")).toBe(true);
    });

    it("Primary Contact and ambiguous guardian_email remain distinct identities", () => {
        const primary = relationshipProviderToFormFieldSource(
            findFormsRelationshipProvider("person.contact_role.primary.email")!,
        );
        const legacy = { entity_type: "guardian", field_key: "guardian_email" };
        expect(primary.field_key).not.toBe(legacy.field_key);
        expect(primary.relationship?.role).toBe("primary");
        expect(formsRelationshipRoleFromSource(undefined, null)).toBeNull();
    });
});

describe("Forms P2 relationship identity contracts", () => {
    it("provider_ref_key is canonical relationship-leaf identity — labels are not identity", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.primary.name")!;
        expect(provider.label).toBeTruthy();
        expect(provider.refKey).toBe("person.contact_role.primary.name");
        expect(provider.refKey).not.toContain(provider.label);
        const source = relationshipProviderToFormFieldSource(provider);
        expect(source.relationship?.provider_ref_key).toBe(provider.refKey);
        expect(source.relationship?.relationship_id).toBe("person.contact_role.primary");
    });

    it("entity_type and field_key are transport-only — manifest catalog grain, not invented role×leaf keys", () => {
        const expectedTransport: Record<string, { entity_type: string; field_key: string }> = {
            "person.contact_role.primary.name": { entity_type: "guardian", field_key: "primary_contact_name" },
            "person.contact_role.primary.email": { entity_type: "guardian", field_key: "primary_email" },
            "person.contact_role.primary.phone": { entity_type: "guardian", field_key: "primary_phone" },
        };
        for (const [ref, expected] of Object.entries(expectedTransport)) {
            const source = relationshipProviderToFormFieldSource(findFormsRelationshipProvider(ref)!);
            expect(source.entity_type).toBe(expected.entity_type);
            expect(source.field_key).toBe(expected.field_key);
            expect(source.field_key).not.toBe("guardian_email");
            expect(source.relationship?.leaf_provider_ref_key).toMatch(/^person\./);
        }
    });

    it("legacy no-op hydration does not rewrite guardian_phone bindings", () => {
        const legacy = { entity_type: "guardian", field_key: "guardian_phone" } as const;
        expect(preserveLegacyFieldSourceOnHydration(legacy)).toEqual(legacy);
        expect(preserveLegacyFieldSourceOnHydration(legacy).relationship).toBeUndefined();
    });
});

describe("Forms P2 operational role scope", () => {
    it("only Primary Contact roles are authorable in P2", () => {
        resetCanonicalDataProviderCacheForTests();
        const seeds = buildFormsRelationshipProviderSeeds();
        const primary = seeds.find((p) => p.refKey === "person.contact_role.primary.email")!;
        const billing = seeds.find((p) => p.refKey === "person.contact_role.billing.email")!;
        expect(isFormsRelationshipAuthorableInP2(primary)).toBe(true);
        expect(isFormsRelationshipPublishableInP2(primary)).toBe(true);
        expect(isFormsRelationshipAuthorableInP2(billing)).toBe(false);
        expect(isFormsRelationshipPublishableInP2(billing)).toBe(false);
    });

    it("relationship picker exposes Primary Contact only", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = buildFormRelationshipFieldPickerPlatformBaseline();
        expect(picker.every((e) => e.id.includes(".primary."))).toBe(true);
        expect(picker.some((e) => e.id.includes(".billing."))).toBe(false);
        expect(picker.some((e) => e.id.includes(".secondary."))).toBe(false);
    });

    it("scalar picker excludes ambiguous guardian_email in favor of relationship leaves", () => {
        resetCanonicalDataProviderCacheForTests();
        const scalar = buildFormSystemFieldPickerPlatformBaseline();
        expect(scalar.some((e) => e.id === "guardian_email")).toBe(false);
    });

    it("relationship leaves are read-only prefill in P2 — not writable", () => {
        const primary = findFormsRelationshipProvider("person.contact_role.primary.email")!;
        expect(formsRelationshipWriteModeForProvider(primary)).toBe("read_only_prefill");
        expect(
            relationshipBindingMustBeReadOnlyAtPublish(primary.relationship ? relationshipProviderToFormFieldSource(primary).relationship : undefined, true),
        ).toBe(true);
        expect(
            relationshipBindingMustBeReadOnlyAtPublish(primary.relationship ? relationshipProviderToFormFieldSource(primary).relationship : undefined, false),
        ).toBe(false);
    });

    it("Primary Contact Name, Email, and Phone are all in the relationship picker", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = buildFormRelationshipFieldPickerPlatformBaseline();
        const ids = picker.map((e) => e.id);
        expect(ids).toContain("rel:person.contact_role.primary.name");
        expect(ids).toContain("rel:person.contact_role.primary.email");
        expect(ids).toContain("rel:person.contact_role.primary.phone");
    });

    it("deferred Secondary, Parents, Emergency, and Billing roles are excluded from picker", () => {
        resetCanonicalDataProviderCacheForTests();
        const seeds = buildFormsRelationshipProviderSeeds();
        const deferredRoles = ["secondary", "parents", "emergency", "billing"] as const;
        for (const role of deferredRoles) {
            const sample = seeds.find((p) => p.refKey === `person.contact_role.${role}.email`)!;
            expect(isFormsRelationshipAuthorableInP2(sample)).toBe(false);
            expect(isFormsRelationshipPublishableInP2(sample)).toBe(false);
        }
        const picker = buildFormRelationshipFieldPickerPlatformBaseline();
        expect(picker.some((e) => e.id.includes(".secondary."))).toBe(false);
        expect(picker.some((e) => e.id.includes(".parents."))).toBe(false);
        expect(picker.some((e) => e.id.includes(".emergency."))).toBe(false);
        expect(picker.some((e) => e.id.includes(".billing."))).toBe(false);
    });

    it("rejects deferred Emergency Contact at publish", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.emergency.phone")!;
        const source = relationshipProviderToFormFieldSource(provider);
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["x"] }],
            fields: [
                {
                    id: "x",
                    type: "text",
                    label: "Emergency",
                    required: false,
                    read_only: true,
                    field_source: source,
                },
            ],
        });
        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.message.includes("collection-shaped") || v.message.includes("not operational"))).toBe(true);
    });
});

describe("Forms P4 collection authoring", () => {
    it("enables collection authoring per supported provider ref", () => {
        expect(collectionBindingAuthoringEnabled()).toBe(true);
        expect(collectionBindingAuthoringEnabledForRef("children")).toBe(true);
        expect(collectionBindingAuthoringEnabledForRef("person.contact_role.parents")).toBe(true);
        expect(collectionBindingAuthoringEnabledForRef("household.members")).toBe(false);
    });

    it("collection binding uses single canonical provider ref", () => {
        const children = buildFormsCollectionBindingSeeds().find((p) => p.refKey === "children")!;
        const binding = collectionBindingFromProvider(children);
        expect(binding.collection_provider_ref).toBe("children");
        expect("collection_ref" in binding).toBe(false);
        expect(binding.iteration_entity_type).toBe("customer_member");
    });

    it("accepts valid children collection-bound group at publish when enabled", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["kids"] }],
            fields: [
                {
                    id: "kids",
                    type: "group",
                    label: "Children",
                    required: true,
                    repeat: { min: 1, max: 5 },
                    collection_binding: {
                        collection_provider_ref: "children",
                        iteration_entity_type: "customer_member",
                        iteration_alias: "child",
                    },
                    fields: [
                        {
                            id: "child_first_name",
                            type: "text",
                            label: "First name",
                            required: true,
                            field_source: { entity_type: "child", field_key: "child_first_name" },
                        },
                    ],
                },
            ],
        });
        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.message.includes("foundation-only"))).toBe(false);
        expect(violations.some((v) => v.message.includes("not enabled"))).toBe(false);
    });

    it("rejects disabled household.members collection at publish", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["members"] }],
            fields: [
                {
                    id: "members",
                    type: "group",
                    label: "Members",
                    required: false,
                    repeat: { min: 0, max: 5 },
                    collection_binding: {
                        collection_provider_ref: "household.members",
                        iteration_entity_type: "customer_member",
                    },
                    fields: [
                        {
                            id: "member_label",
                            type: "text",
                            label: "Label",
                            required: false,
                            field_source: { entity_type: "child", field_key: "child_first_name" },
                        },
                    ],
                },
            ],
        });
        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.message.includes("not enabled"))).toBe(true);
    });

    it("accepts customer_member identity fields for iteration entity", () => {
        expect(
            validateNestedFieldForIterationEntity(
                {
                    id: "n",
                    type: "text",
                    label: "Name",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_first_name" },
                },
                "customer_member",
            ),
        ).toBe(true);
    });

    it("rejects enrollment-specific fields without enrollment context", () => {
        expect(
            validateNestedFieldForIterationEntity(
                {
                    id: "prog",
                    type: "select",
                    label: "Program",
                    required: false,
                    field_source: { entity_type: "enrollment", field_key: "program_category_id" },
                },
                "customer_member",
            ),
        ).toBe(false);
    });

    it("allows Child First Name and Date of Birth for customer_member iteration", () => {
        expect(
            validateNestedFieldForIterationEntity(
                {
                    id: "fn",
                    type: "text",
                    label: "First name",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_first_name" },
                },
                "customer_member",
            ),
        ).toBe(true);
        expect(
            validateNestedFieldForIterationEntity(
                {
                    id: "dob",
                    type: "date",
                    label: "Date of birth",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_date_of_birth" },
                },
                "customer_member",
            ),
        ).toBe(true);
    });

    it("rejects Program, Desired Start Date, Current Classroom, and Enrollment Status in child iteration", () => {
        const rejected = [
            {
                id: "prog",
                type: "select" as const,
                label: "Program",
                field_source: { entity_type: "enrollment", field_key: "program_category_id" },
            },
            {
                id: "start",
                type: "date" as const,
                label: "Desired start date",
                field_source: { entity_type: "enrollment", field_key: "start_date" },
            },
            {
                id: "room",
                type: "select" as const,
                label: "Current classroom",
                field_source: { entity_type: "enrollment", field_key: "program_room_cohort_key" },
            },
            {
                id: "status",
                type: "select" as const,
                label: "Enrollment status",
                field_source: { entity_type: "enrollment", field_key: "status_key" },
            },
        ];
        for (const field of rejected) {
            expect(
                validateNestedFieldForIterationEntity(
                    { ...field, required: false },
                    "customer_member",
                ),
            ).toBe(false);
        }
    });

    it("rejects scalar use of collection provider children", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["x"] }],
            fields: [
                {
                    id: "x",
                    type: "text",
                    label: "Bad",
                    required: false,
                    field_source: {
                        entity_type: "custom",
                        field_key: "children",
                        relationship: {
                            provider_ref_key: "children",
                            relationship_id: "children",
                            role: "primary",
                            leaf_provider_ref_key: "children",
                            leaf_key: "value",
                            target_entity_type: "customer_member",
                        },
                    },
                },
            ],
        });
        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.message.includes("collection provider"))).toBe(true);
    });

    it("old repeating groups without collection_binding still parse", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["kids"] }],
            fields: [
                {
                    id: "kids",
                    type: "group",
                    label: "Children",
                    required: true,
                    repeat: { min: 1, max: 5 },
                    fields: [
                        {
                            id: "child_first_name",
                            type: "text",
                            label: "First name",
                            required: true,
                            field_source: { entity_type: "child", field_key: "child_first_name" },
                        },
                    ],
                },
            ],
        });
        expect(schema.fields[0].type).toBe("group");
        expect(validateFormsDocumentsP2Bindings(schema)).toEqual([]);
    });
});

describe("Forms P2 publish validation and packets", () => {
    const registry = new Set(["person::primary_email", "child::child_first_name"]);

    it("publishes valid Primary Contact Email when read-only", () => {
        resetCanonicalDataProviderCacheForTests();
        const entry = buildFormRelationshipFieldPickerPlatformBaseline().find(
            (e) => e.id === "rel:person.contact_role.primary.email",
        )!;
        const field = formFieldFromRegistryEntry(entry, {});
        expect(field.read_only).toBe(true);
        const schema: FormSchemaV1 = {
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: [field.id] }],
            fields: [field],
        };
        const result = validatePosConnectedFieldBinding(schema, registry);
        expect(result.ok).toBe(true);
    });

    it("rejects editable Primary Contact relationship leaf at publish", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.primary.email")!;
        const source = relationshipProviderToFormFieldSource(provider);
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["x"] }],
            fields: [
                {
                    id: "x",
                    type: "text",
                    label: "Email",
                    required: false,
                    read_only: false,
                    field_source: source,
                },
            ],
        });
        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.message.includes("read-only"))).toBe(true);
    });

    it("rejects deferred Billing Contact authoring", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.billing.email")!;
        const source = relationshipProviderToFormFieldSource(provider);
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["x"] }],
            fields: [
                {
                    id: "x",
                    type: "text",
                    label: "Billing",
                    required: false,
                    read_only: true,
                    field_source: source,
                },
            ],
        });
        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.some((v) => v.message.includes("collection-shaped") || v.message.includes("not operational"))).toBe(true);
    });

    it("primary relationship prefill maps to contact root only", () => {
        resetCanonicalDataProviderCacheForTests();
        const entry = buildFormRelationshipFieldPickerPlatformBaseline().find(
            (e) => e.id === "rel:person.contact_role.primary.email",
        )!;
        const field = formFieldFromRegistryEntry(entry, {});
        const map = buildRelationshipPrefillFieldMap({
            fields: [field],
        });
        expect(map[field.id]).toBe("contact.email");
    });

    it("Primary Contact Name and Phone prefill map to contact columns", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = buildFormRelationshipFieldPickerPlatformBaseline();
        const nameField = formFieldFromRegistryEntry(
            picker.find((e) => e.id === "rel:person.contact_role.primary.name")!,
            {},
        );
        const phoneField = formFieldFromRegistryEntry(
            picker.find((e) => e.id === "rel:person.contact_role.primary.phone")!,
            {},
        );
        const map = buildRelationshipPrefillFieldMap({ fields: [nameField, phoneField] });
        expect(map[nameField.id]).toBe("contact.full_name");
        expect(map[phoneField.id]).toBe("contact.phone");
    });

    it("non-primary relationship leaves do not map to contact prefill in P2", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.billing.email")!;
        const source = relationshipProviderToFormFieldSource(provider);
        const map = buildRelationshipPrefillFieldMap({
            fields: [
                {
                    id: "b",
                    type: "text",
                    label: "Billing",
                    required: false,
                    read_only: true,
                    field_source: source,
                },
            ],
        });
        expect(map.b).toBeUndefined();
    });

    it("publishes valid Primary Contact Name and Phone when read-only", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = buildFormRelationshipFieldPickerPlatformBaseline();
        for (const ref of ["rel:person.contact_role.primary.name", "rel:person.contact_role.primary.phone"] as const) {
            const field = formFieldFromRegistryEntry(picker.find((e) => e.id === ref)!, {});
            expect(field.read_only).toBe(true);
            const schema: FormSchemaV1 = {
                schema_version: 1,
                title: "T",
                sections: [{ id: "s", field_ids: [field.id] }],
                fields: [field],
            };
            expect(validatePosConnectedFieldBinding(schema, registry).ok).toBe(true);
        }
    });

    it("packet scalar dedupe unchanged for legacy child fields", () => {
        const plan = buildPacketFieldPlan([
            {
                form_id: "f1",
                schema: {
                    fields: [
                        {
                            id: "a",
                            type: "text",
                            label: "A",
                            required: false,
                            field_source: { entity_type: "child", field_key: "child_first_name" },
                        },
                    ],
                },
            },
        ]);
        expect(plan.distinct_field_count).toBe(1);
    });

    it("relationship primary email dedupes distinctly from legacy guardian_email transport", () => {
        const primary = relationshipProviderToFormFieldSource(
            findFormsRelationshipProvider("person.contact_role.primary.email")!,
        );
        const plan = buildPacketFieldPlan([
            {
                form_id: "f1",
                schema: {
                    fields: [
                        { id: "p", type: "text", label: "P", required: false, field_source: primary, read_only: true },
                        {
                            id: "g",
                            type: "text",
                            label: "G",
                            required: false,
                            field_source: { entity_type: "guardian", field_key: "guardian_email" },
                        },
                    ],
                },
            },
        ]);
        expect(plan.distinct_field_count).toBe(2);
    });
});

describe("Forms P2 legacy operational registry unchanged", () => {
    it("guardian operational entries still exist for hydration", () => {
        expect(OPERATIONAL_FORM_SYSTEM_FIELDS.some((e) => e.id === "guardian_email")).toBe(true);
    });

    it("transport for primary uses manifest ref not guardian_email alias", () => {
        const provider = findFormsRelationshipProvider("person.contact_role.primary.email")!;
        const transport = transportFieldSourceForRelationshipProvider(provider, "primary");
        expect(transport.field_key).toBe("primary_email");
        expect(transport.field_key).not.toBe("guardian_email");
    });
});
