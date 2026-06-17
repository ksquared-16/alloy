/**
 * POS-FP10 — deterministic extraction of PROPOSED field values for a classified doc.
 *
 * Honest + deterministic: a proposal is emitted ONLY when a real signal yields a value
 * (explicit structured metadata/extracted_data, or a parseable date in the filename/
 * title). When nothing is found, the field is skipped — never fabricated. `unknown`
 * classification always yields zero proposals.
 *
 * NO OCR, NO LLM, NO record reads. Inputs are cheap document signals that already
 * exist. This produces proposals only — no matching, no commit, no record updates.
 */

import type { ProcessingClassificationKey } from "../classification/types";
import type {
    ExtractionFieldProposal,
    ExtractionInput,
    ExtractionProposalSet,
    ExtractionSignal,
} from "./types";

export const EXTRACTOR_VERSION = "fp10.1";

/** Confidence for an explicit structured field (metadata / extracted_data). */
const META_CONFIDENCE = 0.9;
/** Confidence for a value parsed from a filename/title (weaker, but honest). */
const FILENAME_CONFIDENCE = 0.6;

interface FieldTarget {
    field_key: string;
    label: string;
    /** Metadata/extracted_data key aliases (lowercased) that may hold the value. */
    metaAliases: string[];
    kind: "text" | "date" | "amount";
    /** If true, a single parseable date in filename/title may back this field (date kind only). */
    allowFilenameDate?: boolean;
}

const TARGETS_BY_CLASSIFICATION: Partial<Record<ProcessingClassificationKey, FieldTarget[]>> = {
    subsidy_contract: [
        { field_key: "agency_name", label: "Agency Name", metaAliases: ["agency_name", "agency", "payer", "provider_agency"], kind: "text" },
        { field_key: "child_name", label: "Child Name", metaAliases: ["child_name", "child", "student_name", "member_name"], kind: "text" },
        { field_key: "authorization_start_date", label: "Authorization Start Date", metaAliases: ["authorization_start_date", "auth_start", "start_date"], kind: "date" },
        { field_key: "authorization_end_date", label: "Authorization End Date", metaAliases: ["authorization_end_date", "auth_end", "end_date"], kind: "date" },
    ],
    remittance: [
        { field_key: "payer_name", label: "Payer Name", metaAliases: ["payer_name", "payer", "payor", "agency_name"], kind: "text" },
        { field_key: "payment_amount", label: "Payment Amount", metaAliases: ["payment_amount", "amount", "total", "paid_amount"], kind: "amount" },
        { field_key: "payment_date", label: "Payment Date", metaAliases: ["payment_date", "paid_on", "date"], kind: "date", allowFilenameDate: true },
    ],
    immunization_record: [
        { field_key: "child_name", label: "Child Name", metaAliases: ["child_name", "child", "student_name", "patient_name"], kind: "text" },
        { field_key: "immunization_date", label: "Immunization Date", metaAliases: ["immunization_date", "vaccination_date", "date_administered", "date"], kind: "date", allowFilenameDate: true },
    ],
    // enrollment_document, form_like_document, unknown → no targets in this first slice.
};

/** Case-insensitive lookup of a string value across metadata + extracted_data. */
function lookupMeta(
    sources: { metadata?: Record<string, unknown> | null; extractedData?: Record<string, unknown> | null },
    aliases: string[]
): { value: string; source: string } | null {
    const banks: Array<[string, Record<string, unknown> | null | undefined]> = [
        ["metadata", sources.metadata],
        ["extracted_data", sources.extractedData],
    ];
    for (const [bankName, bank] of banks) {
        if (!bank || typeof bank !== "object") continue;
        const lowerKeyed = new Map<string, unknown>();
        for (const [k, v] of Object.entries(bank)) lowerKeyed.set(k.toLowerCase(), v);
        for (const alias of aliases) {
            const raw = lowerKeyed.get(alias);
            if (raw == null) continue;
            const s = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
            if (s.length > 0) return { value: s, source: `${bankName}.${alias}` };
        }
    }
    return null;
}

/** Normalize a date string to ISO `YYYY-MM-DD`, or null if not confidently parseable. */
export function normalizeDate(raw: string): string | null {
    const s = raw.trim();
    const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (us) {
        const mm = us[1].padStart(2, "0");
        const dd = us[2].padStart(2, "0");
        const m = Number(mm);
        const d = Number(dd);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${us[3]}-${mm}-${dd}`;
    }
    return null;
}

/** Normalize a currency-ish string to a plain decimal string, or null. */
export function normalizeAmount(raw: string): string | null {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    if (!cleaned || !/\d/.test(cleaned)) return null;
    const n = Number(cleaned);
    if (Number.isNaN(n)) return null;
    return String(n);
}

/**
 * Find exactly one date in text (filename/title); ambiguous (0 or >1) → null.
 * Uses digit lookarounds (not `\b`) so underscore-adjacent dates like
 * "remittance_2026-07-15.pdf" are matched.
 */
function singleDateInText(text: string): string | null {
    const matches = text.match(/(?<!\d)(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})(?!\d)/g);
    if (!matches || matches.length !== 1) return null;
    return normalizeDate(matches[0]);
}

function proposeField(target: FieldTarget, input: ExtractionInput): ExtractionFieldProposal | null {
    // 1) explicit structured metadata / extracted_data
    const hit = lookupMeta({ metadata: input.metadata, extractedData: input.extractedData }, target.metaAliases);
    if (hit) {
        let value: string | null = hit.value;
        if (target.kind === "date") value = normalizeDate(hit.value);
        else if (target.kind === "amount") value = normalizeAmount(hit.value);
        if (value != null) {
            const signals: ExtractionSignal[] = [{ source: hit.source, value: hit.value, weight: META_CONFIDENCE }];
            return { field_key: target.field_key, label: target.label, value, confidence: META_CONFIDENCE, signals };
        }
    }

    // 2) a single parseable date in filename/title (date fields only, when allowed)
    if (target.kind === "date" && target.allowFilenameDate) {
        const haystack = [input.fileName ?? "", input.title ?? ""].join(" ");
        const iso = singleDateInText(haystack);
        if (iso) {
            return {
                field_key: target.field_key,
                label: target.label,
                value: iso,
                confidence: FILENAME_CONFIDENCE,
                signals: [{ source: "filename", value: iso, weight: FILENAME_CONFIDENCE }],
            };
        }
    }

    // No real signal → propose nothing (honest).
    return null;
}

/**
 * Deterministically produce proposed values for the case's classification.
 * Returns an empty `proposals` array when nothing can be honestly proposed (including
 * `unknown` and unsupported classifications).
 */
export function extractProposalsForClassification(input: ExtractionInput): ExtractionProposalSet {
    const targets = TARGETS_BY_CLASSIFICATION[input.classificationKey] ?? [];
    const proposals: ExtractionFieldProposal[] = [];
    for (const target of targets) {
        const proposal = proposeField(target, input);
        if (proposal) proposals.push(proposal);
    }
    return {
        classification_key: input.classificationKey,
        proposals,
        extractor_version: EXTRACTOR_VERSION,
    };
}
