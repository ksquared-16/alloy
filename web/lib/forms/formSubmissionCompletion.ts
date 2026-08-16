/**
 * THE canonical definition of a completed Form submission.
 *
 * ## Why this module exists
 *
 * The definition already existed — `form_submissions.status = 'submitted'`, constrained by
 * `chk_form_submissions_status` to exactly `draft | submitted | void`, with `submitted_at` stamped
 * and the payload frozen by trigger once it leaves `draft`. What did NOT exist was a NAME for it.
 * The comparison is written out longhand in roughly fifteen places, and one of them —
 * `buildPacketReviewRollupV1` — reads:
 *
 * ```ts
 *   if (item.status === "submitted" || submission_status === "submitted")
 * ```
 *
 * That `||` is correct for a review ROLLUP, whose job is to be generous about surfacing progress to
 * an operator. It is exactly wrong as a satisfaction authority: a packet step marked `submitted`
 * with no submission behind it would satisfy a Business Process requirement on the strength of step
 * bookkeeping alone.
 *
 * So this module does not invent a definition. It names the one that exists, so that D-96
 * requirement satisfaction can reuse it verbatim and cannot drift into the rollup's looser test.
 *
 * ## What is deliberately NOT completion
 *
 * `draft` — started, not finished. `void` — terminal, but the opposite of satisfied: a voided
 * submission is evidence that was withdrawn. Treating it as complete would let a requirement be
 * satisfied by a record the org explicitly retracted.
 *
 * Pure. No I/O, no clock.
 *
 * @see supabase/migrations/20260506100000_forms_engine_v1_foundation.sql — the CHECK and the freeze trigger
 */

/** The full vocabulary, as the database CHECK constraint declares it. */
export const FORM_SUBMISSION_STATUSES = ["draft", "submitted", "void"] as const;

export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

/** The single status that means "this submission is complete evidence". */
export const COMPLETED_FORM_SUBMISSION_STATUS = "submitted" as const;

export type FormSubmissionCompletionSubject = {
    readonly status?: string | null;
};

/**
 * Is this submission complete?
 *
 * Takes the row (or the bare status via {@link formSubmissionStatusIsComplete}) rather than a
 * boolean the caller computed, so the comparison itself lives here and nowhere else.
 *
 * A null/absent submission is NOT complete. That is the honest answer for a packet step a
 * participant has not started, and it is what keeps an unrealized requirement outstanding rather
 * than accidentally satisfied.
 */
export function formSubmissionIsComplete(
    submission: FormSubmissionCompletionSubject | null | undefined,
): boolean {
    return formSubmissionStatusIsComplete(submission?.status);
}

export function formSubmissionStatusIsComplete(status: string | null | undefined): boolean {
    return typeof status === "string" && status.trim() === COMPLETED_FORM_SUBMISSION_STATUS;
}
