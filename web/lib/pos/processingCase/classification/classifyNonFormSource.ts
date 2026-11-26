/**
 * POS-FP9 — deterministic, rule-based classifier for non-form Processing Case sources.
 *
 * Inputs are cheap metadata that already exist on an uploaded document: filename,
 * MIME type, doc_type, title, and any caller-provided metadata hint. NO file bytes
 * are read, NO OCR, NO LLM. The output is honest and confidence-based: when nothing
 * matches, it returns `unknown` (confidence 0) rather than guessing.
 *
 * Form-backed source kinds are reported `unsupported` — forms have their own intake
 * path and are intentionally out of scope here.
 */

import { isNonFormProcessingSourceKind } from "../maybeOpenProcessingCaseFromNonFormSourceSafe";
import type {
    ClassificationSignal,
    ClassifyNonFormSourceInput,
    ProcessingClassificationKey,
    ProcessingClassificationResult,
} from "./types";

export const CLASSIFIER_VERSION = "fp9.1";

/**
 * Max confidence a deterministic heuristic may claim — never absolute certainty.
 *
 * Exported so the governed-classification schema can state the real confidence
 * contract by reference instead of restating the literal. Value unchanged.
 */
export const MAX_CONFIDENCE = 0.95;

interface KeywordRule {
    /** Substring to look for (already lowercased). Matched against the combined haystack. */
    token: string;
    weight: number;
}

/**
 * Ordered by tie-break priority (earlier wins an equal-weight tie). Weights are
 * intentionally conservative; generic tokens (e.g. "contract", "payment") are weak.
 */
const RULES: { key: Exclude<ProcessingClassificationKey, "unknown">; label: string; keywords: KeywordRule[] }[] = [
    {
        key: "subsidy_contract",
        label: "Subsidy contract",
        keywords: [
            { token: "child care assistance", weight: 0.7 },
            { token: "subsidy", weight: 0.6 },
            { token: "ccap", weight: 0.6 },
            { token: "voucher", weight: 0.5 },
            { token: "dhs", weight: 0.3 },
            { token: "contract", weight: 0.25 },
        ],
    },
    {
        key: "remittance",
        label: "Remittance",
        keywords: [
            { token: "remittance", weight: 0.7 },
            { token: "remit", weight: 0.5 },
            { token: "payment advice", weight: 0.6 },
            { token: "835", weight: 0.6 },
            { token: "reconciliation", weight: 0.5 },
            { token: "eob", weight: 0.4 },
            { token: "era", weight: 0.3 },
        ],
    },
    {
        key: "immunization_record",
        label: "Immunization record",
        keywords: [
            { token: "immunization", weight: 0.7 },
            { token: "immun", weight: 0.5 },
            { token: "vaccination", weight: 0.6 },
            { token: "vaccine", weight: 0.5 },
            { token: "shot record", weight: 0.6 },
            { token: "izr", weight: 0.4 },
        ],
    },
    {
        key: "enrollment_document",
        label: "Enrollment document",
        keywords: [
            { token: "enrollment", weight: 0.6 },
            { token: "registration", weight: 0.5 },
            { token: "intake packet", weight: 0.6 },
            { token: "enroll", weight: 0.4 },
        ],
    },
    {
        key: "form_like_document",
        label: "Form-like document",
        keywords: [
            { token: "application form", weight: 0.6 },
            { token: "form", weight: 0.4 },
            { token: "application", weight: 0.35 },
        ],
    },
];

function clampConfidence(raw: number): number {
    if (raw <= 0) return 0;
    const capped = Math.min(raw, MAX_CONFIDENCE);
    return Math.round(capped * 100) / 100;
}

/** Pull plain string values out of a shallow metadata object for matching. */
function metadataStrings(metadata: Record<string, unknown> | null | undefined): string[] {
    if (!metadata || typeof metadata !== "object") return [];
    const out: string[] = [];
    for (const v of Object.values(metadata)) {
        if (typeof v === "string") out.push(v);
        else if (typeof v === "number" || typeof v === "boolean") out.push(String(v));
    }
    return out;
}

/**
 * A keyword matches at the START of a word, not anywhere inside one.
 *
 * Several tokens here are deliberate PREFIXES — `immun` must catch "immunisation", `enroll` must
 * catch "enrollment" — so the end of the token stays open. The start must not be: a raw substring
 * match reads "form" inside "in-form-ation" and classifies an ACH authorization as a form-like
 * document, and "era" inside "operations". Anchoring only the start keeps every intended prefix and
 * drops the mid-word coincidences.
 */
function matchesToken(text: string, token: string): boolean {
    if (!token) return false;
    let from = 0;
    for (;;) {
        const at = text.indexOf(token, from);
        if (at < 0) return false;
        const before = at === 0 ? "" : text[at - 1]!;
        if (!/[a-z0-9]/i.test(before)) return true;
        from = at + 1;
    }
}

interface Field {
    source: string;
    text: string;
}

/**
 * Deterministically classify a non-form source from cheap metadata signals.
 * Pure: no I/O, no time, no randomness — same input always yields the same output.
 */
export function classifyNonFormSource(input: ClassifyNonFormSourceInput): ProcessingClassificationResult {
    // Forms are out of scope for this layer — be explicit, assert nothing.
    if (!isNonFormProcessingSourceKind(input.sourceKind)) {
        return {
            classification_key: "unknown",
            label: "Unsupported source",
            confidence: 0,
            signals: [],
            status: "unsupported",
            classifier_version: CLASSIFIER_VERSION,
        };
    }

    const fields: Field[] = [
        { source: "filename", text: (input.fileName ?? "").toLowerCase() },
        { source: "title", text: (input.title ?? "").toLowerCase() },
        { source: "doc_type", text: (input.docType ?? "").toLowerCase() },
        ...metadataStrings(input.metadata).map((s) => ({ source: "metadata", text: s.toLowerCase() })),
    ].filter((f) => f.text.length > 0);

    // Score every key; remember the signals that fired for each.
    let best: { key: ProcessingClassificationKey; label: string; score: number; signals: ClassificationSignal[] } | null =
        null;

    for (const rule of RULES) {
        let score = 0;
        const signals: ClassificationSignal[] = [];
        for (const kw of rule.keywords) {
            for (const field of fields) {
                if (matchesToken(field.text, kw.token)) {
                    score += kw.weight;
                    signals.push({ source: field.source, value: kw.token, weight: kw.weight });
                }
            }
        }
        if (score > 0 && (best === null || score > best.score)) {
            best = { key: rule.key, label: rule.label, score, signals };
        }
    }

    if (!best) {
        return {
            classification_key: "unknown",
            label: "Unknown",
            confidence: 0,
            signals: [],
            status: "unknown",
            classifier_version: CLASSIFIER_VERSION,
        };
    }

    return {
        classification_key: best.key,
        label: best.label,
        confidence: clampConfidence(best.score),
        signals: best.signals,
        status: "classified",
        classifier_version: CLASSIFIER_VERSION,
    };
}
