/**
 * "There is a grid here that nobody interpreted."
 *
 * A paper form's immunization record, medication schedule or pickup roster is a TABLE: a header row and
 * then rows of instances. Extraction carries no table structure at all, so the importer keeps such an
 * area as the section's static text and the form gets questions, not a grid. Both halves of that are
 * honest. What is not honest is silence: an operator scrolling past "Immunization Summary" has no way to
 * know Alloy saw a table there and could not represent it, and would reasonably assume it was handled.
 *
 * So this module does exactly one thing — notice that kept text reads like a grid — and says so on the
 * section. It does not read the grid, name its columns, count its rows, or create a single field or
 * mapping from it. Building real table interpretation is a later extraction capability; until then the
 * truthful output is a warning, and a warning is strictly better than a plausible table that is wrong.
 *
 * The detector is the one that shipped before the question-card presenter was retired, moved here
 * unchanged rather than re-tuned: its semantics were already reviewed, and a repair is the wrong moment
 * to quietly change what counts as a table.
 */

import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/** Shown verbatim to the operator. Says what Alloy did NOT do, so nothing reads as interpreted. */
export const TABLE_REVIEW_NOTICE =
    "Table needs review — Alloy kept this grid as text rather than guessing its columns.";

/**
 * Does the kept text read as a grid rather than a paragraph?
 *
 * Two or more lines that each split into three or more cells on a pipe, a tab, or a run of three spaces
 * is what a table looks like once its formatting is gone. Both thresholds matter: a single delimited
 * line is a heading or a signature rule ("Name | Date | Signature"), and two cells is ordinary prose
 * with an em-dash's worth of spacing in it.
 */
export function looksTabular(text: string): boolean {
    const rows = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => line.split(/\s*\|\s*|\t+|\s{3,}/).filter(Boolean).length >= 3);
    return rows.length >= 2;
}

/**
 * The sections to warn on, keyed by section id.
 *
 * Draft section ids survive `draftFormToFormSchemaV1` unchanged, so this map keys directly onto the
 * sections the Studio canvas renders — no second identity to keep in step.
 */
export function tableReviewNoticesFor(
    draft: Pick<StoredFormDraftPreview, "sections">,
): ReadonlyMap<string, string> {
    const notices = new Map<string, string>();
    for (const section of draft.sections ?? []) {
        const kept = (section.static_text ?? "").trim();
        if (kept && looksTabular(kept)) notices.set(section.id, TABLE_REVIEW_NOTICE);
    }
    return notices;
}
