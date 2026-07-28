/**
 * POS-FP15 — native-layout question detector.
 *
 * Consumes positional LINES (per page, with x / baseline-y / font-height) instead of a flat
 * string, so it reasons about the structural signals a Word-generated PDF actually exposes:
 *
 *   • font-height tiers      → document title vs section heading vs body/label
 *   • left-margin alignment  → headings & labels share a margin; options are indented
 *   • per-line geometry      → an instruction sentence and the next label are DIFFERENT lines,
 *                              so a label never bleeds across a sentence boundary
 *   • repeated top-of-page lines → running header/footer, dropped (the bleed source)
 *   • content signals        → "(check one)" choice groups, "Y / N" questions, "if yes explain",
 *                              signature blocks, consent/legal prose, "(Classroom Copy)" duplicates
 *
 * Pure + deterministic. Never fabricates: no positional lines → empty candidate. Output is the
 * same `DocumentStructureCandidate` the flat detector produces (so the existing draft builder is
 * unchanged), enriched with per-section disposition / static_text / duplicate flags.
 */

import type { SectionDisposition } from "../formDraft/sectionDisposition";
import type { LayoutDocument, LayoutLine, LayoutPage } from "./pdfLayoutTypes";
import type {
    DocumentStructureCandidate,
    DocumentStructureField,
    DocumentStructureSection,
    StructureFieldType,
} from "./types";

export const LAYOUT_STRUCTURE_GENERATOR_VERSION = "fp15.0";

const BLANK_RE = /_{2,}/; // an answer blank (underline region)
const BLANK_ONLY_RE = /^[\s_.]+$/; // a continuation line (answer overflow), no label
const YESNO_RE = /\b(?:Y\s*\/\s*N|yes\s*\/\s*no)\b/i;
const CHOICE_HEADING_RE = /\((?:check|select|choose)\s+(?:one|all)[^)]*\)\s*:?\s*$/i;
const OPTION_GLYPH_RE = /^\s*([Oo0○☐□▢●•‣∙·◦*])\s+(\S.*)$/;
const SIGNATURE_HEADING_RE = /\bsignatures?\b/i;
const EXPLAIN_RE = /\bif\s+(?:yes|no)\b[^:]*\bexplain\b\s*:?/i;
const DUPLICATE_MARKER_RE = /\((?:classroom|office|teacher|file|duplicate)\s+copy\)|\bfor\s+office\s+use\b/i;

/** Median of a numeric array. */
function median(xs: number[]): number {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mode (most common) of a numeric array, rounded to the nearest integer. */
function modeInt(xs: number[]): number {
    const counts = new Map<number, number>();
    for (const x of xs) {
        const k = Math.round(x);
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let best = 0;
    let bestC = -1;
    for (const [k, c] of counts) if (c > bestC) ((bestC = c), (best = k));
    return best;
}

/** Normalize a heading/label for cross-page duplicate comparison. */
function normText(s: string): string {
    return s
        .toLowerCase()
        .replace(/\(.*?\)/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function cleanLabel(raw: string): string {
    return raw
        .replace(BLANK_RE, " ")
        .replace(/\s*:\s*$/, "")
        .replace(/^[\s:.\-–—]+/, "")
        .replace(/[\s.\-–—]+$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function suggestType(label: string): StructureFieldType {
    const l = label.toLowerCase();
    if (/\b(date|birth|dob|d\.o\.b)\b/.test(l)) return "date";
    if (/\bsignature\b/.test(l)) return "signature";
    return "text";
}

/** Split a field line into individual label:blank units. Geometry guarantees no cross-line bleed. */
function splitFieldLine(text: string): string[] {
    const labels: string[] = [];
    // Each blank is preceded by its label. Walk blanks; the label is the text since the last blank.
    const re = /_{2,}/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = re.exec(text)) !== null) {
        found = true;
        const seg = text.slice(lastIdx, m.index);
        const label = cleanLabel(seg);
        if (label && /[A-Za-z]/.test(label)) labels.push(label);
        lastIdx = m.index + m[0].length;
    }
    if (!found) {
        // Colon-terminated label whose blank is on the next visual line ("… conditions:").
        const label = cleanLabel(text);
        if (/:$/.test(text.trim()) && label && /[A-Za-z]/.test(label)) labels.push(label);
    } else {
        // A trailing colon label after the last blank (rare) — keep if it ends with ':'.
        const tail = text.slice(lastIdx).trim();
        if (/:$/.test(tail)) {
            const label = cleanLabel(tail);
            if (label && /[A-Za-z]/.test(label)) labels.push(label);
        }
    }
    return labels;
}

type SectionAcc = {
    title: string;
    page: number;
    fields: DocumentStructureField[];
    disposition?: SectionDisposition;
    staticLines: string[];
    duplicate: boolean;
    kind: "fields" | "choice" | "signature" | "static";
};

/**
 * Detect structure from positional lines. `bodyFh` and `leftMargin` are derived from the
 * document itself so the thresholds are relative, not tuned to one file.
 */
export function detectLayoutStructure(doc: LayoutDocument | null): DocumentStructureCandidate {
    const warnings: string[] = [];
    if (!doc || !doc.ok || doc.pages.length === 0) {
        return { sections: [], warnings: doc?.reason ? [doc.reason] : [] };
    }

    const allLines = doc.pages.flatMap((p) => p.lines);
    if (allLines.length === 0) return { sections: [], warnings: [] };

    // --- document-relative metrics -------------------------------------------------
    const bodyFh = median(allLines.map((l) => l.fhMax)) || 12;
    const headingFh = bodyFh + 0.8;
    const labelLines = allLines.filter((l) => BLANK_RE.test(l.text) || /:/.test(l.text));
    const leftMargin = modeInt((labelLines.length ? labelLines : allLines).map((l) => l.xStart));

    // --- running header/footer detection (repeated lines near the top across pages) ---
    const topBandCounts = new Map<string, number>();
    for (const p of doc.pages) {
        const top = p.lines.filter((l) => l.y > p.height - 90);
        for (const l of top) {
            const k = normText(l.text);
            if (k) topBandCounts.set(k, (topBandCounts.get(k) ?? 0) + 1);
        }
    }
    const headerNoise = new Set(
        [...topBandCounts.entries()].filter(([, c]) => c >= 2).map(([k]) => k)
    );

    const isHeaderNoise = (l: LayoutLine, page: LayoutPage): boolean =>
        l.y > page.height - 90 && headerNoise.has(normText(l.text));

    // --- per-page section title index (for cross-page duplicate detection) ---
    const pageHeadings: Map<number, Set<string>> = new Map();

    const sections: SectionAcc[] = [];
    // Holder object (not a bare `let`) so the current section reads as `SectionAcc | null` at every
    // use site — a bare closure-mutated local gets narrowed to `never` by control-flow analysis.
    const state: { cur: SectionAcc | null } = { cur: null };
    const pushSection = (title: string, page: number, kind: SectionAcc["kind"]): SectionAcc => {
        const acc: SectionAcc = { title, page, fields: [], staticLines: [], duplicate: false, kind };
        sections.push(acc);
        state.cur = acc;
        return acc;
    };
    const ensureSection = (page: number): SectionAcc => state.cur ?? pushSection("Form questions", page, "fields");

    const isSectionHeading = (l: LayoutLine): boolean => {
        const t = l.text.trim();
        if (!t || BLANK_RE.test(t) || YESNO_RE.test(t)) return false;
        if (t.length > 80) return false;
        const nearMargin = Math.abs(l.xStart - leftMargin) <= 10;
        const big = l.fhMax >= headingFh;
        // A heading is a bigger-font, left-margin line with no answer blank. A trailing colon
        // ("Parent/Guardian Signatures:") is still a heading when it has no blank after it.
        return big && nearMargin && !/^\W/.test(t);
    };

    for (const page of doc.pages) {
        // Section context does not leak across a page break — a blank-bearing line at the top of a
        // new page (e.g. page 4's "Date of Enrollment") must not be absorbed by the previous page's
        // signature block. Each page's content re-establishes its own section from its own headings.
        state.cur = null;
        const headingsThisPage = new Set<string>();
        pageHeadings.set(page.page, headingsThisPage);
        // Does this page look like an output/duplicate copy? (explicit marker on any heading)
        const pageIsDuplicate = page.lines.some(
            (l) => DUPLICATE_MARKER_RE.test(l.text) && (l.fhMax >= headingFh || /copy\)/i.test(l.text))
        );

        for (let i = 0; i < page.lines.length; i++) {
            const l = page.lines[i];
            const t = l.text.trim();
            if (!t) continue;
            if (isHeaderNoise(l, page)) continue;
            if (BLANK_ONLY_RE.test(t)) continue; // continuation / answer overflow — not a field

            // --- choice group heading: "... (check one)" ---
            if (CHOICE_HEADING_RE.test(t)) {
                const title = t.replace(CHOICE_HEADING_RE, "").replace(/[:\s]+$/, "").trim();
                // Collect following indented option lines.
                const options: string[] = [];
                let hasOther = false;
                let j = i + 1;
                for (; j < page.lines.length; j++) {
                    const ol = page.lines[j];
                    const om = OPTION_GLYPH_RE.exec(ol.text);
                    const indented = ol.xStart > leftMargin + 8;
                    if (om && indented) {
                        const optText = cleanLabel(om[2]).replace(/\s*[–-]\s*.*$/, (mm) => mm); // keep addr detail
                        const label = om[2].replace(BLANK_RE, "").replace(/\s{2,}/g, " ").trim();
                        if (/other/i.test(label)) hasOther = true;
                        options.push(label);
                        void optText;
                    } else {
                        break;
                    }
                }
                i = j - 1;
                const sec = ensureSection(page.page);
                sec.fields.push({
                    label: cleanLabel(title) || "Choose one",
                    suggested_type: "select",
                    required: false,
                    confidence: "medium",
                    evidence: `Single choice (check one)${options.length ? ` — options: ${options.join(" | ")}` : ""}${hasOther ? "" : ""}`,
                    page: page.page,
                    options,
                });
                continue;
            }

            // --- section heading ---
            if (isSectionHeading(l)) {
                const dup = pageIsDuplicate || DUPLICATE_MARKER_RE.test(t);
                const kind: SectionAcc["kind"] = SIGNATURE_HEADING_RE.test(t) ? "signature" : "fields";
                const title = t.replace(/\s*:\s*$/, "");
                const sec = pushSection(title, page.page, kind);
                sec.duplicate = dup;
                if (kind === "signature") sec.disposition = "signature";
                headingsThisPage.add(normText(title));
                continue;
            }

            // --- yes/no question (optionally with a conditional explanation) ---
            if (YESNO_RE.test(t)) {
                const sec = ensureSection(page.page);
                const q = cleanLabel(t.split(YESNO_RE)[0]).replace(/[?:]+$/, "").trim();
                if (q && /[A-Za-z]/.test(q)) {
                    sec.fields.push({
                        label: q,
                        suggested_type: "checkbox",
                        required: false,
                        confidence: "medium",
                        evidence: "Yes / No question",
                        page: page.page,
                    });
                    if (EXPLAIN_RE.test(t)) {
                        sec.fields.push({
                            label: `${q} — if yes, please explain`,
                            suggested_type: "text",
                            required: false,
                            confidence: "medium",
                            evidence: "Conditional explanation",
                            page: page.page,
                        });
                    }
                }
                continue;
            }

            // --- signature line inside a signature section ---
            const curSig: SectionAcc | null = state.cur;
            if (curSig && curSig.kind === "signature" && BLANK_RE.test(t)) {
                const sec = curSig;
                if (/print\s+name/i.test(t)) {
                    sec.fields.push({ label: "Print Name", suggested_type: "text", required: false, confidence: "high", evidence: "Signature block", page: page.page });
                } else {
                    sec.fields.push({ label: sec.title.replace(/s:?$/i, "").replace(/\bSignatures?\b/i, "Signature").trim() || "Signature", suggested_type: "signature", required: true, confidence: "high", evidence: "Signature line", page: page.page });
                    if (/\bdate\b/i.test(t)) {
                        sec.fields.push({ label: "Date", suggested_type: "date", required: false, confidence: "high", evidence: "Signature date", page: page.page });
                    }
                }
                continue;
            }

            // --- field line (one or more label:blank units) ---
            // Real form labels are capitalized; a lowercase-initial "label" is a prose sentence
            // fragment sitting in front of an inline blank (e.g. "…surgical care for my child, ___")
            // — never a field. Filtering on the initial character kills that bleed generally.
            if (BLANK_RE.test(t) || /:$/.test(t)) {
                const labels = splitFieldLine(t).filter((lbl) => /^[A-Z0-9]/.test(lbl));
                if (labels.length > 0) {
                    const sec = ensureSection(page.page);
                    for (const label of labels) {
                        sec.fields.push({
                            label,
                            suggested_type: suggestType(label),
                            required: false,
                            confidence: "high",
                            evidence: "Labelled field",
                            page: page.page,
                        });
                    }
                    continue;
                }
            }

            // --- prose (static / legal / instruction) ---
            // A body-size sentence with no field label — keep as the current section's static text.
            // Inline blanks inside prose (the legal paragraph's child-name line) are stripped, not
            // promoted to fields, so the emergency-authorization paragraph is preserved as legal text.
            const proseLike = /[a-z]/.test(t) && t.split(/\s+/).length >= 4 && (/^[a-z]/.test(t) || /[.]$/.test(t) || !BLANK_RE.test(t));
            const curProse: SectionAcc | null = state.cur;
            if (curProse && proseLike) {
                curProse.staticLines.push(t.replace(BLANK_RE, " ").replace(/\s{2,}/g, " ").trim());
                continue;
            }
        }
    }

    // --- cross-page duplicate detection (a page whose headings echo an earlier page) ---
    const seenHeadings = new Set<string>();
    for (const [, titles] of pageHeadings) {
        let overlap = 0;
        for (const t of titles) if (seenHeadings.has(t)) overlap++;
        const echoes = titles.size >= 2 && overlap >= Math.ceil(titles.size / 2);
        if (echoes) for (const s of sections) if (s.page === [...pageHeadings.keys()].find((k) => pageHeadings.get(k) === titles)) s.duplicate = true;
        for (const t of titles) seenHeadings.add(t);
    }

    // --- finalize sections: dispositions, static text, duplicate handling ---
    const out: DocumentStructureSection[] = [];
    for (const s of sections) {
        const staticText = s.staticLines.length ? s.staticLines.join(" ").replace(/\s{2,}/g, " ").trim() : null;
        let disposition: SectionDisposition | undefined = s.disposition;
        // Consent / legal prose with little/no input → acknowledgement (preserve the paragraph).
        if (!disposition && staticText && /\b(hereby|permission|consent|i\/we|authorize|understood)\b/i.test(staticText) && s.fields.length <= 1) {
            disposition = "acknowledgement";
        }
        // Output/duplicate copy → read-only reference; its fields are not a new set of questions.
        if (s.duplicate) {
            disposition = "static_reference";
        }
        const fields = s.fields.map((f) => ({
            ...f,
            required: s.duplicate ? false : f.required,
            confidence: s.duplicate ? ("low" as const) : f.confidence,
            evidence: s.duplicate ? `Output/classroom copy of information collected earlier (page ${s.page})` : f.evidence,
        }));
        // Skip a wholly-empty non-static section.
        if (fields.length === 0 && !staticText) continue;
        // A duplicate/output-copy page reuses page-1 headings verbatim ("Parent or Guardian #1", …).
        // Give those a distinct "(Classroom Copy)" title so the read-only disposition of the copy never
        // bleeds onto the real page-1 section of the same name (the review UI groups sections by title).
        const title = s.duplicate && !/\bcopy\b/i.test(s.title) ? `${s.title} (Classroom Copy)` : s.title;
        out.push({
            title,
            confidence: "high",
            fields,
            ...(disposition ? { disposition } : {}),
            ...(staticText ? { static_text: staticText } : {}),
            page: s.page,
            ...(s.duplicate ? { duplicate: true } : {}),
        });
    }

    const totalFields = out.reduce((n, s) => n + s.fields.length, 0);
    if (totalFields === 0) warnings.push("No labelled fields were detected in the document layout.");
    if (out.some((s) => s.duplicate)) warnings.push("A later page looks like an output/classroom copy of earlier information — it was marked read-only, not a new set of questions.");

    return { sections: out, warnings };
}
