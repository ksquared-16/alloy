/**
 * What a document is FOR: collecting answers, or being read.
 *
 * The School of Enrichment Family Handbook has 23 pages, 853 lines and not one place to write. The
 * layout detector still proposed eight fields from it — "All students please bring", "Other health
 * considerations" — because those lines end in a colon, and a colon is normally a prompt. In a
 * document that contains no blank anywhere, a colon never introduces a blank. It introduces a list.
 *
 * That is a distinction of source INTENT, and it is decided at document scope rather than line by
 * line, because a single line cannot tell you which kind of document it is in. A reference document
 * still yields everything that makes it useful — sections, policy prose, acknowledgements, evidence
 * obligations. It just stops yielding editable participant fields it never had.
 *
 * Evidence, all of it structural:
 *   • a blank to write on   — an underscore run
 *   • a box to tick         — a checkbox glyph
 *   • a choice to circle    — a Yes / No pair
 *   • prose dominance       — mean words per line, which separates a policy page from a form page
 *
 * Deliberately conservative: any one affordance makes a document fillable. It takes the complete
 * absence of all three, in a multi-page prose-dominant document, to call it reference — so a form
 * whose blanks are drawn as table rules is never silently emptied.
 *
 * Pure + deterministic, and never silent: the verdict and its signals travel in the candidate's
 * warnings.
 */

import type { LayoutDocument } from "./pdfLayoutTypes";

export type DocumentFillIntent = "fillable" | "reference";

export interface FillIntentVerdict {
    intent: DocumentFillIntent;
    /** Deterministic reasons, surfaced to the operator rather than applied silently. */
    signals: string[];
    evidence: {
        pages: number;
        lines: number;
        underscore_runs: number;
        checkbox_glyphs: number;
        yes_no_pairs: number;
        mean_words_per_line: number;
    };
}

const UNDERSCORE_RUN = /_{3,}/;
const CHECKBOX_GLYPH = /[☐☑☒■□○●✓✔]/;
const YES_NO_PAIR = /\byes\b[^a-z]{0,8}\bno\b/i;

/** Below this many words per line a document reads as a form, not as prose. */
const PROSE_WORDS_PER_LINE = 10;
/** A single page with no affordances is far more likely a form we misread than a reference document. */
const MIN_REFERENCE_PAGES = 2;

export function classifyDocumentFillIntent(doc: LayoutDocument | null): FillIntentVerdict {
    const lines = (doc?.pages ?? []).flatMap((p) => p.lines).map((l) => l.text.trim()).filter(Boolean);
    const underscore = lines.filter((l) => UNDERSCORE_RUN.test(l)).length;
    const checkbox = lines.filter((l) => CHECKBOX_GLYPH.test(l)).length;
    const yesNo = lines.filter((l) => YES_NO_PAIR.test(l)).length;
    const words = lines.reduce((n, l) => n + l.split(/\s+/).filter(Boolean).length, 0);
    const meanWords = lines.length > 0 ? words / lines.length : 0;
    const pages = doc?.pageCount ?? 0;

    const evidence = {
        pages,
        lines: lines.length,
        underscore_runs: underscore,
        checkbox_glyphs: checkbox,
        yes_no_pairs: yesNo,
        mean_words_per_line: Number(meanWords.toFixed(2)),
    };

    const affordances: string[] = [];
    if (underscore > 0) affordances.push(`${underscore} line(s) with a blank to write on`);
    if (checkbox > 0) affordances.push(`${checkbox} line(s) with a box to tick`);
    if (yesNo > 0) affordances.push(`${yesNo} Yes / No choice line(s)`);

    if (affordances.length > 0) {
        return { intent: "fillable", signals: affordances, evidence };
    }
    if (lines.length === 0) {
        return { intent: "fillable", signals: ["no text read — nothing to judge intent by"], evidence };
    }
    if (pages < MIN_REFERENCE_PAGES) {
        return { intent: "fillable", signals: [`only ${pages} page(s) — too little to call it a reference document`], evidence };
    }
    if (meanWords < PROSE_WORDS_PER_LINE) {
        return {
            intent: "fillable",
            signals: [`${meanWords.toFixed(1)} words per line — reads as a form, not as prose`],
            evidence,
        };
    }

    return {
        intent: "reference",
        signals: [
            `${pages} pages with no blank, no checkbox and no Yes / No anywhere`,
            `${meanWords.toFixed(1)} words per line — continuous prose`,
            "colons in this document introduce lists, not blanks",
        ],
        evidence,
    };
}
