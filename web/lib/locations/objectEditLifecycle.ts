/**
 * Which canonical lifecycle operation an ordinary object edit means.
 *
 * Capacity and staffing ratio are authored the same way — a director changes
 * today's value on the object and presses Save — so they need the same answer
 * to one question: can today's change be expressed as a NEW VERSION of the rule
 * already in force, or must that rule be replaced?
 *
 * Both planners used to approximate this with `effective_start === today`, which
 * is only one of the two ways a version can be illegal. The other is an end
 * date: a rule that is still in force today but already CLOSES today cannot be
 * superseded from today, because `supersedeRow` refuses a new version whose
 * start is not strictly after the prior end. Infant A hit exactly that and the
 * operator was shown "New version effective_start must be after the prior
 * version start and any prior end date" while editing an ordinary ratio.
 *
 * So the question is asked of the canonical rule itself — the same predicate
 * `planSupersede` uses — rather than re-derived. One authority, two callers.
 */

import { isInvalidSupersedeStartDate } from "@/lib/childcareOperational/effectiveDating";

/** How an ordinary same-day edit must reach the canonical store. */
export type ObjectEditTransition = "version" | "replace_same_day";

/**
 * `version` when the canonical store will accept a supersede starting today;
 * `replace_same_day` when it will not, and the rule must be retired and
 * re-authored instead.
 *
 * Note what this deliberately does NOT do: decide whether anything changed, or
 * whether a rule exists at all. Those are the caller's questions.
 */
export function chooseObjectEditTransition(input: {
    priorStart: string;
    priorEnd: string | null | undefined;
    todayYmd: string;
}): ObjectEditTransition {
    return isInvalidSupersedeStartDate({
        priorStartDate: input.priorStart,
        priorEndDate: input.priorEnd ?? null,
        newStartDate: input.todayYmd,
    })
        ? "replace_same_day"
        : "version";
}
