/**
 * A collection minimum is a number of COMPLETE MEMBERS, not of allocated rows.
 *
 * Measured on staging 5ead6396f: an "Emergency contacts — at least 2" group passed submit with the
 * two blank rows the form seeds so there is somewhere to type, because the validator counted rows.
 * The group is built by the same Studio builder an imported or a hand-built form uses.
 */
import { describe, expect, it } from "vitest";

import { relationshipCollectionGroupField } from "@/lib/forms/relationshipCollectionGroup";
import {
    completeGroupMemberCount,
    groupMemberState,
    outstandingRequiredCollections,
    validateFormPayload,
    type FormPayload,
    type FormPayloadGroupRow,
} from "@/lib/forms/validateSubmission";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

type Group = FormField & { type: "group"; fields: FormField[] };

function emergencyGroup(over: { min?: number; max?: number; requirePhone?: boolean } = {}): Group {
    const g = relationshipCollectionGroupField("emergency_contacts", "ec") as Group;
    return {
        ...g,
        repeat: { min: over.min ?? 2, ...(over.max !== undefined ? { max: over.max } : {}) },
        fields: g.fields.map((f) => (over.requirePhone && f.id === "ec__phone" ? { ...f, required: true } : f)),
    } as Group;
}

const schemaWith = (group: FormField, extra: FormField[] = []): FormSchemaV1 =>
    ({ schema_version: 1, title: "QA", sections: [], fields: [...extra, group] }) as unknown as FormSchemaV1;

const row = (i: number, values: Record<string, unknown>): FormPayloadGroupRow => ({ instance_key: `r${i}`, values });
const contact = (i: number, name = `Contact ${i}`) => row(i, { ec__full_name: name, ec__phone: "5415550100", ec__relationship_type: "Aunt" });
const blank = (i: number) => row(i, {});

const submit = (schema: FormSchemaV1, rows: FormPayloadGroupRow[], values: Record<string, unknown> = {}) =>
    validateFormPayload({ schemaJson: schema, payload: { values, groups: { ec: rows }, meta: {} } satisfies FormPayload, mode: "submit" });

const messages = (r: ReturnType<typeof submit>) => (r.ok ? [] : r.errors.map((e) => `${e.path.join(".")}: ${e.message}`));

describe("minimum 2 emergency contacts", () => {
    const schema = schemaWith(emergencyGroup());

    it("refuses zero members", () => {
        expect(submit(schema, []).ok).toBe(false);
    });
    it("refuses one complete member", () => {
        expect(messages(submit(schema, [contact(1)]))).toContain("ec: Expected at least 2 group instance(s)");
    });
    it("accepts two complete members", () => {
        expect(submit(schema, [contact(1), contact(2)]).ok).toBe(true);
    });
    it("refuses the two blank rows the form seeds", () => {
        const seeded = payloadWithMinimumRepeatingGroups(schema).groups?.ec ?? [];
        expect(seeded).toHaveLength(2);
        expect(messages(submit(schema, seeded))).toContain("ec: Expected at least 2 group instance(s)");
    });
    it("refuses one complete member and one blank row", () => {
        expect(submit(schema, [contact(1), blank(2)]).ok).toBe(false);
    });
    it("keeps a half-entered member and says what it is missing — on that member", () => {
        const r = messages(submit(schema, [contact(1), row(2, { ec__phone: "5415550101" })]));
        expect(r).toContain("ec: Expected at least 2 group instance(s)");
        expect(r).toContain("ec.1.values.ec__full_name: Required field missing");
    });
    it("refuses a member missing a line the form requires, at that line", () => {
        const required = schemaWith(emergencyGroup({ requirePhone: true }));
        const r = messages(submit(required, [contact(1), row(2, { ec__full_name: "No Phone" })]));
        expect(r).toContain("ec.1.values.ec__phone: Required field missing");
    });
    it("accepts more members up to the maximum, and refuses past it", () => {
        const capped = schemaWith(emergencyGroup({ max: 3 }));
        expect(submit(capped, [contact(1), contact(2), contact(3)]).ok).toBe(true);
        expect(submit(capped, [contact(1), contact(2), contact(3), contact(4)]).ok).toBe(false);
    });
    it("does not count an extra blank row against the maximum or against the members", () => {
        const capped = schemaWith(emergencyGroup({ max: 2 }));
        expect(submit(capped, [contact(1), contact(2), blank(3)]).ok).toBe(true);
    });
});

describe("the member definition every surface shares", () => {
    const g = emergencyGroup();
    const schema = schemaWith(g);
    it("classifies blank, incomplete and complete", () => {
        expect(groupMemberState(g, blank(1), schema).state).toBe("blank");
        expect(groupMemberState(g, row(1, { ec__relationship_type: "Aunt" }), schema).state).toBe("incomplete");
        expect(groupMemberState(g, contact(1), schema).state).toBe("complete");
        expect(completeGroupMemberCount(g, [contact(1), blank(2), contact(3)], schema)).toBe(2);
    });
    it("tells a participant surface the group is short before submit does", () => {
        expect(outstandingRequiredCollections(schema, { values: {}, groups: { ec: [contact(1), blank(2)] } })).toEqual([
            { field_id: "ec", label: g.label, needed: 2, complete: 1 },
        ]);
        expect(outstandingRequiredCollections(schema, { values: {}, groups: { ec: [contact(1), contact(2)] } })).toEqual([]);
    });
});

describe("a hidden collection is not owed", () => {
    it("neither blocks submit nor reports outstanding when its condition hides it", () => {
        const gate = { id: "has_contacts", type: "boolean", label: "Any contacts?", required: false } as FormField;
        const g = { ...emergencyGroup(), visibility: { all: [{ field_id: "has_contacts", op: "eq", value: true }] } } as FormField;
        const schema = schemaWith(g, [gate]);
        expect(submit(schema, [], { has_contacts: false }).ok).toBe(true);
        expect(outstandingRequiredCollections(schema, { values: { has_contacts: false }, groups: {} })).toEqual([]);
        expect(submit(schema, [], { has_contacts: true }).ok).toBe(false);
    });
});

describe("Processing receives people, not blank rows", () => {
    it("proposes the members and drops the seeded blank row", () => {
        const schema = schemaWith(emergencyGroup());
        // Rows as a real submission carries them: each with its collection identity.
        const meta = { provider_ref: "person.contact_role.emergency_contacts", origin: "respondent_added" as const, iteration_entity_type: "person" };
        const rows = [contact(1), contact(2), blank(3)].map((r) => ({ ...r, collection: meta }));
        const payload: FormPayload = { values: {}, groups: { ec: rows }, meta: {} };
        const bundle = adaptFormSubmissionToRelatedRecordProposals(schema, payload, {
            orgId: "org",
            submissionId: "sub",
            formDefinitionId: "form",
            formVersionId: "v1",
        } as never);
        const ec = bundle.collections.find((c) => c.collection_key === "ec");
        expect(ec?.instances).toHaveLength(2);
    });
});
