/**
 * Phase 7 Slice 2 — section disposition + static-content preservation.
 *
 * A document section is not always a set of form fields. The operator must be able to classify each
 * section's INTENT, and Alloy must preserve the content that field-extraction alone discards
 * (instructions, consent/policy prose, signature blocks). This module is the deterministic core that
 * recommends a disposition per section and preserves its static text; the operator confirms/overrides
 * it in the review UI, and `draftFormToFormSchemaV1` emits the right FormSchemaV1 constructs.
 *
 * Pure + deterministic (heuristics only — no OCR, no LLM). Overridable: a recommendation is a default,
 * never a silent decision.
 */

export type SectionDisposition =
    | "fields" // collect digital form fields (default)
    | "generated" // content generated/filled from collected values (static copy with tokens)
    | "static_reference" // read-only instructional/reference material (no input)
    | "acknowledgement" // consent/policy text the participant must affirmatively acknowledge
    | "upload" // the participant must attach a document
    | "signature" // the participant must sign
    | "initials"; // the participant must initial

export const SECTION_DISPOSITIONS: SectionDisposition[] = [
    "fields",
    "generated",
    "static_reference",
    "acknowledgement",
    "upload",
    "signature",
    "initials",
];

const ACK_RE = /\b(consent|i\s+agree|i\s+acknowledge|i\s+certify|i\s+authorize|i\s+understand|policy|policies|terms|permission|hereby)\b/i;
const SIGNATURE_RE = /\b(signature|sign\s+here|signed|parent\/guardian\s+signature|please\s+sign|by\s+signing)\b/i;
const INITIALS_RE = /\b(initial|initials|please\s+initial)\b/i;
const UPLOAD_RE = /\b(attach|upload|provide\s+a\s+copy|enclose|include\s+a\s+copy|please\s+bring|submit\s+a\s+copy|proof\s+of)\b/i;

/** Does a line look like a field prompt (a label the participant fills), vs. prose/instruction? */
function looksLikeFieldPrompt(line: string): boolean {
    const t = line.trim();
    if (!t) return false;
    if (/[:_]\s*$/.test(t)) return true; // "Child name:" / fill blank
    if (/_{3,}/.test(t)) return true; // "Name ________"
    if (/\byes\b.*\bno\b/i.test(t)) return true; // yes/no
    // Short label-like lines (few words, no sentence punctuation) read as prompts.
    const words = t.split(/\s+/);
    return words.length <= 6 && !/[.!?]$/.test(t);
}

export type SectionClassificationInput = {
    title: string;
    fieldLabels: string[];
    /** Raw text belonging to this section (the lines the detector saw), if available. */
    sectionText?: string | null;
};

export type SectionClassification = {
    disposition: SectionDisposition;
    /** Preserved instructional / consent / signature prose that field-extraction would otherwise drop. */
    staticText: string | null;
    /** Why this disposition was recommended (operator-facing rationale). */
    rationale: string;
    /** Recommendation confidence — the operator confirms before publish. */
    confidence: "high" | "medium" | "low";
};

/**
 * Recommend a disposition for one section and preserve its static content.
 * The recommendation is a default the operator confirms — never applied silently.
 */
export function recommendSectionDisposition(input: SectionClassificationInput): SectionClassification {
    const title = (input.title ?? "").trim();
    const text = (input.sectionText ?? "").trim();
    const hay = `${title}\n${text}`;
    const hasFields = input.fieldLabels.length > 0;

    // Signature / initials blocks — strongest signal, even alongside a field or two.
    if (SIGNATURE_RE.test(hay)) {
        return {
            disposition: "signature",
            staticText: preserveProse(text),
            rationale: "Mentions a signature — the participant should sign here.",
            confidence: hasFields ? "medium" : "high",
        };
    }
    if (INITIALS_RE.test(hay)) {
        return {
            disposition: "initials",
            staticText: preserveProse(text),
            rationale: "Asks for initials.",
            confidence: "medium",
        };
    }

    // Upload requests.
    if (UPLOAD_RE.test(hay)) {
        return {
            disposition: "upload",
            staticText: preserveProse(text),
            rationale: "Asks the participant to attach or provide a copy of a document.",
            confidence: "medium",
        };
    }

    // Consent / policy prose the participant must acknowledge.
    if (ACK_RE.test(hay) && proseLineCount(text) >= 1) {
        return {
            disposition: "acknowledgement",
            staticText: preserveProse(text) ?? title,
            rationale: "Contains consent / policy language requiring acknowledgement.",
            confidence: hasFields ? "low" : "high",
        };
    }

    // No fields and mostly prose → read-only reference material (instructions preserved, not dropped).
    if (!hasFields && proseLineCount(text) >= 1) {
        return {
            disposition: "static_reference",
            staticText: preserveProse(text) ?? title,
            rationale: "Instructional / reference text with no fields to fill.",
            confidence: "medium",
        };
    }

    // Default: collect digital fields.
    return {
        disposition: "fields",
        staticText: null,
        rationale: hasFields ? "Labelled prompts detected — collect as form fields." : "Default.",
        confidence: hasFields ? "high" : "low",
    };
}

/** Count lines that read as prose/instruction (not field prompts). */
function proseLineCount(text: string): number {
    return text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !looksLikeFieldPrompt(l)).length;
}

/** Keep the instructional/consent prose (drop field-prompt lines) so nothing meaningful is lost. */
function preserveProse(text: string): string | null {
    const kept = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !looksLikeFieldPrompt(l));
    return kept.length > 0 ? kept.join("\n") : null;
}
