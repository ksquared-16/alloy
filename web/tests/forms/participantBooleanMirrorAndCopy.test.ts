import { describe, expect, it } from "vitest";

import { mirrorCanonicalValues } from "@/lib/forms/guidedQuestionPlan";
import {
    fieldLabelsById,
    participantValidationCopy,
} from "@/lib/public/forms/formatPublicValidationErrors";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";

/**
 * A PARENT WAS REFUSED FOR AN ANSWER THEY WERE NEVER ASKED FOR.
 *
 * Health & Medical's `field_9` is "Medical Authorization Ack", a boolean. It is not rendered in any
 * phase of the participant flow. Yet submitting that form failed with
 *
 *     values › field_9: Expected boolean
 *
 * because the canonical mirror had written a TEXT answer from Northwind into it — the two fields
 * share a canonical key, and the mirror copied the representative value to every sibling without
 * asking whether the sibling could hold it. Two defects in one line of output: a value in the wrong
 * shape, and the validator's own syntax shown to a parent.
 */

const GROUPS = { medical_ack: ["field_1", "field_9"] };
const TYPES = { field_1: "text", field_9: "boolean" };

describe("the canonical mirror only writes where the value fits", () => {
    it("does not put a text answer into a boolean sibling", () => {
        // The exact live failure: a string typed on one form reaching a boolean on another.
        const out = mirrorCanonicalValues({ field_1: "Provided" }, GROUPS, TYPES);
        expect(out.field_9).toBeUndefined();
        expect(out.field_1).toBe("Provided");
    });

    it("still mirrors a boolean to a boolean sibling", () => {
        // Collect once, write everywhere it fits — the feature must survive the fix.
        expect(mirrorCanonicalValues({ field_9: true }, GROUPS, TYPES).field_1).toBe(true);
        const both = { field_1: "boolean", field_9: "boolean" };
        expect(mirrorCanonicalValues({ field_9: false }, GROUPS, both).field_1).toBe(false);
    });

    it("mirrors ordinary same-shape values exactly as before", () => {
        const text = { field_1: "text", field_9: "text" };
        expect(mirrorCanonicalValues({ field_1: "Bo Certopp" }, GROUPS, text).field_9).toBe("Bo Certopp");
    });

    it("treats empty as always assignable, so clearing still propagates", () => {
        /*
         * An unanswered optional boolean must not be blocked from being mirrored as "still empty".
         * The guard refuses wrong SHAPES, and absence has no shape — so null and "" travel, which is
         * how a cleared answer reaches its siblings.
         */
        expect(mirrorCanonicalValues({ field_1: null }, GROUPS, TYPES).field_9).toBeNull();
        expect(mirrorCanonicalValues({ field_1: "" }, GROUPS, TYPES).field_9).toBe("");
    });

    it("refuses a non-array into multiselect and a non-number into number", () => {
        expect(
            mirrorCanonicalValues({ a: "one" }, { g: ["a", "b"] }, { a: "text", b: "multiselect" }).b,
        ).toBeUndefined();
        expect(
            mirrorCanonicalValues({ a: "not a number" }, { g: ["a", "b"] }, { a: "text", b: "number" }).b,
        ).toBeUndefined();
        // A numeric string IS assignable to a number field — the guard refuses shapes, not values.
        expect(mirrorCanonicalValues({ a: "42" }, { g: ["a", "b"] }, { a: "text", b: "number" }).b).toBe("42");
    });

    it("preserves the previous behaviour exactly when no types are supplied", () => {
        // Every existing caller must be unchanged by upgrading this function.
        expect(mirrorCanonicalValues({ field_1: "Provided" }, GROUPS).field_9).toBe("Provided");
    });
});

const SCHEMA = {
    version: 1,
    title: "Health and Medical Authorization",
    fields: [
        { id: "field_9", type: "boolean", label: "Medical Authorization Ack", required: false },
        { id: "field_7", type: "text", label: "Physician Name", required: false },
    ],
} as unknown as FormSchemaV1;

const err = (path: (string | number)[], message: string): NormalizedValidationError =>
    ({ path, message, code: "invalid_type" }) as NormalizedValidationError;

describe("a refused submission speaks to the parent, not to the validator", () => {
    it("never shows a field id, a schema path or a validator string", () => {
        const copy = participantValidationCopy([err(["values", "field_9"], "Expected boolean")], SCHEMA);
        expect(copy.summary).not.toMatch(/field_9|values ›|Expected boolean|invalid_type/);
    });

    it("names the answer in the school's own words", () => {
        const copy = participantValidationCopy([err(["values", "field_9"], "Expected boolean")], SCHEMA);
        expect(copy.summary).toContain("Medical Authorization Ack");
        expect(copy.fieldLabels).toEqual(["Medical Authorization Ack"]);
    });

    it("asks for one recoverable action", () => {
        const copy = participantValidationCopy([err(["values", "field_7"], "Required")], SCHEMA);
        expect(copy.summary).toBe("Please review your answer for Physician Name and try again.");
    });

    it("lists several answers readably", () => {
        const copy = participantValidationCopy(
            [err(["values", "field_9"], "Expected boolean"), err(["values", "field_7"], "Required")],
            SCHEMA,
        );
        expect(copy.summary).toBe(
            "Please review your answers for Medical Authorization Ack and Physician Name and try again.",
        );
    });

    it("blames nobody when it cannot name the answer", () => {
        /*
         * The live case: the offending field is not on the parent's screen at all. Naming an id
         * would be worse than saying less, so it says what to do and offers a way out.
         */
        const copy = participantValidationCopy([err(["values", "field_99"], "Expected boolean")], SCHEMA);
        expect(copy.fieldLabels).toEqual([]);
        expect(copy.summary).not.toMatch(/field_99/);
        expect(copy.summary).toContain("contact the school");
    });

    it("survives a missing schema without leaking the path", () => {
        const copy = participantValidationCopy([err(["values", "field_9"], "Expected boolean")], null);
        expect(copy.summary).not.toMatch(/field_9|Expected boolean/);
    });

    it("indexes nested group fields too", () => {
        const nested = {
            version: 1,
            title: "t",
            fields: [
                { id: "g1", type: "group", label: "Children", fields: [{ id: "c1", type: "text", label: "Child name" }] },
            ],
        } as unknown as FormSchemaV1;
        expect(fieldLabelsById(nested).c1).toBe("Child name");
    });
});
