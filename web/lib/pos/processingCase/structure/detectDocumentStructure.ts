/**
 * POS-FP11 — deterministic document structure detection from PLAIN TEXT.
 *
 * Pure + deterministic. NO OCR, NO LLM. Government / medical / childcare forms are
 * layout-driven (multiple fields per line, checkboxes, Yes/No groups, underlined
 * blanks, signature areas) — not simple "Label:" prompts. This detects those patterns
 * line-by-line and proposes section + field candidates. Honest: no text → zero fields;
 * every field carries a real label lifted from the text — never fabricated.
 *
 * fp11.2 — real PDF text extraction (unpdf, text-only) STRIPS the visual markers these
 * forms rely on: the colon, the underscore blank, and the checkbox glyph are all drawn
 * widgets, not characters. So an AcroForm like the MO500 extracts as BARE label lines
 * ("Name of Child", "Date of Birth") and multi-column label rows separated by wide
 * whitespace gaps. fp11.2 adds marker-LESS detection: a field-label lexicon, multi-
 * column whitespace splitting, mixed-case section headers, and a generic low-confidence
 * bare-label net — plus diagnostics that explain why a document did/didn't yield fields.
 */

import type {
    DocumentStructureCandidate,
    DocumentStructureField,
    DocumentStructureSection,
    RejectedLabelExample,
    StructureDiagnostics,
    StructureFieldType,
    StructureQuality,
} from "./types";

export const STRUCTURE_GENERATOR_VERSION = "fp11.3";

/**
 * Department / agency / title noise — these are NEVER fields (and never signatures).
 * Real PDF extraction often yields the masthead as a long run of text; a long line that
 * merely CONTAINS "signature" must not become a signature field labelled with the header.
 */
const HEADER_NOISE_RE =
    /\b(department|office of|division|bureau|ministry|agency|commission|compliance|elementary|secondary education|state of|county of|dese|dhss|page \d|form \d|rev\.?\s*\d|omb|see instructions|for office use|do not write)\b/i;

/**
 * Known gov / childcare / health labels. Used as a SWEEP over the raw text so we still
 * recover fields when extraction is a near-newline-less blob (the real MO500 case). Only
 * phrases literally present in the text are emitted — never fabricated.
 */
interface KnownLabel {
    re: RegExp;
    canonical: string;
    type: StructureFieldType;
    section?: boolean;
}
const KNOWN_LABELS: KnownLabel[] = [
    // sections
    { re: /identifying information/i, canonical: "Identifying Information", type: "text", section: true },
    { re: /health (history|information)/i, canonical: "Health History", type: "text", section: true },
    { re: /physical examination/i, canonical: "Physical Examination", type: "text", section: true },
    { re: /emergency (information|contact)/i, canonical: "Emergency Information", type: "text", section: true },
    // fields
    { re: /(child'?s?\s+name|name of child)/i, canonical: "Child's Name", type: "text" },
    { re: /\b(birth\s?date|date of birth|d\.?o\.?b\.?)\b/i, canonical: "Birthdate", type: "date" },
    { re: /\bsex\b/i, canonical: "Sex", type: "select" },
    { re: /health statement/i, canonical: "Health Statement", type: "text" },
    {
        re: /special health (or|and) medical requirements/i,
        canonical: "Special Health or Medical Requirements",
        type: "text",
    },
    { re: /(allergies|allergy)/i, canonical: "Allergies", type: "text" },
    { re: /(medications?|medicine)/i, canonical: "Medications", type: "text" },
    {
        re: /(parent\/?\s?guardian|parent or guardian)\s+signature/i,
        canonical: "Parent/Guardian Signature",
        type: "signature",
    },
    {
        re: /(physician|provider|health\s*care\s*provider)\s+signature/i,
        canonical: "Physician Signature",
        type: "signature",
    },
    { re: /\bdate\b/i, canonical: "Date", type: "date" },
];

/** True when a label/line is masthead/agency noise rather than a real field. */
function isHeaderNoise(s: string): boolean {
    return HEADER_NOISE_RE.test(s);
}

const PLACEHOLDER_RE = /^[\s_xX.,/\\[\]()·•–—-]*$/;
const CHECKBOX_MARK = /(\[\s?[xX]?\s?\]|☐|□|■|✓|✔|◯|○|\(\s?[xX]?\s?\))/;
const CHECKBOX_OPTION_RE = /(\[\s?[xX]?\s?\]|☐|□|■|✓|✔|◯|○|\(\s?[xX]?\s?\))\s*([A-Za-z][A-Za-z0-9 .,'\-/()]{0,28})/g;
const COLON_LABEL_RE = /([A-Za-z][A-Za-z0-9 .,'\-/()]{1,38}?)\s*:\s*/g;
const FILL_RE = /([A-Za-z][A-Za-z0-9 .,'\-/()]{1,38}?)\s+_{3,}/g;

/**
 * Field-label lexicon for marker-less text (childcare / medical / state gov forms).
 * A line/cell that IS one of these short phrases becomes a field even without a colon
 * or underscore. Specific phrases only — never bare words that also occur in prose.
 */
const FIELD_LABEL_LEXICON: RegExp[] = [
    /\b(full|first|last|middle|legal|preferred|child(?:'s)?|student|parent|guardian|mother|father|patient|provider|physician|doctor|nurse|examiner|contact)\s+name\b/i,
    /\bname\s+of\s+(child|student|parent|guardian|physician|provider|doctor|school|facility)\b/i,
    /\bdate\s+of\s+birth\b/i,
    /\b(d\.?o\.?b\.?|birth\s*date|birthdate)\b/i,
    /\b(sex|gender|race|ethnicity|grade|age)\b/i,
    /\b(home|cell|work|mobile|day(?:time)?|primary)?\s*(phone|telephone)\s*(number|no\.?)?\b/i,
    /\b(e-?mail)\s*(address)?\b/i,
    /\b(mailing|home|street|physical)?\s*address\b/i,
    /\b(city|state|zip(?:\s*code)?|county|country|apt|unit)\b/i,
    /\b(relationship(?:\s+to\s+\w+)?)\b/i,
    /\b(emergency\s+contact)\b/i,
    /\b(school|teacher|classroom|room\s*number)\b/i,
    /\b(insurance|policy\s*(number|no\.?)|member\s*id|medicaid|medicare|group\s*number)\b/i,
    /\b(allergy|allergies|medication(s)?|medical\s+conditions?|diagnos(is|es)|health\s+conditions?|chronic\s+conditions?)\b/i,
    /\b(height|weight|bmi|blood\s*pressure|pulse|temperature|vision|hearing|head\s+circumference)\b/i,
    /\b(immuniz\w*|vaccine|vaccination|date\s+administered|booster|dose)\b/i,
    /\b(physician|provider|doctor|clinic|practice|facility)\s+(name|phone|address|signature)?\b/i,
    /\b(signature|signed|date\s+signed|witness)\b/i,
    /\b(physical\s+exam(?:ination)?\s+date|exam\s+date|date\s+of\s+exam(?:ination)?|next\s+appointment|due\s+date|expiration\s+date|effective\s+date|start\s+date|end\s+date)\b/i,
    /\b(comments?|remarks?|notes?)\b/i,
];

/** Words that mark a line as a document TITLE / instruction, not a field. */
const TITLE_WORD_RE = /\b(report|form|application|record|certificate|agreement|notice|worksheet|questionnaire|instructions?|department|page|please|complete|return|section\s+\d)\b/i;

/** Mixed-case section headers (e.g. "Child Information", "Health History", "Physical Examination"). */
// Note: immunization/allergies/medications are intentionally NOT section keywords —
// on these forms they are usually write-in FIELDS, so we keep them consistent as fields.
const SECTION_KEYWORD_RE = /\b(information|history|contact|examination|screening|assessment|eligibility|certification|authorization|enrollment|registration|emergency|household|demographics?|insurance|consent|background|references|employment|education|examiner\s+use|office\s+use|to\s+be\s+completed)\b/i;

/** A blanks-only rule line (an underline a value would be written on). */
function isBlankRule(line: string): boolean {
    return /^[_·•–—.\s]{4,}$/.test(line.trim());
}

/** A section heading: ALL CAPS, "Section N", numbered caps, or "Label:" with nothing after. */
function isHeadingLine(line: string): boolean {
    const t = line.trim();
    if (!t || t.length > 60) return false;
    if (CHECKBOX_MARK.test(t)) return false;
    if (/^section\b/i.test(t)) return true;
    if (/^\d+[.)]\s+[A-Z]/.test(t) && t.toUpperCase() === t) return true; // "1. CHILD INFORMATION"
    if (/^[A-Z0-9][A-Z0-9 \-/&]{2,}$/.test(t) && /[A-Z]/.test(t) && !/_{3,}/.test(t)) return true; // ALL CAPS
    if (/^[A-Za-z][A-Za-z \-/&]{2,}:\s*$/.test(t)) return true; // "Family Information:" (nothing after)
    return false;
}

/** A short title-like line (for the label-above-a-blank-line pattern). */
function looksLikeLabel(line: string): boolean {
    const t = line.trim();
    if (!t || t.length > 50) return false;
    if (/[.!?]$/.test(t)) return false;
    if (CHECKBOX_MARK.test(t)) return false;
    const words = t.split(/\s+/);
    return words.length <= 6 && /^[A-Za-z]/.test(t);
}

/** Whole line matches a known field-label phrase and is short enough to BE that label. */
function matchesFieldLexicon(line: string): boolean {
    const t = line.trim();
    if (t.length > 48) return false;
    if (t.split(/\s+/).length > 7) return false;
    return FIELD_LABEL_LEXICON.some((re) => re.test(t));
}

/** Mixed-case section header — short, a section-ish keyword, and NOT itself a field label. */
function isMixedCaseSectionHeader(line: string): boolean {
    const t = line.trim();
    if (!t || t.length > 42) return false;
    if (CHECKBOX_MARK.test(t) || /[_:]/.test(t)) return false;
    if (/[.!?]$/.test(t)) return false;
    if (t.split(/\s+/).length > 4) return false;
    if (matchesFieldLexicon(t)) return false; // "Contact Name" is a field, not a section
    return SECTION_KEYWORD_RE.test(t);
}

/** A generic bare label: short noun phrase, not prose, not a title/instruction. Low confidence. */
function looksLikeBareLabel(line: string): boolean {
    const t = line.trim();
    if (!t || t.length < 2 || t.length > 40) return false;
    if (/[.!?]$/.test(t)) return false; // sentence
    if (CHECKBOX_MARK.test(t)) return false;
    if (TITLE_WORD_RE.test(t)) return false; // document title / instruction
    if (!/^[A-Za-z]/.test(t)) return false;
    const words = t.split(/\s+/);
    if (words.length > 5) return false;
    const letters = (t.match(/[A-Za-z]/g) ?? []).length;
    if (letters < t.length * 0.55) return false; // mostly letters, not codes
    return true;
}

function suggestType(label: string): StructureFieldType {
    const l = label.toLowerCase();
    if (/\bsignature|sign here|signed\b/.test(l)) return "signature";
    if (/\b(date|dob|date of birth|expiration|start date|end date|d\.o\.b|administered|birth)\b/.test(l)) return "date";
    if (/\b(amount|total|fee|payment|cost|price|balance)\b/.test(l) || /\$/.test(l)) return "number";
    if (/\b(age|height|weight|grade|pulse|temperature|bmi|dose)\b/.test(l)) return "number";
    if (/\b(upload|attach|attachment|copy of)\b/.test(l)) return "file";
    if (/\b(check|checkbox|agree|consent|i certify|yes\/no|y\/n)\b/.test(l)) return "checkbox";
    if (/\b(select|choose|circle one|gender|sex|state|program|relationship)\b/.test(l)) return "select";
    return "text";
}

function isRequired(line: string): boolean {
    return /\*|\brequired\b/i.test(line);
}

/** "First Name: ___  Last Name: ___" → multiple labels. Prose ("Note: long sentence") is skipped. */
function extractColonFields(line: string): string[] {
    const marks: { label: string; valStart: number; start: number }[] = [];
    let m: RegExpExecArray | null;
    COLON_LABEL_RE.lastIndex = 0;
    while ((m = COLON_LABEL_RE.exec(line))) {
        marks.push({ label: m[1].trim(), valStart: COLON_LABEL_RE.lastIndex, start: m.index });
    }
    const out: string[] = [];
    for (let i = 0; i < marks.length; i++) {
        const valEnd = i + 1 < marks.length ? marks[i + 1].start : line.length;
        const value = line.slice(marks[i].valStart, valEnd).trim();
        const isPlaceholder = value === "" || PLACEHOLDER_RE.test(value);
        const isShortValue = value.length <= 25 && !/[.!?]\s/.test(value) && value.split(/\s+/).length <= 3;
        if (isPlaceholder || marks.length > 1 || isShortValue) out.push(marks[i].label);
    }
    return out;
}

/** "Mother ______ Father ______" → ["Mother","Father"]. */
function extractFillFields(line: string): string[] {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    FILL_RE.lastIndex = 0;
    while ((m = FILL_RE.exec(line))) out.push(m[1].trim());
    return out;
}

/**
 * Multi-column label row: wide whitespace gaps separate label cells, e.g.
 * "Name of Child        Date of Birth        Sex". unpdf preserves these gaps, so the
 * gap itself is the layout signal. Returns the label-like cells (≥2 required).
 */
function extractLabelColumns(line: string): string[] {
    const cells = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) return [];
    const kept = cells.filter((c) => c.length >= 2 && c.length <= 40 && (matchesFieldLexicon(c) || looksLikeBareLabel(c)));
    return kept.length >= 2 ? kept : [];
}

/** Checkbox option labels on a line: "☐ Yes ☐ No", "[ ] Measles [ ] Mumps". */
function extractCheckboxOptions(line: string): string[] {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    CHECKBOX_OPTION_RE.lastIndex = 0;
    while ((m = CHECKBOX_OPTION_RE.exec(line))) {
        const lbl = m[2].trim();
        if (lbl) out.push(lbl);
    }
    return out;
}

function isYesNoPair(opts: string[]): boolean {
    if (opts.length !== 2) return false;
    const lower = opts.map((o) => o.toLowerCase());
    return lower.includes("yes") && lower.includes("no");
}

/** "Immunizations up to date? Yes No" → "Immunizations up to date". */
function extractYesNoQuestion(line: string): string | null {
    const m = line.match(/^(.{3,80}?)\s+(yes\s*[/ ]\s*no|no\s*[/ ]\s*yes|y\s*\/\s*n)\b/i);
    if (m) return m[1].replace(/\?\s*$/, "").trim();
    return null;
}

function extractSignature(line: string): string | null {
    const t = line.trim();
    if (/\bsignature\b/i.test(t)) {
        // Only when the line is short enough to BE a signature label — never a long header
        // that merely contains the word "signature" (e.g. a department masthead).
        if (t.length > 48 || isHeaderNoise(t)) return null;
        const cleaned = t.replace(/[_:.]+/g, " ").replace(/\s+/g, " ").trim();
        const m = cleaned.match(/^(.*?\bsignature)\b/i); // keep up to "signature" inclusive
        const label = (m ? m[1] : cleaned).trim();
        return label.slice(0, 40) || "Signature";
    }
    if (/^x[_\s]{3,}/i.test(t)) return "Signature";
    if (/\bsign here\b/i.test(t)) return "Signature";
    return null;
}

/**
 * Sweep the raw text for KNOWN labels — recovers fields when extraction is a sparse,
 * near-newline-less blob (the real MO500 case) that line-based detection can't parse.
 * Deterministic: emits each known canonical label at most once, in order of appearance,
 * grouped under the most recent known section. Only phrases present in the text.
 */
function sweepKnownLabels(rawText: string): Array<{ canonical: string; type: StructureFieldType; section: boolean; index: number }> {
    const hits: Array<{ canonical: string; type: StructureFieldType; section: boolean; index: number }> = [];
    const taken = new Set<string>();
    for (const k of KNOWN_LABELS) {
        const m = k.re.exec(rawText);
        if (!m) continue;
        if (taken.has(k.canonical)) continue;
        taken.add(k.canonical);
        hits.push({ canonical: k.canonical, type: k.type, section: Boolean(k.section), index: m.index });
    }
    return hits.sort((a, b) => a.index - b.index);
}

function extractQuestion(line: string): string | null {
    const t = line.trim();
    const m = t.match(/^([A-Za-z][A-Za-z0-9 ,'\-/()]{3,80}\?)/);
    return m ? m[1].trim() : null;
}

/** Does the NEXT line look like a choice group whose prompt is the current line? */
function nextIsChoiceGroup(next: string | undefined): boolean {
    if (!next) return false;
    if (CHECKBOX_MARK.test(next)) return true;
    if (extractYesNoQuestion(next)) return true;
    if (/^\s*(yes\s+no|no\s+yes)\s*$/i.test(next)) return true;
    return false;
}

export function detectDocumentStructure(text: string | null): DocumentStructureCandidate {
    const warnings: string[] = [];
    const raw = (text ?? "").trim();
    if (!raw) {
        return {
            sections: [],
            warnings: ["No document text available — structure detection needs extracted text."],
            diagnostics: {
                text_length: 0,
                line_count: 0,
                candidate_labels: 0,
                section_headers: [],
                rejected_examples: [],
                rejected_headers: [],
                detected_known_labels: [],
                confidence_summary: { high: 0, medium: 0, low: 0 },
                quality: "failed",
            },
        };
    }

    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    const sections: DocumentStructureSection[] = [];
    const sectionHeaders: string[] = [];
    const rejected: RejectedLabelExample[] = [];
    const rejectedHeaders: string[] = [];
    let current: DocumentStructureSection | null = null;
    const seen = new Set<string>();

    const recordRejection = (line: string, reason: string) => {
        if (rejected.length >= 12) return;
        rejected.push({ text: line.slice(0, 60), reason });
    };
    const recordHeader = (line: string) => {
        if (rejectedHeaders.length >= 8) return;
        if (!rejectedHeaders.includes(line)) rejectedHeaders.push(line.slice(0, 80));
    };

    const startSection = (title: string, confidence: DocumentStructureSection["confidence"]) => {
        current = { title, confidence, fields: [] };
        sections.push(current);
        sectionHeaders.push(title);
    };

    const ensureSection = (): DocumentStructureSection => {
        if (!current) {
            current = { title: "Detected fields", confidence: "low", fields: [] };
            sections.push(current);
        }
        return current;
    };

    const addField = (
        label: string,
        type: StructureFieldType,
        confidence: DocumentStructureField["confidence"],
        evidence: string,
        line: string
    ): boolean => {
        const clean = label.replace(/\s+/g, " ").trim();
        if (!clean || clean.length < 2) return false;
        // Department / agency / title noise is NEVER a field (and never a signature).
        if (isHeaderNoise(clean) || clean.length > 60) {
            recordHeader(clean);
            return false;
        }
        const key = clean.toLowerCase();
        if (seen.has(key)) {
            recordRejection(clean, "duplicate");
            return false;
        }
        seen.add(key);
        ensureSection().fields.push({
            label: clean,
            suggested_type: type,
            required: isRequired(line) || undefined,
            confidence,
            evidence,
        });
        return true;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const next = lines[i + 1];

        // Department / agency masthead — drop entirely (never a field, never a section).
        if (isHeaderNoise(line) && !matchesFieldLexicon(line)) {
            recordHeader(line);
            continue;
        }

        if (isHeadingLine(line)) {
            startSection(
                line.replace(/:\s*$/, "").replace(/^\d+[.)]\s*/, "").trim(),
                /^section\b/i.test(line) ? "high" : "medium"
            );
            continue;
        }

        // Mixed-case section header ("Child Information") — promote to a section, not a field.
        if (isMixedCaseSectionHeader(line)) {
            startSection(line.trim(), "medium");
            continue;
        }

        let produced = false;

        // --- explicit marker paths (highest precedence; survive only when the PDF has them) ---
        const sig = extractSignature(line);
        if (sig) produced = addField(sig, "signature", "high", "signature line", line) || produced;

        if (!produced) {
            const opts = extractCheckboxOptions(line);
            if (opts.length > 0) {
                if (isYesNoPair(opts)) {
                    const prompt = i > 0 && looksLikeLabel(lines[i - 1]!) ? lines[i - 1]!.replace(/\?\s*$/, "") : "Yes / No";
                    produced = addField(prompt, "checkbox", "medium", "checkbox yes/no group", line) || produced;
                } else {
                    for (const opt of opts) produced = addField(opt, "checkbox", "medium", "checkbox option", line) || produced;
                }
            }
        }

        if (!produced) {
            const yn = extractYesNoQuestion(line);
            if (yn) produced = addField(yn, "checkbox", "medium", "yes/no question", line) || produced;
        }

        if (!produced) {
            for (const label of extractColonFields(line)) {
                produced = addField(label, suggestType(label), "medium", "labelled prompt", line) || produced;
            }
        }

        if (!produced) {
            for (const label of extractFillFields(line)) {
                produced = addField(label, suggestType(label), "medium", "underlined blank", line) || produced;
            }
        }

        if (!produced) {
            const q = extractQuestion(line);
            if (q) produced = addField(q.replace(/\?$/, ""), suggestType(q), "medium", "question prompt", line) || produced;
        }

        // --- marker-LESS paths (fp11.2): real unpdf text has bare labels + column gaps ---

        // Multi-column label row: "Name of Child   Date of Birth   Sex" → one field per cell.
        if (!produced && !nextIsChoiceGroup(next)) {
            const cols = extractLabelColumns(line);
            if (cols.length >= 2) {
                for (const c of cols) produced = addField(c, suggestType(c), "medium", "column label", line) || produced;
            }
        }

        // Single known field label (lexicon): "Date of Birth", "Physician Name".
        // Title/instruction lines (e.g. "School Age Child Health Report") are excluded.
        if (!produced && !nextIsChoiceGroup(next) && !TITLE_WORD_RE.test(line) && matchesFieldLexicon(line)) {
            produced = addField(line.trim(), suggestType(line), "medium", "known field label", line) || produced;
        }

        // Generic bare label net (low confidence) — short noun phrase, not prose/title.
        if (!produced && !nextIsChoiceGroup(next) && looksLikeBareLabel(line)) {
            produced = addField(line.trim(), suggestType(line), "low", "bare label", line) || produced;
        }

        // Label sitting directly above a blank rule line ("Child's Name" / "________").
        if (!produced && next !== undefined && isBlankRule(next) && looksLikeLabel(line)) {
            produced = addField(line, suggestType(line), "low", "label above blank line", line) || produced;
        }

        // Diagnostics: a line that looked label-ish but produced nothing.
        if (!produced && !isBlankRule(line) && /^[A-Za-z]/.test(line) && line.length <= 80) {
            const words = line.split(/\s+/).length;
            if (/[.!?]$/.test(line) || words > 6) recordRejection(line, words > 6 ? "too_long_or_prose" : "sentence");
            else if (TITLE_WORD_RE.test(line)) recordRejection(line, "title_or_instruction");
            else recordRejection(line, "no_label_signal");
        }
    }

    // --- blob-recovery sweep: ONLY when line-based detection was weak (e.g. a sparse,
    // near-newline-less extraction). Pulls KNOWN labels straight from the raw text, in
    // order, under their nearest known section. Skipped on well-lined forms so we don't
    // duplicate variants ("Child Name" vs "Child's Name"). Deterministic; text-only. ---
    const lineFieldCount = sections.reduce((n, s) => n + s.fields.length, 0);
    if (lineFieldCount < 2) {
        current = null;
        for (const h of sweepKnownLabels(raw)) {
            if (h.section) {
                const existing = sections.find((s) => s.title === h.canonical);
                if (existing) current = existing;
                else startSection(h.canonical, "medium");
            } else {
                addField(h.canonical, h.type, "medium", "known label (text sweep)", h.canonical);
            }
        }
    }
    const detectedKnownLabels = [
        ...new Set(KNOWN_LABELS.filter((k) => !k.section && k.re.test(raw)).map((k) => k.canonical)),
    ];

    const nonEmpty = sections.filter((s) => s.fields.length > 0);
    const allFields = nonEmpty.flatMap((s) => s.fields);
    const totalFields = allFields.length;

    // Quality verdict gates the Template Setup UX. "strong" requires enough good fields AND
    // that the text actually had line structure — a recovered blob is honestly "weak".
    const goodPre = allFields.filter((f) => f.confidence !== "low").length;
    const quality: StructureQuality =
        totalFields === 0 ? "failed" : totalFields >= 4 && goodPre >= 3 && lines.length >= 6 ? "strong" : "weak";

    // A sparse / blob-derived draft must NOT advertise high confidence (requirement): when
    // the draft isn't "strong", cap every field to at most medium.
    if (quality !== "strong") {
        for (const f of allFields) if (f.confidence === "high") f.confidence = "medium";
    }

    const confidence_summary = { high: 0, medium: 0, low: 0 };
    for (const f of allFields) {
        if (f.confidence === "high") confidence_summary.high += 1;
        else if (f.confidence === "medium") confidence_summary.medium += 1;
        else if (f.confidence === "low") confidence_summary.low += 1;
    }

    const diagnostics: StructureDiagnostics = {
        text_length: raw.length,
        line_count: lines.length,
        candidate_labels: totalFields,
        section_headers: sectionHeaders,
        rejected_examples: rejected,
        rejected_headers: rejectedHeaders,
        detected_known_labels: detectedKnownLabels,
        confidence_summary,
        quality,
    };

    const headerNote = rejectedHeaders.length ? ` Ignored ${rejectedHeaders.length} header/agency line(s).` : "";
    if (totalFields === 0) {
        const sample = rejected.slice(0, 3).map((r) => `“${r.text}” (${r.reason})`).join(", ");
        warnings.push(
            `Text was available but no labelled fields were detected — ${diagnostics.text_length} chars, ${diagnostics.line_count} lines.` +
                (sectionHeaders.length ? ` Section headers seen: ${sectionHeaders.join(", ")}.` : "") +
                headerNote +
                (sample ? ` Rejected examples: ${sample}.` : "")
        );
    } else if (quality === "weak") {
        warnings.push(
            `Weak detection: only ${totalFields} field${totalFields === 1 ? "" : "s"} found from ${diagnostics.text_length} chars of text ` +
                `(${diagnostics.line_count} lines). This is a text-assisted draft, not exact PDF mapping — use the PDF preview to review and add fields before creating.` +
                headerNote
        );
    } else {
        warnings.push(
            `Detected ${totalFields} field${totalFields === 1 ? "" : "s"} across ${nonEmpty.length} section${nonEmpty.length === 1 ? "" : "s"} ` +
                `(confidence — high: ${confidence_summary.high}, medium: ${confidence_summary.medium}, low: ${confidence_summary.low}). ` +
                `Text-assisted draft (no PDF coordinate mapping yet) — review before creating.` +
                headerNote
        );
    }

    return { sections: nonEmpty, warnings, diagnostics };
}
