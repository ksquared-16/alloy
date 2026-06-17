/**
 * POS-FP11 — deterministic document structure detection from PLAIN TEXT.
 *
 * Pure + deterministic. NO OCR, NO LLM. Government / medical / childcare forms are
 * layout-driven (multiple fields per line, checkboxes, Yes/No groups, underlined
 * blanks, signature areas) — not simple "Label:" prompts. This detects those patterns
 * line-by-line and proposes section + field candidates. Honest: no text → zero fields;
 * every field carries a real label lifted from the text — never fabricated.
 */

import type {
    DocumentStructureCandidate,
    DocumentStructureField,
    DocumentStructureSection,
    StructureFieldType,
} from "./types";

export const STRUCTURE_GENERATOR_VERSION = "fp11.1";

const PLACEHOLDER_RE = /^[\s_xX.,/\\[\]()·•–—-]*$/;
const CHECKBOX_MARK = /(\[\s?[xX]?\s?\]|☐|□|■|✓|✔|◯|○|\(\s?[xX]?\s?\))/;
const CHECKBOX_OPTION_RE = /(\[\s?[xX]?\s?\]|☐|□|■|✓|✔|◯|○|\(\s?[xX]?\s?\))\s*([A-Za-z][A-Za-z0-9 .,'\-/()]{0,28})/g;
const COLON_LABEL_RE = /([A-Za-z][A-Za-z0-9 .,'\-/()]{1,38}?)\s*:\s*/g;
const FILL_RE = /([A-Za-z][A-Za-z0-9 .,'\-/()]{1,38}?)\s+_{3,}/g;

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

function suggestType(label: string): StructureFieldType {
    const l = label.toLowerCase();
    if (/\bsignature|sign here|signed\b/.test(l)) return "signature";
    if (/\b(date|dob|date of birth|expiration|start date|end date|d\.o\.b)\b/.test(l)) return "date";
    if (/\b(amount|total|fee|payment|cost|price|balance)\b/.test(l) || /\$/.test(l)) return "number";
    if (/\b(upload|attach|attachment|copy of)\b/.test(l)) return "file";
    if (/\b(check|checkbox|agree|consent|i certify|yes\/no|y\/n)\b/.test(l)) return "checkbox";
    if (/\b(select|choose|circle one|gender|sex|state|program|grade|relationship)\b/.test(l)) return "select";
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
    if (/\bsignature\b/i.test(line)) {
        const cleaned = line.replace(/[_:.]+/g, " ").replace(/\s+/g, " ").trim();
        return cleaned.slice(0, 40) || "Signature";
    }
    if (/^x[_\s]{3,}/i.test(line.trim())) return "Signature";
    if (/\bsign here\b/i.test(line)) return "Signature";
    return null;
}

function extractQuestion(line: string): string | null {
    const t = line.trim();
    const m = t.match(/^([A-Za-z][A-Za-z0-9 ,'\-/()]{3,80}\?)/);
    return m ? m[1].trim() : null;
}

export function detectDocumentStructure(text: string | null): DocumentStructureCandidate {
    const warnings: string[] = [];
    const raw = (text ?? "").trim();
    if (!raw) {
        return { sections: [], warnings: ["No document text available — structure detection needs extracted text."] };
    }

    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    const sections: DocumentStructureSection[] = [];
    let current: DocumentStructureSection | null = null;
    const seen = new Set<string>();

    const ensureSection = (): DocumentStructureSection => {
        if (!current) {
            current = { title: "Untitled section", confidence: "low", fields: [] };
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
        const key = clean.toLowerCase();
        if (seen.has(key)) return false;
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

        if (isHeadingLine(line)) {
            current = {
                title: line.replace(/:\s*$/, "").replace(/^\d+[.)]\s*/, "").trim(),
                confidence: /^section\b/i.test(line) ? "high" : "medium",
                fields: [],
            };
            sections.push(current);
            continue;
        }

        let produced = false;

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

        // Label sitting directly above a blank rule line ("Child's Name" / "________").
        if (!produced && i + 1 < lines.length && isBlankRule(lines[i + 1]!) && looksLikeLabel(line)) {
            produced = addField(line, suggestType(line), "low", "label above blank line", line) || produced;
        }
    }

    const totalFields = sections.reduce((n, s) => n + s.fields.length, 0);
    if (totalFields === 0) {
        warnings.push("Text was available but no labelled fields were detected.");
    }
    const nonEmpty = sections.filter((s) => s.fields.length > 0);
    return { sections: nonEmpty, warnings };
}
