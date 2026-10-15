import { describe, expect, it } from "vitest";

import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { compileParticipantArtifact } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import { addRelationshipGroup, setFieldVisibility, setGroupRepeat, structureAddressAt } from "@/lib/forms/formBuilderSchema";
import { validateFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import { fieldShownForAnswers, normalizeSubmissionForSchema } from "@/lib/forms/submissionSemantics";
import { evaluateFieldVisibility, validateFormPayload } from "@/lib/forms/validateSubmission";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * ONE SET OF AUTHORED SEMANTICS, TWO PARTICIPANT RUNTIMES.
 *
 * Studio authors conditions, groups and minimums once. The generic form runtime and the Enrollment
 * participant runtime must decide the same things from them: what is asked, what blocks, and how a
 * group's answers are submitted. Each case runs on a hand-built form and on an imported one.
 */

const CHILD = "cccc0000-0000-4000-8000-00000000000a";
const P = { entity_type: "person" };

type Spec = { id: string; label: string; type: string; required: boolean; field_source?: Record<string, string> };
const SPECS: Spec[] = [
    { id: "siblings", label: "Does your child have siblings?", type: "boolean", required: true, field_source: { entity_type: "customer_member", field_key: "has_siblings" } },
    { id: "siblings_list", label: "Please list siblings", type: "text", required: true },
    { id: "l1", label: "Home address line 1", type: "text", required: true, field_source: { ...P, field_key: "address_line1" } },
    { id: "city", label: "City", type: "text", required: true, field_source: { ...P, field_key: "city" } },
    { id: "zip", label: "ZIP", type: "text", required: true, field_source: { ...P, field_key: "postal_code" } },
];

const manual = (): FormSchemaV1 =>
    ({
        schema_version: 1,
        title: "Admissions",
        sections: [{ id: "s1", title: "Family", field_ids: SPECS.map((s) => s.id) }],
        fields: SPECS.map(({ id, label, type, required, field_source }) => ({ id, label, type, required, ...(field_source ? { field_source } : {}) })),
    }) as unknown as FormSchemaV1;

const imported = (): FormSchemaV1 => {
    const fields = SPECS.map((s, i) => ({
        id: `field_${i + 1}`, label: s.label, type: s.type, required: s.required, confidence: "high", evidence: `hosted_form:${s.id}`,
        ...(s.field_source ? { field_source: s.field_source } : {}),
    }));
    let schema = draftFormToFormSchemaV1({
        title: "Admissions", generated_form_name: "Admissions", source_document_id: "doc-1",
        sections: [{ id: "section_1", title: "Family", field_ids: fields.map((f) => f.id), disposition: "fields" }],
        fields, warnings: [], generated_at: "2026-10-14T12:00:00.000Z", generator_version: "test",
    } as unknown as StoredFormDraftPreview);
    const auto = schema.fields.find((f) => (f as { address_binding?: unknown }).address_binding);
    if (auto) schema = { ...schema, ...JSON.parse(JSON.stringify(schema)) };
    return schema;
};

/** Author the same decisions on either origin: the condition, an address group, Emergency Contacts ≥ 2. */
function author(start: () => FormSchemaV1) {
    let s = start();
    const byLabel = (label: string) => {
        const walk = (fs: FormField[]): FormField | undefined => {
            for (const f of fs) {
                if (f.label === label) return f;
                if (f.type === "group") {
                    const hit = walk((f as { fields: FormField[] }).fields);
                    if (hit) return hit;
                }
            }
            return undefined;
        };
        return walk(s.fields)!;
    };
    const trigger = byLabel("Does your child have siblings?").id;
    const follow = byLabel("Please list siblings").id;
    s = setFieldVisibility(s, follow, { triggerFieldId: trigger, value: true });
    if (!s.fields.some((f) => (f as { address_binding?: unknown }).address_binding)) s = structureAddressAt(s, byLabel("City").id);
    const people = addRelationshipGroup(s, "emergency_contacts", s.sections[0]!.id)!;
    s = setGroupRepeat(people.schema, people.fieldId, { min: 2 });
    s = validateFormSchema(JSON.parse(JSON.stringify(s)));
    const address = s.fields.find((f) => (f as { address_binding?: unknown }).address_binding) as FormField & { fields: FormField[] };
    const contacts = s.fields.find((f) => (f as { collection_binding?: unknown }).collection_binding) as FormField & { fields: FormField[] };
    return { schema: s, trigger, follow, address, contacts };
}

const pinned = (schema: FormSchemaV1) => ({
    requirement_id: "req-1",
    form_definition_id: "form-1",
    form_definition_version_id: "ver-1",
    session_item_id: "item-1",
    schema,
});

const contactRow = (contacts: FormField & { fields: FormField[] }, i: number, filled = true) => ({
    instance_key: `c${i}`,
    values: Object.fromEntries(
        contacts.fields.map((f) => [f.id, filled ? (f.type === "text" ? `value ${i}` : f.type === "select" ? undefined : `x${i}`) : ""]),
    ),
    signatures: {},
    groups: {},
});

describe.each([
    ["hand-built form", manual],
    ["imported form", imported],
])("participant runtime parity — %s", (_name, start) => {
    describe("conditions", () => {
        it("generic and Enrollment agree: the follow-up is hidden until the trigger is Yes, and hidden does not block", () => {
            const { schema, trigger, follow } = author(start);
            // Generic runtime decision.
            expect(evaluateFieldVisibility(follow, schema, () => undefined)).toBe(false);
            expect(fieldShownForAnswers(schema, follow, (id) => (id === trigger ? true : undefined))).toBe(true);

            // Enrollment: the hidden follow-up is not asked …
            const needs = (shared: Record<string, unknown>) =>
                projectEnrollmentInformationNeeds({ forms: [pinned(schema)], subjectId: CHILD, sharedValues: shared, confirmations: {} });
            const asked = (shared: Record<string, unknown>) => needs(shared).flatMap((n) => n.occurrences.map((o) => o.form_field_id));
            // The trigger's own session key, as the projection derives it (no guessing).
            const triggerKey = needs({}).find((n) => n.occurrences.some((o) => o.form_field_id === trigger))!.identity.session_value_key!;
            expect(triggerKey).toBeTruthy();
            expect(asked({})).not.toContain(follow);
            // … and is asked once the dependency answer changes to Yes.
            expect(asked({ [triggerKey]: true })).toContain(follow);
            expect(asked({ [triggerKey]: false })).not.toContain(follow);
        });

        it("a value given before the trigger changed is cleared at submit instead of refusing the family", () => {
            const { schema, trigger, follow } = author(start);
            const payload = normalizeSubmissionForSchema(schema, { values: { [trigger]: false, [follow]: "Sam, 4" }, groups: {} });
            expect(payload.values).not.toHaveProperty(follow);
        });

        it("the Enrollment review does not list a hidden question", () => {
            const { schema, trigger, follow } = author(start);
            const hidden = compileParticipantArtifact(schema, { [trigger]: false });
            expect(hidden.sections[0]!.controls.map((c) => c.field_id)).not.toContain(follow);
            const shown = compileParticipantArtifact(schema, { [trigger]: true });
            expect(shown.sections[0]!.controls.map((c) => c.field_id)).toContain(follow);
        });
    });

    describe("people groups", () => {
        it("the Enrollment review keeps Emergency Contacts as ONE group control, not flattened lines", () => {
            const { schema, contacts } = author(start);
            const compiled = compileParticipantArtifact(schema, {});
            const ids = compiled.sections[0]!.controls.map((c) => c.field_id);
            expect(ids).toContain(contacts.id);
            for (const line of contacts.fields) expect(ids).not.toContain(line.id);
            const control = compiled.outstanding.find((c) => c.field_id === contacts.id)!;
            expect(control).toMatchObject({ input_type: "group", required: true });
        });

        it("the minimum is enforced by the one validator: one contact is refused, two are accepted, each row keeps its own lines", () => {
            const { schema, trigger, address, contacts } = author(start);
            const base = {
                values: { [trigger]: false, ...Object.fromEntries(address.fields.map((f) => [f.id, `${f.label} value`])) },
            };
            const validate = (rows: unknown[]) =>
                validateFormPayload({
                    schemaJson: schema,
                    payload: normalizeSubmissionForSchema(schema, { ...base, groups: { [contacts.id]: rows }, signatures: {} }),
                    mode: "submit",
                } as never) as { ok: boolean; errors?: unknown[] };
            const one = validate([contactRow(contacts, 1)]);
            expect(one.ok).toBe(false);
            expect(JSON.stringify(one)).toMatch(/at least 2|minimum|2/i);
            const two = validate([contactRow(contacts, 1), contactRow(contacts, 2)]);
            expect(two.ok, JSON.stringify(two)).toBe(true);
        });

        it("a member's required line is required per member", () => {
            const { schema, trigger, address, contacts } = author(start);
            const requiredLine = contacts.fields.find((f) => f.required && f.type === "text");
            if (!requiredLine) return; // the definition marks no line required — nothing to enforce
            const rows = [contactRow(contacts, 1), { ...contactRow(contacts, 2), values: { ...contactRow(contacts, 2).values, [requiredLine.id]: "" } }];
            const result = validateFormPayload({
                schemaJson: schema,
                payload: normalizeSubmissionForSchema(schema, {
                    values: { [trigger]: false, ...Object.fromEntries(address.fields.map((f) => [f.id, "v"])) },
                    groups: { [contacts.id]: rows },
                    signatures: {},
                }),
                mode: "submit",
            } as never) as { ok: boolean };
            expect(result.ok).toBe(false);
        });
    });

    describe("address groups", () => {
        it("lines the conversation collected one by one are submitted as the group's single row", () => {
            const { schema, address } = author(start);
            const flat = Object.fromEntries(address.fields.map((f) => [f.id, `${f.label} value`]));
            const payload = normalizeSubmissionForSchema(schema, { values: flat, groups: {} as Record<string, unknown> });
            const rows = payload.groups![address.id] as Array<{ values: Record<string, unknown> }>;
            expect(rows).toHaveLength(1);
            expect(rows[0]!.values).toEqual(flat);
            // Flat values stay too: the signed-document fill reads lines by id.
            expect(payload.values).toMatchObject(flat);
        });

        it("a people group is never folded from flat values", () => {
            const { schema, contacts } = author(start);
            const flat = Object.fromEntries(contacts.fields.map((f) => [f.id, "x"]));
            const payload = normalizeSubmissionForSchema(schema, { values: flat, groups: {} as Record<string, unknown> });
            expect(payload.groups![contacts.id]).toBeUndefined();
        });
    });
});

describe("a group's lines follow the group's visibility", () => {
    it("a line of a hidden group is hidden", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "x",
            sections: [{ id: "s", field_ids: ["gate", "g"] }],
            fields: [
                { id: "gate", type: "boolean", label: "Different mailing address?", required: false },
                {
                    id: "g", type: "group", label: "Mailing address", required: false,
                    visibility: { all: [{ field_id: "gate", op: "eq", value: true }] },
                    fields: [{ id: "g_line", type: "text", label: "Line 1", required: true }],
                },
            ],
        });
        expect(fieldShownForAnswers(schema, "g_line", () => undefined)).toBe(false);
        expect(fieldShownForAnswers(schema, "g_line", (id) => (id === "gate" ? true : undefined))).toBe(true);
    });
});
