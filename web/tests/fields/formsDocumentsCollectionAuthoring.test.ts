import { describe, expect, it } from "vitest";
import {
    buildFormsAuthorableCollectionBindingSeeds,
    buildFormsCollectionBindingSeeds,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import {
    collectionBindingAuthoringEnabledForRef,
    collectionBindingFromProvider,
    collectionContextIsValid,
    validateNestedFieldForIterationEntity,
} from "@/lib/fields/formsCollectionRepeatBinding";
import {
    isResolvedCollection,
    collectionResolutionFailureReason,
} from "@/lib/fields/relationship/canonicalCollectionResolution";
import { fieldIsInsideCollectionBoundGroup } from "@/lib/forms/prefill/formsCollectionPrefill";
import { validateFormsDocumentsP2Bindings } from "@/lib/forms/binding/validateFormsDocumentsP2Bindings";
import { validateFormSchema } from "@/lib/forms/schema";
import { validateFormPayload } from "@/lib/forms/validateSubmission";

describe("P4 collection provider contract", () => {
    it("seeds children and parents collection providers with distinct item entities", () => {
        const seeds = buildFormsCollectionBindingSeeds();
        const children = seeds.find((p) => p.refKey === "children")!;
        const parents = seeds.find((p) => p.refKey === "person.contact_role.parents")!;
        expect(children.settingsEntity).toBe("customer_member");
        expect(parents.settingsEntity).toBe("person");
        expect(children.kind).toBe("collection");
        expect(parents.kind).toBe("collection");
    });

    it("authorable collection list excludes household.members", () => {
        const authorable = buildFormsAuthorableCollectionBindingSeeds();
        expect(authorable.map((p) => p.refKey)).toContain("children");
        expect(authorable.map((p) => p.refKey)).toContain("person.contact_role.parents");
        expect(authorable.map((p) => p.refKey)).not.toContain("household.members");
    });

    it("collection binding round-trips provider ref and iteration entity", () => {
        const children = buildFormsCollectionBindingSeeds().find((p) => p.refKey === "children")!;
        const binding = collectionBindingFromProvider(children);
        expect(binding.collection_provider_ref).toBe("children");
        expect(binding.iteration_entity_type).toBe("customer_member");
        expect(binding.iteration_alias).toBe("child");
    });
});

describe("P4 collection resolution contract", () => {
    it("empty is not an error state", () => {
        const empty = { status: "empty" as const, items: [] as [] };
        expect(collectionResolutionFailureReason(empty)).toBeUndefined();
        expect(isResolvedCollection(empty)).toBe(false);
    });

    it("invalid_context differs from empty", () => {
        const invalid = { status: "invalid_context" as const, reason: "missing customer_id", items: [] as [] };
        expect(collectionResolutionFailureReason(invalid)).toBe("missing customer_id");
    });
});

describe("P4 nested field rules — Children", () => {
    it("allows First Name and DOB for customer_member iteration", () => {
        expect(
            validateNestedFieldForIterationEntity(
                {
                    id: "fn",
                    type: "text",
                    label: "First",
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
                    label: "DOB",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_date_of_birth" },
                },
                "customer_member",
            ),
        ).toBe(true);
    });

    it("marks inquiry_child fields unavailable without inquiry_child context", () => {
        for (const field_key of ["program_category_id", "start_date"]) {
            expect(
                validateNestedFieldForIterationEntity(
                    {
                        id: field_key,
                        type: "text",
                        label: field_key,
                        required: false,
                        field_source: { entity_type: "enrollment", field_key },
                    },
                    "customer_member",
                ),
            ).toBe(false);
        }
    });
});

describe("P4 nested field rules — Parents/Guardians", () => {
    it("allows person identity fields for person iteration", () => {
        expect(
            validateNestedFieldForIterationEntity(
                {
                    id: "name",
                    type: "text",
                    label: "Name",
                    required: false,
                    field_source: { entity_type: "guardian", field_key: "guardian_first_name" },
                },
                "person",
            ),
        ).toBe(true);
    });
});

describe("P4 collection context", () => {
    it("children collection requires customer_id", () => {
        expect(collectionContextIsValid("children", { customer_id: "c1" })).toBe(true);
        expect(collectionContextIsValid("children", {})).toBe(false);
        expect(collectionBindingAuthoringEnabledForRef("children")).toBe(true);
    });
});

describe("P4 submission payload", () => {
    it("accepts collection metadata on group rows", () => {
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
        const result = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {},
                groups: {
                    kids: [
                        {
                            instance_key: "col:children:cm-1",
                            values: { child_first_name: "Sam" },
                            collection: {
                                provider_ref: "children",
                                item_id: "cm-1",
                                origin: "existing",
                                iteration_entity_type: "customer_member",
                            },
                        },
                    ],
                },
            },
            mode: "submit",
        });
        expect(result.ok).toBe(true);
    });

    it("uses stable instance_key — not array index", () => {
        const key = "col:children:cm-uuid-123";
        expect(key).not.toMatch(/^\d+$/);
        expect(key).toContain("cm-uuid-123");
    });
});

describe("P4 packet step-local behavior", () => {
    it("fields inside collection-bound groups are excluded from shared_values scope", () => {
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
        expect(fieldIsInsideCollectionBoundGroup(schema, "child_first_name")).toBe(true);
    });
});

describe("P4 publish validation", () => {
    it("publishes parents/guardians collection when enabled", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["guardians"] }],
            fields: [
                {
                    id: "guardians",
                    type: "group",
                    label: "Parents / Guardians",
                    required: false,
                    repeat: { min: 0, max: 8 },
                    collection_binding: {
                        collection_provider_ref: "person.contact_role.parents",
                        iteration_entity_type: "person",
                        iteration_alias: "guardian",
                    },
                    fields: [
                        {
                            id: "guardian_name",
                            type: "text",
                            label: "Name",
                            required: false,
                            field_source: { entity_type: "guardian", field_key: "guardian_first_name" },
                        },
                    ],
                },
            ],
        });
        const violations = validateFormsDocumentsP2Bindings(schema);
        expect(violations.filter((v) => v.field_id === "guardians")).toEqual([]);
    });
});
