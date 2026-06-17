/**
 * POS-FP11 — deterministic document structure detection from PLAIN TEXT.
 *
 * Pure + deterministic. NO OCR, NO LLM. Given already-extracted text, it proposes
 * sections (headings) and field/question candidates (labelled prompts) using simple,
 * explainable heuristics. When there is no text it returns ZERO sections and a warning
 * — never fabricated fields. The output is a review-only preview, not a form schema.
 */

import type {
    DocumentStructureCandidate,
    DocumentStructureField,
    DocumentStructureSection,
    StructureFieldType,
} from "./types";

export const STRUCTURE_GENERATOR_VERSION = "fp11.0";

/** A heading: a short line that's ALL CAPS, or ends with ':' with no inline answer, or "Section N". */
function isHeadingLine(line: string): boolean {
    const t = line.trim();
    if (!t || t.length > 60) return false;
    if (/^section\b/i.test(t)) return true;
    if (/^[A-Z0-9][A-Z0-9 \-/&]{2,}$/.test(t) && /[A-Z]/.test(t)) return true; // ALL CAPS heading
    if (/^[A-Za-z][A-Za-z \-/&]{2,}:\s*$/.test(t)) return true; // "Family Information:" with nothing after
    return false;
}

/** Detect a labelled field line: "Label:", "Label ____", "Label?" — returns the label or null. */
function fieldLabelFrom(line: string): string | null {
    const t = line.trim();
    // "Label:" followed only by a fill-in placeholder (blank / underscores / slashes /
    // dots / brackets). Prose after the colon (real words) is intentionally NOT a field.
    const colon = t.match(/^([A-Za-z][A-Za-z0-9 .,'\-/()]{1,60}?)\s*:\s*[\s_xX.,/\\[\]()-]*$/);
    if (colon?.[1]) return colon[1].trim();
    // "Label ______" (fill-in)
    const fill = t.match(/^([A-Za-z][A-Za-z0-9 .,'\-/()]{1,60}?)\s+_{2,}\s*$/);
    if (fill?.[1]) return fill[1].trim();
    // "Question?" prompt
    const q = t.match(/^([A-Za-z][A-Za-z0-9 .,'\-/()]{3,80}\?)\s*$/);
    if (q?.[1]) return q[1].trim();
    return null;
}

/** Map a label to a suggested field type by keyword. Conservative — defaults to text/unknown. */
function suggestType(label: string): { type: StructureFieldType; evidence: string } {
    const l = label.toLowerCase();
    if (/\bsignature|sign here|signed\b/.test(l)) return { type: "signature", evidence: "signature keyword" };
    if (/\b(date|dob|date of birth|expiration|start date|end date)\b/.test(l)) return { type: "date", evidence: "date keyword" };
    if (/\b(amount|total|fee|payment|cost|price|balance|\$)\b/.test(l)) return { type: "number", evidence: "amount keyword" };
    if (/\b(upload|attach|attachment|copy of|document)\b/.test(l)) return { type: "file", evidence: "attachment keyword" };
    if (/\b(check|checkbox|agree|consent|i certify|yes\/no|y\/n)\b/.test(l)) return { type: "checkbox", evidence: "checkbox keyword" };
    if (/\b(select|choose|circle one|gender|state|program|location)\b/.test(l)) return { type: "select", evidence: "selection keyword" };
    if (/\b(name|address|email|phone|notes|comments|description)\b/.test(l)) return { type: "text", evidence: "text keyword" };
    return { type: "unknown", evidence: "no type keyword" };
}

function isRequired(line: string): boolean {
    return /\*|\brequired\b/i.test(line);
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
    const seenFieldLabels = new Set<string>();

    const ensureSection = (): DocumentStructureSection => {
        if (!current) {
            current = { title: "Untitled section", confidence: "low", fields: [] };
            sections.push(current);
        }
        return current;
    };

    for (const line of lines) {
        if (isHeadingLine(line)) {
            current = {
                title: line.replace(/:\s*$/, "").trim(),
                confidence: /^section\b/i.test(line) ? "high" : "medium",
                fields: [],
            };
            sections.push(current);
            continue;
        }

        const label = fieldLabelFrom(line);
        if (label) {
            const key = label.toLowerCase();
            if (seenFieldLabels.has(key)) continue;
            seenFieldLabels.add(key);
            const { type, evidence } = suggestType(label);
            const field: DocumentStructureField = {
                label,
                suggested_type: type,
                required: isRequired(line) || undefined,
                confidence: type === "unknown" ? "low" : "medium",
                evidence,
            };
            ensureSection().fields.push(field);
        }
    }

    const totalFields = sections.reduce((n, s) => n + s.fields.length, 0);
    if (totalFields === 0) {
        warnings.push("Text was available but no labelled fields were detected.");
    }
    // Drop empty sections (headings with no detected fields) to keep the preview honest.
    const nonEmpty = sections.filter((s) => s.fields.length > 0);

    return { sections: nonEmpty, warnings };
}
