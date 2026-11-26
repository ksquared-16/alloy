/**
 * A provider answering several needs gains no authority it did not already lack.
 *
 * The single-need contract lets a model respond ABOUT the turn the platform chose and address
 * nothing. Packaging adds one dimension — several named needs — and these pin that nothing else
 * came with it.
 */
import { describe, it, expect } from "vitest";
import { reviewPackagedCandidates } from "@/lib/enrollment/participantRuntime/packagedCandidateSet";

const ok = (v: string) => ({ kind: "corrected_value" as const, value: v });

describe("a response is bound to the needs that were offered", () => {
    it("accepts a candidate per offered need", () => {
        const r = reviewPackagedCandidates(["a", "b"], { answers: [{ need_key: "a", candidate: ok("x") }, { need_key: "b", candidate: ok("y") }] });
        expect(r.accepted.map((x) => x.need_key)).toEqual(["a", "b"]);
        expect(r.unanswered).toEqual([]);
        expect(r.rejected).toEqual([]);
    });

    it("PARTIAL is normal: two resolved, one still outstanding", () => {
        const r = reviewPackagedCandidates(["a", "b", "c"], { answers: [{ need_key: "a", candidate: ok("x") }, { need_key: "c", candidate: ok("z") }] });
        expect(r.accepted).toHaveLength(2);
        expect(r.unanswered, "the unanswered need is asked next, not failed").toEqual(["b"]);
        expect(r.rejected).toEqual([]);
    });

    it("discards a need the platform never offered", () => {
        // The provider reaching outside its package — refused, and recorded rather than silent.
        const r = reviewPackagedCandidates(["a"], { answers: [{ need_key: "a", candidate: ok("x") }, { need_key: "somewhere_else", candidate: ok("!") }] });
        expect(r.accepted).toHaveLength(1);
        expect(r.rejected).toEqual([{ code: "need_not_offered", need_key: "somewhere_else" }]);
    });

    it("refuses to answer the same need twice", () => {
        const r = reviewPackagedCandidates(["a"], { answers: [{ need_key: "a", candidate: ok("first") }, { need_key: "a", candidate: ok("second") }] });
        expect(r.accepted).toHaveLength(1);
        expect(r.accepted[0]!.candidate).toEqual(ok("first"));
        expect(r.rejected[0]!.code).toBe("duplicate_need");
    });

    it("refuses anything that is not a StructuredCandidate", () => {
        const r = reviewPackagedCandidates(["a", "b", "c"], {
            answers: [
                { need_key: "a", candidate: { kind: "write_field", field: "child.dob", value: "x" } },
                { need_key: "b", candidate: "just a string" },
                { need_key: "c" },
            ],
        });
        expect(r.accepted).toEqual([]);
        expect(r.rejected).toHaveLength(3);
        expect(r.unanswered).toEqual(["a", "b", "c"]);
    });

    it("treats a malformed response as answering nothing", () => {
        for (const bad of [null, undefined, {}, { answers: "no" }, []]) {
            const r = reviewPackagedCandidates(["a", "b"], bad);
            expect(r.accepted).toEqual([]);
            expect(r.unanswered).toEqual(["a", "b"]);
        }
    });

    it("keeps the platform's order, not the provider's", () => {
        // A model must not be able to reorder what the parent is asked next.
        const r = reviewPackagedCandidates(["a", "b", "c"], {
            answers: [{ need_key: "c", candidate: ok("3") }, { need_key: "a", candidate: ok("1") }],
        });
        expect(r.accepted.map((x) => x.need_key)).toEqual(["a", "c"]);
    });

    it("is total — every input is accepted, unanswered or rejected", () => {
        const r = reviewPackagedCandidates(["a", "b"], { answers: [{ need_key: "a", candidate: ok("x") }, { need_key: "zzz", candidate: ok("y") }] });
        expect(r.accepted.length + r.unanswered.length + r.rejected.length).toBe(3);
    });
});
