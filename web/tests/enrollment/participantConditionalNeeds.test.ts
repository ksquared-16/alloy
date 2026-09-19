import { describe, expect, it } from "vitest";

import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { validateFormSchema } from "@/lib/forms/schema";

/**
 * "IF YES, PLEASE EXPLAIN" IS NOT A QUESTION.
 *
 * It is the second half of one, and a family who has just said there are no custody arrangements
 * must never meet it. The Form schema has carried `visibility` since v1 — the public renderer
 * honours it and `validateSubmission` will not demand a hidden required field — but the PARTICIPANT
 * projection never consulted it, so every conditional destination in every packet became an
 * unconditional turn. Measured on the real Admissions packet: four "If yes…" boxes, all four asked
 * of every family regardless of the answer above them.
 *
 * These prove the decision comes from the AUTHORED condition and from nothing else. No label here
 * says "if yes"; the follow-up is called "Tell us more", so a rule that read English would fail
 * every one of them.
 */

const ADMISSIONS = "7d80ff71-2ae4-43f6-bd4d-0b8022e28f7d";
const VERSION = "c9acd4d3-7862-47f8-bacb-4ad83f3a3937";
const CHILD = "cccc0000-0000-4000-8000-00000000000a";

/** One closed question and one dependent detail, authored the way Forms already allows. */
function conditionalSchema(over: { equals?: unknown; op?: "eq" | "neq" } = {}) {
    return validateFormSchema({
        schema_version: 1,
        title: "Admissions Information",
        sections: [{ id: "s1", title: "Health Information", field_ids: ["gate", "detail", "unrelated"] }],
        fields: [
            { id: "gate", type: "boolean", label: "Does your child have siblings?", required: true },
            {
                id: "detail",
                type: "text",
                label: "Tell us more",
                required: false,
                visibility: { all: [{ field_id: "gate", op: over.op ?? "eq", value: over.equals ?? true }] },
            },
            { id: "unrelated", type: "text", label: "General health", required: true },
        ],
    });
}

function project(schema: ReturnType<typeof conditionalSchema>, sharedValues: Record<string, unknown>) {
    return projectEnrollmentInformationNeeds({
        forms: [
            {
                requirement_id: "req_admissions",
                form_definition_id: ADMISSIONS,
                form_definition_version_id: VERSION,
                session_item_id: "item_1",
                schema,
            },
        ],
        subjectId: CHILD,
        sharedValues,
        confirmations: {},
    });
}

/** The session key the runtime would write the gate's answer under. */
function gateKey(schema: ReturnType<typeof conditionalSchema>): string {
    const gate = project(schema, {}).find((n) => n.occurrences.some((o) => o.form_field_id === "gate"));
    const key = gate?.identity.session_value_key;
    if (!key) throw new Error("the gate question has no session key; the fixture is wrong, not the rule");
    return key;
}

const fieldIds = (needs: ReturnType<typeof project>) =>
    needs.flatMap((n) => n.occurrences.map((o) => o.form_field_id));

describe("a dependent question is asked only when the Form's own condition is met", () => {
    it("withholds the follow-up while the controlling question is unanswered", () => {
        const schema = conditionalSchema();
        const ids = fieldIds(project(schema, {}));
        expect(ids).toContain("gate");
        expect(ids).toContain("unrelated");
        expect(ids).not.toContain("detail");
    });

    it("withholds the follow-up when the family answered No", () => {
        const schema = conditionalSchema();
        const ids = fieldIds(project(schema, { [gateKey(schema)]: false }));
        expect(ids).toContain("gate");
        expect(ids).not.toContain("detail");
    });

    it("asks the follow-up when the family answered Yes", () => {
        const schema = conditionalSchema();
        const ids = fieldIds(project(schema, { [gateKey(schema)]: true }));
        expect(ids).toContain("gate");
        expect(ids).toContain("detail");
    });

    it("reads the authored operator, not the word yes — neq withholds on a match", () => {
        const schema = conditionalSchema({ op: "neq", equals: true });
        const yes = fieldIds(project(schema, { [gateKey(schema)]: true }));
        const no = fieldIds(project(schema, { [gateKey(schema)]: false }));
        expect(yes).not.toContain("detail");
        expect(no).toContain("detail");
    });

    it("a withheld question is absent, not merely optional — it counts as no work at all", () => {
        const schema = conditionalSchema();
        const needs = project(schema, { [gateKey(schema)]: false });
        expect(needs.some((n) => n.occurrences.some((o) => o.form_field_id === "detail"))).toBe(false);
    });

    it("a Form that authors no condition is untouched", () => {
        const plain = validateFormSchema({
            schema_version: 1,
            title: "Admissions Information",
            sections: [{ id: "s1", title: "Health Information", field_ids: ["a", "b"] }],
            fields: [
                { id: "a", type: "text", label: "General health", required: true },
                { id: "b", type: "text", label: "Eating habits", required: true },
            ],
        });
        expect(fieldIds(project(plain as never, {})).sort()).toEqual(["a", "b"]);
    });
});

describe("a multiline authored control reaches the conversation as a paragraph", () => {
    it("carries long_text, so the turn is not a single-line box", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "Admissions Information",
            sections: [{ id: "s1", title: "Health Information", field_ids: ["story", "short"] }],
            fields: [
                { id: "story", type: "text", multiline: true, label: "Developmental history", required: true },
                { id: "short", type: "text", label: "Primary physician name", required: true },
            ],
        });
        const needs = project(schema as never, {});
        const typeOf = (id: string) =>
            needs.flatMap((n) => n.occurrences).find((o) => o.form_field_id === id)?.field_type;
        expect(typeOf("story")).toBe("long_text");
        expect(typeOf("short")).toBe("text");
    });
});

/**
 * THE TRAP THIS SLICE ALMOST WALKED INTO.
 *
 * `fieldIsAcknowledgement` classified ANY unbound, required boolean as an attestation to be shown
 * beside the document, and the need projection drops those from the conversation. Every one of the
 * fourteen yes/no questions on the real Admissions packet is unbound and required, so authoring
 * them as the booleans they are would have deleted all fourteen from the journey — silently, with
 * the packet still reporting them complete because nobody was ever asked.
 *
 * The separating property is grammar: an acknowledgement is a STATEMENT a person accepts.
 */
describe("an unbound required boolean is an attestation only when it is not a question", () => {
    const ackSchema = (label: string) =>
        validateFormSchema({
            schema_version: 1,
            title: "Admissions Information",
            sections: [{ id: "s1", title: "Tuition & Enrollment Agreement", field_ids: ["b"] }],
            fields: [{ id: "b", type: "boolean", label, required: true }],
        });

    const asked = (label: string) =>
        project(ackSchema(label) as never, {}).some((n) => n.occurrences.some((o) => o.form_field_id === "b"));

    it("still withholds the certification tenant's own attestation", () => {
        expect(asked("I acknowledge the information above is accurate.")).toBe(false);
    });

    it("still withholds an attestation a tenant worded differently", () => {
        expect(asked("I agree to the Tuition and Enrollment Agreement")).toBe(false);
    });

    it("asks every closed question the real packet contains", () => {
        for (const label of [
            "Does your child have siblings?",
            "Has your child ever been stung by a bee or wasp?",
            "Is your child able to play alone?",
            "Are there any custody or visiting arrangements we need to be aware of?",
            "Will your student be simultaneously enrolled in an additional program, school, class or camp while also attending School of Enrichment?",
            "Do you use any kind of behavior management at home?",
        ]) {
            expect(asked(label), label).toBe(true);
        }
    });

    it("leaves a bare tickbox classified exactly as it was", () => {
        expect(asked("Chickenpox")).toBe(false);
    });

    it("does not read an instruction as a question", () => {
        expect(asked("Do not send medication in your child's backpack")).toBe(false);
    });
});
