import { describe, expect, it } from "vitest";

import { adaptTopLevelFieldsToRelatedRecordProposals } from "@/lib/forms/processing/adaptTopLevelFieldsToRelatedRecordProposals";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * TOP-LEVEL CANONICAL ANSWERS HAD NOWHERE TO GO.
 *
 * Proposal generation was collection-group-only, but the real enrolment Forms ask "Child First
 * Name" as a top-level question with a canonical binding. Those answers reached evidence and
 * classification and then stopped: no proposal, so no operator decision, so no canonical write.
 * A single Form authored that way behaved identically — this was never packet-specific.
 *
 * These pin the two halves that keep it safe: an authoritative subject is required before anything
 * is proposed, and the subject never decides who OWNS a fact.
 */

const field = (id: string, label: string, entity: string | null, key: string | null) => ({
    id,
    label,
    type: "short_text",
    ...(entity && key ? { field_source: { entity_type: entity, field_key: key } } : {}),
});

const schema = {
    title: "Northwind Enrollment Application v4",
    schema_version: 1,
    sections: [],
    fields: [
        field("field_1", "Child First Name", "child", "child_first_name"),
        field("field_2", "Child Last Name", "child", "child_last_name"),
        field("field_3", "Child Date Of Birth", "customer_member", "dob"),
        field("field_13", "Emergency contact first name", null, null),
    ],
} as unknown as FormSchemaV1;

const values = {
    field_1: "Pathb",
    field_2: "Certopp",
    field_3: "2021-11-02",
    field_13: "Dana",
};

const subject = { customerMemberId: "cm-1", customerId: "cust-1" };

describe("an authoritative subject is required", () => {
    it("proposes an existing-record change-set for the child the session named", () => {
        const { collection } = adaptTopLevelFieldsToRelatedRecordProposals(schema, values, {
            formSubmissionId: "sub-1",
            subject,
        });
        expect(collection).not.toBeNull();
        const instance = collection!.instances[0]!;
        // The shape the EXISTING child executor already accepts — no packet executor was created.
        expect(instance.origin).toBe("existing_record");
        expect(instance.collection_provider_ref).toBe("children");
        expect(instance.item_entity_type).toBe("customer_member");
        expect(instance.execution_kind).toBe("native_structural");
        expect(instance.existing_record_id).toBe("cm-1");
        expect(instance.status).toBe("valid");
    });

    it("PROPOSES NOTHING for untargeted public intake", () => {
        /*
         * The whole safety of this path is that it only ever proposes against a record someone
         * deliberately named. With no subject there is no existing record to update, and the
         * existing identity-resolution and creation flow stays in charge — untouched.
         */
        const { collection } = adaptTopLevelFieldsToRelatedRecordProposals(schema, values, {
            formSubmissionId: "sub-1",
            subject: null,
        });
        expect(collection).toBeNull();
    });

    it("keys the proposal on the subject, so the id is stable across re-reads", () => {
        const once = adaptTopLevelFieldsToRelatedRecordProposals(schema, values, { formSubmissionId: "sub-1", subject });
        const twice = adaptTopLevelFieldsToRelatedRecordProposals(schema, values, { formSubmissionId: "sub-1", subject });
        // The operator's decision must still name the same proposal when commit re-reads it.
        expect(once.collection!.instances[0]!.proposal_id).toBe(twice.collection!.instances[0]!.proposal_id);
    });
});

describe("the subject says who this is about, never who owns a fact", () => {
    it("carries only the child-owned bindings", () => {
        const { collection } = adaptTopLevelFieldsToRelatedRecordProposals(schema, values, {
            formSubmissionId: "sub-1",
            subject,
        });
        const refs = collection!.instances[0]!.field_proposals.map((f) => f.provider_ref);
        expect(refs).toContain("child.child_first_name");
        expect(refs).toContain("child.child_last_name");
        expect(refs).toContain("customer_member.dob");
        expect(refs).toHaveLength(3);
    });

    it("an unmapped question is Form truth — not a proposal and not a complaint", () => {
        const { collection, diagnostics } = adaptTopLevelFieldsToRelatedRecordProposals(schema, values, {
            formSubmissionId: "sub-1",
            subject,
        });
        const refs = collection!.instances[0]!.field_proposals.map((f) => f.source_fact_ref);
        expect(refs).not.toContain("field_13");
        // It is simply absent. Nothing to place is not the same as failing to place something.
        expect(diagnostics.map((d) => d.path)).not.toContain("values.field_13");
    });

    it("REFUSES a relationship-owned binding instead of flattening it onto the child", () => {
        /*
         * The dangerous case. The session knows the child, so it would be easy to write every
         * returned fact onto that child's row — which would turn a relationship into a scalar and
         * lose its owner. Ownership comes from the canonical binding, never from the subject.
         */
        const relSchema = {
            ...schema,
            fields: [field("field_20", "Emergency contact relationship", "person_child_relationship", "relationship_type")],
        } as unknown as FormSchemaV1;
        const { collection, diagnostics } = adaptTopLevelFieldsToRelatedRecordProposals(
            relSchema,
            { field_20: "Aunt" },
            { formSubmissionId: "sub-1", subject },
        );
        expect(collection).toBeNull();
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]!.code).toBe("unsupported_item_entity");
        // The refusal is visible, because "we could not place this" is an operator's business.
        expect(diagnostics[0]!.message).toMatch(/not by the child record/i);
    });

    it("refuses a binding with no writable canonical capability", () => {
        const oddSchema = {
            ...schema,
            fields: [field("field_30", "Something", "not_a_real_entity", "nope")],
        } as unknown as FormSchemaV1;
        const { collection, diagnostics } = adaptTopLevelFieldsToRelatedRecordProposals(
            oddSchema,
            { field_30: "x" },
            { formSubmissionId: "sub-1", subject },
        );
        expect(collection).toBeNull();
        expect(diagnostics[0]!.code).toBe("unsupported_item_entity");
    });
});
