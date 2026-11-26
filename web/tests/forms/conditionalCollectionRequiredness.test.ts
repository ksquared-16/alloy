/**
 * A COLLECTION THAT DOES NOT APPLY CANNOT BE INCOMPLETE — AND IS NOT A HIDING PLACE.
 *
 * The Director's canonical example is a sibling gate: "Does the child have siblings?" governs a
 * collection with a minimum of one. Unanswered is incomplete; No is valid with no entry; Yes with no
 * entry is incomplete; Yes with one entry is valid.
 *
 * MEASURED BEFORE THE REPAIR, on a real payload rather than reasoned about:
 *
 *   unanswered      values.gate: Required field missing ; kids: Expected at least 1 group instance(s)
 *   No, 0 entries   kids: Expected at least 1 group instance(s)      ← blocked for answering honestly
 *   Yes, 0 entries  kids: Expected at least 1 group instance(s)
 *   Yes, 1 entry    VALID
 *   No, 1 stray     VALID                                            ← a hidden collection accepted rows
 *
 * Two defects in one place. A family that answered "No" was refused with no way forward, because the
 * question they answered was the very one that hid the collection; and the mirror case let a hidden
 * collection carry rows into a submission.
 *
 * The cause was ordering: the group branch dispatched into `validateGroupInstances` BEFORE
 * visibility was computed, while every other field kind asked that question first.
 */
import { describe, expect, it } from "vitest";

import { validateFormPayload } from "@/lib/forms/validateSubmission";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema = {
    schema_version: 1,
    title: "sibling gate",
    sections: [{ id: "s1", title: "Family", field_ids: ["gate", "kids"] }],
    fields: [
        { id: "gate", type: "boolean", label: "Does the child have siblings?", required: true },
        {
            id: "kids",
            type: "group",
            label: "Siblings",
            required: false,
            repeat: { min: 1 },
            visibility: { all: [{ field_id: "gate", op: "eq", value: true }] },
            fields: [{ id: "kids_name", type: "text", label: "Full name", required: true }],
        },
    ],
} as unknown as FormSchemaV1;

const SIBLING = { instance_key: "k1", values: { kids_name: "Sam" } };

function submit(values: Record<string, unknown>, kids: unknown[]): string {
    const res = validateFormPayload({ schemaJson: schema, payload: { values, groups: { kids } }, mode: "submit" as never });
    const errs = (res as { errors?: { path: unknown[]; message: string }[] }).errors ?? [];
    return errs.length === 0 ? "VALID" : errs.map((e) => `${(e.path ?? []).join(".")}: ${e.message}`).join(" ; ");
}

describe("a gate that governs a collection", () => {
    it("owes only the gate while the gate is unanswered", () => {
        // Not "and also a sibling": the collection is not asked until the gate says so.
        expect(submit({}, [])).toBe("values.gate: Required field missing");
    });

    it("accepts No with no entries — the case that was blocked", () => {
        expect(submit({ gate: false }, [])).toBe("VALID");
    });

    it("still owes an entry when the answer is Yes", () => {
        expect(submit({ gate: true }, [])).toBe("kids: Expected at least 1 group instance(s)");
    });

    it("accepts Yes with one entry", () => {
        expect(submit({ gate: true }, [SIBLING])).toBe("VALID");
    });

    it("refuses a stray row in a hidden collection — the mirror case", () => {
        // Hidden means NOT ASKED, and not asked means neither required nor permitted.
        expect(submit({ gate: false }, [SIBLING])).toBe("groups.kids: Group is hidden and must be empty on submit");
    });
});

describe("an unconditional collection is unaffected", () => {
    const always = {
        ...schema,
        fields: [
            schema.fields[0],
            { ...(schema.fields[1] as Record<string, unknown>), visibility: undefined },
        ],
    } as unknown as FormSchemaV1;

    it("still enforces its minimum", () => {
        const res = validateFormPayload({ schemaJson: always, payload: { values: { gate: false }, groups: { kids: [] } }, mode: "submit" as never });
        const errs = (res as { errors?: { message: string }[] }).errors ?? [];
        expect(errs.map((e) => e.message).join(" ; ")).toContain("at least 1 group instance");
    });
});
