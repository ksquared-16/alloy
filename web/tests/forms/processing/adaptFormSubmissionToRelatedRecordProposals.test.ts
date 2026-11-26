import { describe, expect, it } from "vitest";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { projectRelatedRecordProposalsToEvidence } from "@/lib/pos/processingCase/collection/projectRelatedRecordProposalsToEvidence";
import { validateFormSchema } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

const childrenSchema = validateFormSchema({
    schema_version: 1,
    title: "Enrollment",
    sections: [{ id: "s", field_ids: ["kids"] }],
    fields: [
        {
            id: "kids",
            type: "group",
            label: "Children",
            required: false,
            repeat: { min: 0, max: 5 },
            collection_binding: {
                collection_provider_ref: "children",
                iteration_entity_type: "customer_member",
            },
            fields: [
                {
                    id: "child_first_name",
                    type: "text",
                    label: "First Name",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_first_name" },
                },
                {
                    id: "child_dob",
                    type: "text",
                    label: "Date of Birth",
                    required: false,
                    field_source: { entity_type: "child", field_key: "child_dob" },
                },
            ],
        },
    ],
});

const parentsSchema = validateFormSchema({
    schema_version: 1,
    title: "Parents",
    sections: [{ id: "s", field_ids: ["parents"] }],
    fields: [
        {
            id: "parents",
            type: "group",
            label: "Parents / Guardians",
            required: false,
            repeat: { min: 0, max: 5 },
            collection_binding: {
                collection_provider_ref: "person.contact_role.parents",
                iteration_entity_type: "person",
            },
            fields: [
                {
                    id: "parent_email",
                    type: "text",
                    label: "Email",
                    required: false,
                    field_source: { entity_type: "person", field_key: "email" },
                },
            ],
        },
    ],
});

const ctx = {
    formSubmissionId: "sub-1",
    formDefinitionVersionId: "ver-1",
};

function project(bundle: ReturnType<typeof adaptFormSubmissionToRelatedRecordProposals>) {
    return projectRelatedRecordProposalsToEvidence(bundle, { processingCaseId: "case-1" });
}

describe("adaptFormSubmissionToRelatedRecordProposals", () => {
    it("adapts valid Children existing instance from meta envelope", () => {
        const payload: FormPayload = {
            values: {},
            meta: {
                collection_submission_envelope: {
                    kids: [
                        {
                            instance_key: "col:children:cm-1",
                            origin: "existing",
                            provider_ref: "children",
                            item_id: "cm-1",
                            iteration_entity_type: "customer_member",
                            values: { child_first_name: "Jeff", child_dob: "2022-06-04" },
                        },
                    ],
                },
            },
        };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(childrenSchema, payload, {
            ...ctx,
            accessibleExistingItemIds: new Set(["cm-1"]),
        });
        expect(bundle.collections).toHaveLength(1);
        expect(bundle.collections[0]?.instances).toHaveLength(1);
        const inst = bundle.collections[0]!.instances[0]!;
        expect(inst.origin).toBe("existing_record");
        expect(inst.existing_record_id).toBe("cm-1");
        expect(project(bundle).groups[0]?.instances[0]?.identity_label).toBe("Jeff");
        expect(inst.field_proposals).toHaveLength(2);
        expect(inst.status).toBe("valid");
        expect(inst.source_lineage.source_record_id).toBe("sub-1");
    });

    it("adapts Children respondent-added instance", () => {
        const payload: FormPayload = {
            values: {},
            groups: {
                kids: [
                    {
                        instance_key: "client-new",
                        values: { child_first_name: "Jane" },
                        collection: {
                            provider_ref: "children",
                            origin: "respondent_added",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(childrenSchema, payload, ctx);
        const inst = bundle.collections[0]?.instances[0];
        expect(inst?.origin).toBe("proposed_new_record");
        expect(inst?.existing_record_id).toBeUndefined();
        expect(project(bundle).groups[0]?.instances[0]?.identity_label).toBe("Jane");
    });

    it("adapts Parents existing Person instance", () => {
        const payload: FormPayload = {
            values: {},
            meta: {
                collection_submission_envelope: {
                    parents: [
                        {
                            instance_key: "col:parents:p-1",
                            origin: "existing",
                            provider_ref: "person.contact_role.parents",
                            item_id: "p-1",
                            iteration_entity_type: "person",
                            values: { parent_email: "kelly@example.com" },
                        },
                    ],
                },
            },
        };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(parentsSchema, payload, {
            ...ctx,
            accessibleExistingItemIds: new Set(["p-1"]),
        });
        expect(project(bundle).groups[0]?.collection_label).toContain("Parents");
        expect(project(bundle).groups[0]?.instances[0]?.field_bindings[0]?.entity_type).toBe("person");
    });

    it("flags unknown provider without throwing", () => {
        const payload: FormPayload = {
            values: {},
            meta: {
                collection_submission_envelope: {
                    kids: [
                        {
                            instance_key: "x",
                            origin: "respondent_added",
                            provider_ref: "emergency_contacts",
                            item_id: null,
                            iteration_entity_type: "person",
                            values: {},
                        },
                    ],
                },
            },
        };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(childrenSchema, payload, ctx);
        expect(bundle.collections.some((g) => g.status === "invalid" || g.instances.some((i) => i.status === "unsupported"))).toBe(true);
    });

    it("flags org boundary for inaccessible existing item", () => {
        const payload: FormPayload = {
            values: {},
            meta: {
                collection_submission_envelope: {
                    kids: [
                        {
                            instance_key: "col:children:cm-x",
                            origin: "existing",
                            provider_ref: "children",
                            item_id: "cm-x",
                            iteration_entity_type: "customer_member",
                            values: { child_first_name: "Sam" },
                        },
                    ],
                },
            },
        };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(childrenSchema, payload, {
            ...ctx,
            accessibleExistingItemIds: new Set(),
        });
        expect(bundle.collections[0]?.instances[0]?.status).toBe("invalid");
        expect(bundle.collections[0]?.instances[0]?.diagnostics.some((d) => d.code === "org_boundary")).toBe(true);
    });

    it("returns empty for old submission without envelope", () => {
        const payload: FormPayload = { values: { email: "a@b.com" } };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(childrenSchema, payload, ctx);
        expect(bundle.collections).toHaveLength(0);
    });

    it("detects duplicate instance keys", () => {
        const payload: FormPayload = {
            values: {},
            meta: {
                collection_submission_envelope: {
                    kids: [
                        {
                            instance_key: "dup",
                            origin: "respondent_added",
                            provider_ref: "children",
                            item_id: null,
                            iteration_entity_type: "customer_member",
                            values: {},
                        },
                        {
                            instance_key: "dup",
                            origin: "respondent_added",
                            provider_ref: "children",
                            item_id: null,
                            iteration_entity_type: "customer_member",
                            values: {},
                        },
                    ],
                },
            },
        };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(childrenSchema, payload, ctx);
        expect(bundle.collections[0]?.diagnostics.some((d) => d.code === "duplicate_instance_key")).toBe(true);
    });
});
