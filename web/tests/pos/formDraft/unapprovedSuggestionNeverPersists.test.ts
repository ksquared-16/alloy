import { describe, expect, it } from "vitest";

import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * A CANONICAL BINDING SUGGESTION IS NOT A CANONICAL BINDING.
 *
 * Import and discovery may PROPOSE `question → canonical field`. That proposal must not become
 * persisted Form truth unless an operator explicitly accepted it, or a durable approved decision
 * already wrote it onto the draft field.
 *
 * The materializer used to close that gap with a `??`:
 *
 *     f.field_source ?? suggestFieldBinding(f.label, f.type)?.field_source
 *
 * so every field the operator had NOT decided about silently acquired the matcher's best guess at
 * publish time. The real Admissions import was sent with FOUR approved bindings and stored FIFTEEN.
 *
 * The cases below are the real Admissions semantics, used as regression coverage. They are not a
 * denylist — nothing here names a field to block. They assert the general rule from the outside:
 * an unapproved suggestion persists nothing at all.
 */

const field = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
    id,
    label,
    type: "text" as const,
    required: false,
    confidence: "high" as const,
    ...extra,
});

/** A draft carrying the real Admissions labels, with NO operator decisions on any of them. */
function undecidedDraft(labels: readonly string[]): StoredFormDraftPreview {
    const fields = labels.map((l, i) => field(`field_${i + 1}`, l));
    return {
        title: "Admissions Information",
        sections: [{ id: "section_1", title: "Contact Information", field_ids: fields.map((f) => f.id) }],
        fields,
    } as unknown as StoredFormDraftPreview;
}

const bindingsOf = (schema: { fields: readonly { label: string; field_source?: unknown }[] }) =>
    schema.fields.filter((f) => f.field_source !== undefined);

describe("an undecided question persists no canonical binding", () => {
    /*
     * Every one of these matched a rule in `suggestFieldBinding` and was silently written onto the
     * published Admissions form. Each is a DIFFERENT way the matcher can be wrong, which is why the
     * fix has to be the general rule rather than a list.
     */
    it.each([
        // A full name cannot be written into a first-name destination without decomposition.
        "Student Name:",
        "Parent Name:",
        // Four distinct concepts that all matched one canonical address field.
        "Physical Address, City, State and Zip Code:",
        "Mailing Address or Secondary Parent Address (if applicable):",
        "Parent/Guardian #1 Employer Address:",
        "Parent/Guardian #2 Employer Address:",
        // A second, distinct person whose contact details matched the generic person record.
        "Parent/Guardian #2 Phone Number:",
        "Parent/Guardian #2 Email Address:",
        // D-H5: medications belong to Health foundation, not an Enrollment-owned substitute.
        "Regular medications?",
        "Does your child have any allergies? If so, please list.",
    ])("%j is not bound when nobody approved it", (label) => {
        const schema = draftFormToFormSchemaV1(undecidedDraft([label]));
        expect(schema.fields).toHaveLength(1);
        expect(schema.fields[0]).not.toHaveProperty("field_source");
    });

    it("the whole undecided Admissions set materializes with zero bindings", () => {
        const schema = draftFormToFormSchemaV1(
            undecidedDraft([
                "Student Name:",
                "Student Date of Birth:",
                "Parent/Guardian #1 Phone Number:",
                "Physical Address, City, State and Zip Code:",
                "Regular medications?",
            ]),
        );
        expect(bindingsOf(schema)).toHaveLength(0);
    });
});

describe("an accepted decision still materializes", () => {
    it("carries exactly the binding the operator approved", () => {
        const draft = {
            title: "Admissions Information",
            sections: [{ id: "s1", title: "Contact Information", field_ids: ["field_1"] }],
            fields: [
                field("field_1", "Student Date of Birth:", {
                    field_source: {
                        entity_type: "child",
                        field_key: "child_date_of_birth",
                        shared_value_key: "child_date_of_birth",
                    },
                }),
            ],
        } as unknown as StoredFormDraftPreview;

        const schema = draftFormToFormSchemaV1(draft);
        expect(schema.fields[0].field_source).toEqual({
            entity_type: "child",
            field_key: "child_date_of_birth",
            shared_value_key: "child_date_of_birth",
        });
    });

    it("an accepted binding is preserved verbatim and is never replaced by the matcher's guess", () => {
        /*
         * The operator's decision is the authority even when the matcher would have proposed
         * something else for the same label — that is the whole point of a decision.
         */
        const draft = {
            title: "T",
            sections: [{ id: "s1", title: "S", field_ids: ["field_1"] }],
            fields: [
                field("field_1", "Student Name:", {
                    field_source: { entity_type: "child", field_key: "child_last_name" },
                }),
            ],
        } as unknown as StoredFormDraftPreview;

        expect(draftFormToFormSchemaV1(draft).fields[0].field_source).toEqual({
            entity_type: "child",
            field_key: "child_last_name",
        });
    });
});

describe("N suggested, M accepted — exactly M persist", () => {
    it("materializes the approved subset and not one binding more", () => {
        /*
         * The shape of the real import: ten questions the matcher can bind, four decisions actually
         * taken. This is the assertion the Admissions defect would have failed — it stored fifteen.
         */
        const approved: Record<string, { entity_type: string; field_key: string }> = {
            "Student Date of Birth:": { entity_type: "child", field_key: "child_date_of_birth" },
            "Student's first day:": { entity_type: "enrollment", field_key: "start_date" },
            "Parent/Guardian #1 Phone Number:": { entity_type: "guardian", field_key: "guardian_phone" },
            "Parent/Guardian #1 Email Address:": { entity_type: "guardian", field_key: "guardian_email" },
        };
        const labels = [
            "Student Name:",
            "Student Date of Birth:",
            "Student's first day:",
            "Parent/Guardian #1 Phone Number:",
            "Parent/Guardian #1 Email Address:",
            "Parent/Guardian #2 Phone Number:",
            "Parent/Guardian #2 Email Address:",
            "Physical Address, City, State and Zip Code:",
            "Parent Name:",
            "Regular medications?",
        ];
        const fields = labels.map((l, i) =>
            field(`field_${i + 1}`, l, approved[l] ? { field_source: approved[l] } : {}),
        );
        const draft = {
            title: "Admissions Information",
            sections: [{ id: "s1", title: "Contact Information", field_ids: fields.map((f) => f.id) }],
            fields,
        } as unknown as StoredFormDraftPreview;

        const schema = draftFormToFormSchemaV1(draft);
        const bound = bindingsOf(schema);

        expect(schema.fields).toHaveLength(10);
        expect(bound).toHaveLength(4);
        expect(bound.map((f) => f.label).sort()).toEqual(Object.keys(approved).sort());
    });
});
