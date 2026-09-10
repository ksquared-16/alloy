/**
 * Reading the stored Subject facet.
 *
 * The intake writes the tuple's subject ARRAY into `subject_ref`. A consumer that
 * reads `subject_ref.id` — the shape the column name suggests — matches nothing,
 * every time, silently. These tests pin the shape that is actually stored.
 */

import { describe, expect, it } from "vitest";
import {
    expectationSubjectRefIds,
    expectationSubjectRefMatches,
    primaryExpectationSubjectId,
} from "@/lib/operationalExpectations/query/expectationSubjectRef";

describe("the shape the intake actually writes", () => {
    it("reads the subject array the authoring intake stores", () => {
        expect(expectationSubjectRefIds([{ kind: "child", ref: "emma" }])).toEqual(["emma"]);
    });

    it("reads every subject of a multi-subject tuple", () => {
        // An expectation about two children must apply to both, not to the first.
        expect(
            expectationSubjectRefIds([
                { kind: "child", ref: "emma" },
                { kind: "child", ref: "finn" },
            ]),
        ).toEqual(["emma", "finn"]);
    });

    it("reads a subject whose ref is itself a list", () => {
        expect(expectationSubjectRefIds([{ kind: "child", ref: ["emma", "finn"] }])).toEqual(["emma", "finn"]);
    });
});

describe("tolerant on read", () => {
    it("accepts the flat spellings an older row may carry", () => {
        expect(primaryExpectationSubjectId({ id: "emma" })).toBe("emma");
        expect(primaryExpectationSubjectId({ ref: "emma" })).toBe("emma");
        expect(primaryExpectationSubjectId({ subject_id: "emma" })).toBe("emma");
    });

    it("answers empty rather than 'undefined' for a missing subject", () => {
        // Stringifying a missing id produced the literal subject "undefined",
        // which matches nothing and looks like a real value in a log.
        expect(primaryExpectationSubjectId(null)).toBe("");
        expect(primaryExpectationSubjectId({})).toBe("");
        expect(expectationSubjectRefIds([{ kind: "child" }])).toEqual([]);
    });

    it("ignores blank refs rather than matching on empty string", () => {
        expect(expectationSubjectRefIds([{ kind: "child", ref: "   " }])).toEqual([]);
    });
});

describe("matching", () => {
    it("matches when any named subject is wanted", () => {
        const ref = [
            { kind: "child", ref: "emma" },
            { kind: "child", ref: "finn" },
        ];
        expect(expectationSubjectRefMatches(ref, new Set(["finn"]))).toBe(true);
        expect(expectationSubjectRefMatches(ref, new Set(["nobody"]))).toBe(false);
    });
});
