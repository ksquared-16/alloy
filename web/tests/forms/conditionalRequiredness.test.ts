/**
 * A COLLECTION THAT DOES NOT APPLY CANNOT BE INCOMPLETE.
 *
 * The Director's rule for a gated follow-up: the gate is required, a triggering answer makes the
 * follow-up required, and a non-triggering answer must not block. The scalar half of that was
 * already right — `validateFormPayload` skips the required check for a hidden field and refuses a
 * hidden field that arrives with a value.
 *
 * The GROUP half was not. Group validation ran before visibility was consulted at all, so
 * "Does the child have siblings?" → No failed submission with "Expected at least 1 group
 * instance(s)": the family answered the gate truthfully and the platform demanded the entries the
 * gate had just said do not exist. The same blindness accepted the mirror error — a hidden
 * collection arriving WITH rows was let through.
 *
 * Measured, not assumed: this file is the measurement harness that found it, kept as the guard.
 */
import { describe, expect, it } from "vitest";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema = {
    schema_version: 1,
    title: "Sibling gate",
    sections: [{ id: "s1", title: "S", field_ids: ["gate", "kids", "detail"] }],
    fields: [
        { id: "gate", type: "boolean", label: "Does the child have siblings?", required: true },
        {
            id: "kids", type: "group", label: "Siblings", required: false,
            repeat: { min: 1 },
            visibility: { all: [{ field_id: "gate", op: "eq", value: true }] },
            fields: [{ id: "kids_name", type: "text", label: "Full name", required: true }],
        },
        {
            id: "detail", type: "text", label: "Anything else about them", required: true,
            visibility: { all: [{ field_id: "gate", op: "eq", value: true }] },
        },
    ],
} as unknown as FormSchemaV1;

const run = (values: Record<string, unknown>, groups: Record<string, unknown[]> = {}) =>
    validateFormPayload({ schemaJson: schema, payload: { values, groups }, mode: "submit" });

const problems = (r: ReturnType<typeof run>) =>
    r.ok ? [] : r.errors.map((e) => `${e.path.join(".")}: ${e.message}`);

const ONE = [{ instance_key: "k1", values: { kids_name: "Amira" } }];

describe("the gate decides whether the follow-up applies", () => {
    it("unanswered — the gate itself is the only thing missing", () => {
        expect(problems(run({}))).toEqual(["values.gate: Required field missing"]);
    });

    it("No — valid with no entry and no detail", () => {
        expect(run({ gate: false })).toMatchObject({ ok: true });
    });

    it("Yes with nothing supplied — both halves are now owed", () => {
        const p = problems(run({ gate: true }));
        expect(p).toContain("kids: Expected at least 1 group instance(s)");
        expect(p).toContain("values.detail: Required field missing");
    });

    it("Yes with one sibling and the detail — valid", () => {
        expect(run({ gate: true, detail: "They are twins." }, { kids: ONE })).toMatchObject({ ok: true });
    });
});

describe("a hidden follow-up may not carry content either", () => {
    it("refuses a collection that arrives with rows while hidden", () => {
        expect(problems(run({ gate: false }, { kids: ONE }))).toContain(
            "groups.kids: Group is hidden and must be empty on submit",
        );
    });

    it("refuses a hidden scalar that arrives with a value — the rule this now matches", () => {
        expect(problems(run({ gate: false, detail: "leaked" }))).toContain(
            "values.detail: Field is hidden and must be empty on submit",
        );
    });
});

describe("an unconditional collection is unaffected", () => {
    const plain = {
        schema_version: 1,
        title: "Plain",
        sections: [{ id: "s1", title: "S", field_ids: ["kids"] }],
        fields: [
            {
                id: "kids", type: "group", label: "Siblings", required: false, repeat: { min: 1 },
                fields: [{ id: "kids_name", type: "text", label: "Full name", required: true }],
            },
        ],
    } as unknown as FormSchemaV1;

    it("still enforces its own minimum", () => {
        const r = validateFormPayload({ schemaJson: plain, payload: { values: {}, groups: {} }, mode: "submit" });
        expect(r.ok).toBe(false);
    });
});
