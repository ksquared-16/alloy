/**
 * "Does anything still block Enrollment completion?" — asked once, by three consumers.
 *
 * Discovery found the requirement projection consumed only by the participant runtime, so the
 * operator surface and the completion outcome had no way to ask the same question. These pin the
 * answer, including the cases where saying "complete" would be a lie.
 */

import { describe, expect, it } from "vitest";

import { evaluateEnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import type { EnrollmentRequirementProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";

const req = (over: Partial<EnrollmentRequirementProgress> & { requirement_id: string }): EnrollmentRequirementProgress => ({
    kind: "form",
    artifact: { kind: "form", id: `fd_${over.requirement_id}` },
    level: "required",
    status: "outstanding",
    ...over,
}) as EnrollmentRequirementProgress;

/** The five certified Enrollment Form requirements. */
const FIVE = [
    req({ requirement_id: "cis", status: "satisfied" }),
    req({ requirement_id: "exemption", status: "satisfied" }),
    req({ requirement_id: "admissions", status: "satisfied" }),
    req({ requirement_id: "tuition", status: "satisfied" }),
    req({ requirement_id: "handbook", status: "satisfied" }),
];

const evaluate = (requirements: EnrollmentRequirementProgress[], exceptions = {}) =>
    evaluateEnrollmentCompletionSufficiency({ progress: { requirements } as never, exceptions });

describe("completion eligibility", () => {
    it("is eligible when every configured requirement is satisfied", () => {
        const result = evaluate(FIVE);
        expect(result.eligible).toBe(true);
        expect(result.counts).toMatchObject({ total: 5, satisfied: 5, excepted: 0, blocking: 0 });
    });

    it("BLOCKS on one outstanding required Form, and says which", () => {
        // The central negative path: paperwork not submitted must hold completion.
        const result = evaluate([...FIVE.slice(0, 4), req({ requirement_id: "handbook", status: "outstanding" })]);
        expect(result.eligible).toBe(false);
        expect(result.blocking.map((b) => b.requirement_id)).toEqual(["handbook"]);
        expect(result.blocking[0]!.blocked_reason).toBe("The paperwork has not been submitted yet.");
    });

    it("BLOCKS on unrealized and unsupported rather than treating them as done", () => {
        /*
         * `unrealized` exists precisely so an incomplete packet cannot read as a finished
         * enrolment. Neither it nor `unsupported` is evidence of anything being satisfied.
         */
        const result = evaluate([
            req({ requirement_id: "missing", status: "unrealized", reason: "Not in the family's packet." }),
            req({ requirement_id: "odd", status: "unsupported", reason: "Field requirements are not evaluated here." }),
        ]);
        expect(result.eligible).toBe(false);
        expect(result.blocking).toHaveLength(2);
        expect(result.blocking[0]!.blocked_reason).toBe("Not in the family's packet.");
    });

    it("lets Business Process decide what is merely guidance", () => {
        // A `recommended` requirement is guidance and must not hold a family out of care. The level
        // comes from the same authority that decided the requirement exists.
        const result = evaluate([...FIVE, req({ requirement_id: "optional_tour", level: "recommended", status: "outstanding" })]);
        expect(result.eligible).toBe(true);
        expect(result.requirements.find((r) => r.requirement_id === "optional_tour")!.disposition).toBe("not_blocking");
    });
});

describe("a governed exception", () => {
    const exception = {
        requirement_id: "exemption",
        reason: "Child has a medical exemption already on file with the state.",
        approved_by: "user_7",
        approved_at: "2026-08-27T10:00:00.000Z",
    };

    it("makes exactly that requirement non-blocking", () => {
        const outstanding = [...FIVE.slice(0, 1), req({ requirement_id: "exemption", status: "outstanding" }), ...FIVE.slice(2)];
        const result = evaluate(outstanding, { exemption: exception });
        expect(result.eligible).toBe(true);
        expect(result.counts.excepted).toBe(1);
    });

    it("does NOT fabricate a submission — the requirement stays visibly excepted", () => {
        /*
         * The record must show that a person decided this, and who. Dressing an exception up as a
         * submitted form would put a false statement in the enrolment's own evidence.
         */
        const outstanding = [req({ requirement_id: "exemption", status: "outstanding" })];
        const row = evaluate(outstanding, { exemption: exception }).requirements[0]!;
        expect(row.disposition).toBe("excepted");
        expect(row.status, "the underlying requirement is untouched").toBe("outstanding");
        expect(row.exception).toEqual(exception);
    });

    it("excepts ONE requirement, never its neighbours", () => {
        const outstanding = [
            req({ requirement_id: "exemption", status: "outstanding" }),
            req({ requirement_id: "handbook", status: "outstanding" }),
        ];
        const result = evaluate(outstanding, { exemption: exception });
        expect(result.eligible).toBe(false);
        expect(result.blocking.map((b) => b.requirement_id)).toEqual(["handbook"]);
    });
});

describe("what eligibility is NOT derived from", () => {
    it("is false with no requirements satisfied, whatever a participant surface says", () => {
        // Not the final screen, not a vanished card, not a generated document — only evidence.
        expect(evaluate([req({ requirement_id: "cis", status: "outstanding" })]).eligible).toBe(false);
    });

    it("is vacuously eligible only when the process configures nothing", () => {
        const result = evaluate([]);
        expect(result.eligible).toBe(true);
        expect(result.counts.total).toBe(0);
    });
});
