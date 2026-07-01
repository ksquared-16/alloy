/**
 * POS-FP12 — derive a human title / display name for a document.
 *
 * Priority: a real heading from the document text → cleaned original filename →
 * humanized classification label → "Untitled form". Pure + deterministic. Never
 * fabricates — if there's nothing usable it falls back honestly.
 */

const CLASSIFICATION_LABELS: Record<string, string> = {
    subsidy_contract: "Subsidy Contract",
    remittance: "Remittance",
    immunization_record: "Immunization Record",
    enrollment_document: "Enrollment Document",
    form_like_document: "Form",
    unknown: "Untitled form",
};

function titleCase(s: string): string {
    return s
        .toLowerCase()
        .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
        .trim();
}

/** Clean a filename into a display name: strip extension, separators → spaces, title-case. */
export function cleanFilenameToTitle(fileName: string | null | undefined): string | null {
    if (!fileName) return null;
    const noExt = fileName.replace(/\.[a-z0-9]{1,5}$/i, "");
    const spaced = noExt.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
    // Drop trailing numeric junk like "...report 0" → "...report".
    const trimmed = spaced.replace(/\s+\d{1,3}$/, "").trim();
    if (!trimmed) return null;
    return titleCase(trimmed);
}

/** Pick a plausible title line from the top of the extracted text (a short, heading-like line). */
export function titleFromText(text: string | null | undefined): string | null {
    if (!text) return null;
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    for (const line of lines.slice(0, 8)) {
        // A heading: 2–80 chars, mostly letters/spaces, not a "Label:" field, not a date/number line.
        if (line.length < 3 || line.length > 80) continue;
        if (/[:_]/.test(line) && /:\s*\S/.test(line)) continue; // looks like a filled field
        if (/^\d/.test(line)) continue;
        const letters = (line.match(/[A-Za-z]/g) ?? []).length;
        if (letters < line.length * 0.5) continue;
        return line.replace(/\s+/g, " ").trim();
    }
    return null;
}

export interface DeriveTitleInput {
    extractedText?: string | null;
    fileName?: string | null;
    classificationKey?: string | null;
}

export interface DerivedTitle {
    title: string;
    fromText: boolean;
}

export function deriveDocumentTitle(input: DeriveTitleInput): DerivedTitle {
    const fromText = titleFromText(input.extractedText);
    if (fromText) return { title: fromText, fromText: true };

    const fromFile = cleanFilenameToTitle(input.fileName);
    if (fromFile) return { title: fromFile, fromText: false };

    const key = input.classificationKey ?? "";
    if (key && CLASSIFICATION_LABELS[key]) return { title: CLASSIFICATION_LABELS[key], fromText: false };

    return { title: "Untitled form", fromText: false };
}

/**
 * Display name for a document everywhere (queue, header, list, evidence).
 * Priority: operator override → detected/stored title → cleaned filename → fallback.
 * `operatorName` is future-safe: no override field exists yet, so callers pass nothing
 * and behavior is unchanged — but the seam is ready for an operator-set custom name.
 */
export function deriveDocumentDisplayName(
    title: string | null | undefined,
    fileName: string | null | undefined,
    operatorName?: string | null
): string {
    const op = (operatorName ?? "").trim();
    if (op) return op;
    const t = (title ?? "").trim();
    if (t && t.toLowerCase() !== "document") return t;
    const cleaned = cleanFilenameToTitle(fileName);
    if (cleaned) return cleaned;
    return "Untitled document";
}
