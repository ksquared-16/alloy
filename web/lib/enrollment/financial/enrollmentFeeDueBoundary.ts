/**
 * WHEN A FEE BECOMES DUE — and why that is a DERIVED fact rather than an event.
 *
 * The participant story the Director set is: finish the paperwork, then the fee becomes due, then
 * pay, then Enrollment progresses. So an operator merely LAUNCHING paperwork must not put money on
 * a family's account — a family that never starts owes nothing.
 *
 * ── WHY NOT AN EVENT ──
 *
 * The tempting shape is an event at the moment the last requirement is satisfied. Events are the
 * wrong instrument here: they fire once, from one code path, and every other path that could reach
 * the same state (a resume, a replay, an operator granting an exception, a Processing commit landing
 * late) then has to remember to fire it too. Miss one and a family is never billed; double one and,
 * without idempotency, they are billed twice.
 *
 * Dueness is instead a QUESTION that can be asked at any moment and always gives the same answer:
 * is every non-financial requirement resolved? Because the bridge that acts on it is idempotent,
 * asking at packet completion, at stage completion, or on an ordinary refresh all converge on the
 * same obligations. The trigger stops being a thing that can be missed.
 *
 * ── WHY THE FINANCIAL REQUIREMENT IS EXCLUDED FROM ITS OWN PRECONDITION ──
 *
 * A fee requirement that counted itself would never come due: it blocks, so not everything is
 * resolved, so it never becomes due, so it is never satisfied. The precondition is over the OTHER
 * requirements, which is also what "all prerequisite non-financial requirements" means literally.
 */

import type {
    EnrollmentCompletionSufficiency,
    EnrollmentRequirementSufficiency,
} from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";

/** Resolved means somebody can stop waiting: the evidence arrived, or a person excepted it. */
function resolved(requirement: EnrollmentRequirementSufficiency): boolean {
    return (
        requirement.disposition === "satisfied" ||
        requirement.disposition === "excepted" ||
        /*
         * `not_blocking` is a RECOMMENDED requirement nobody is waiting on. Counting it as
         * outstanding would hold a fee back forever on advisory guidance — the same reason the
         * readiness projection keeps recommended rows out of its fraction.
         */
        requirement.disposition === "not_blocking"
    );
}

/**
 * Is the fee due? True once every OTHER requirement is resolved.
 *
 * `financialRequirementIds` names the requirements that are themselves financial, so they cannot
 * gate their own dueness.
 */
export function enrollmentFeeIsDue(input: {
    readonly sufficiency: Pick<EnrollmentCompletionSufficiency, "requirements">;
    readonly financialRequirementIds: readonly string[];
}): boolean {
    const others = input.sufficiency.requirements.filter(
        (r) => !input.financialRequirementIds.includes(r.requirement_id),
    );
    /*
     * A stage with NO other requirements makes the fee due immediately, which is correct: there is
     * nothing left to finish. It is also why this returns true for an empty list rather than false.
     */
    return others.every(resolved);
}
