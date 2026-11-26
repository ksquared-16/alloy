/**
 * Why a family case closed.
 *
 * `opportunities.close_reason_key` is a plain text column, and until now its vocabulary existed
 * only as a comment on that column in
 * `20260711000100_enrollment_status_collapse_and_stage_key.sql`:
 *
 *     'Reason recorded when status_key becomes closed (lost | withdrawn | not_a_fit | aged_out | other).'
 *
 * A comment cannot populate a picker, so an operator asked to record a close reason had nothing to
 * choose from and configuration had to type the key by hand. This is that comment, promoted to the
 * one place both the editor and any future validation can read.
 *
 * NOT a status. The case status stays `open | closed` and is owned by `status_definitions`; the
 * reason only explains a close that already happened. Adding a reason here never adds a status.
 */

export type CaseCloseReason = {
    /** Persisted in `opportunities.close_reason_key`. */
    key: string;
    /** What a director sees. */
    label: string;
};

export const CASE_CLOSE_REASONS: readonly CaseCloseReason[] = [
    { key: "lost", label: "Lost" },
    { key: "withdrawn", label: "Withdrawn" },
    { key: "not_a_fit", label: "Not a fit" },
    { key: "aged_out", label: "Aged out" },
    { key: "other", label: "Other" },
] as const;

/** The reason a Closed Lost outcome records, named once rather than spelled at each call site. */
export const CASE_CLOSE_REASON_LOST = "lost";

export function caseCloseReasonLabel(key: string | null | undefined): string {
    const trimmed = key?.trim();
    if (!trimmed) return "";
    return CASE_CLOSE_REASONS.find((reason) => reason.key === trimmed)?.label
        // An unrecognised key is tenant data, not an error — show it rather than hiding it.
        ?? trimmed.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isCanonicalCaseCloseReason(key: string | null | undefined): boolean {
    const trimmed = key?.trim();
    return Boolean(trimmed && CASE_CLOSE_REASONS.some((reason) => reason.key === trimmed));
}
