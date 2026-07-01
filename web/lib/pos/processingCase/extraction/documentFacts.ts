/**
 * POS-FP10 (intake-aligned) — Document → IntakeSourceEnvelope → IntakeFact[].
 *
 * The POS document adapter. It turns cheap, already-structured document signals
 * (filename / title / doc_type / metadata) into SOURCE-AGNOSTIC `IntakeFact[]` using
 * the shared `IntakeFact` taxonomy — no POS/target field keys, no classification
 * knowledge. Deterministic. No OCR, no LLM.
 *
 * Fact typing is value-driven (a value is a `date` because it parses as a date, an
 * `amount` because it is currency-shaped), so the extractor never encodes target
 * semantics. The downstream mapping profile (classification-aware) decides which
 * review field each fact becomes.
 *
 * Note: the shared `IntakeFactType` enum has no org/agency type, so agency / payer
 * organization names are intentionally NOT emitted as facts here — they remain on the
 * source envelope metadata and are surfaced as candidates by the mapper. See
 * `mapProcessingCandidates.ts`. (Flagged as a shared-taxonomy gap, not invented here.)
 */

import type {
    IntakeFact,
    IntakeFactConfidence,
    IntakeFactExtractionResult,
    IntakeSourceEnvelope,
} from "@/lib/intake/types";
import { parseFlexibleDate, INTAKE_ISO_DATE_RE, INTAKE_US_DATE_RE } from "@/lib/intake/normalize/date";

/** Evidence prefix marking a fact that came from a document metadata key. */
export const DOC_META_EVIDENCE_PREFIX = "document_metadata:";
/** Evidence marker for a date parsed out of the filename/title. */
export const DOC_FILENAME_EVIDENCE = "filename";

export interface DocumentSignals {
    fileName?: string | null;
    title?: string | null;
    docType?: string | null;
    metadata?: Record<string, unknown> | null;
    /** Future-proof structured values already on the document row. */
    extractedData?: Record<string, unknown> | null;
    /** Future-proof OCR text (empty today; never fabricated). */
    extractedText?: string | null;
}

const CHILD_NAME_ALIASES = ["child_name", "child", "student_name", "member_name", "patient_name"];
const EMAIL_ALIASES = ["email", "parent_email", "guardian_email"];
const PHONE_ALIASES = ["phone", "parent_phone", "guardian_phone"];
const DOB_ALIASES = ["dob", "date_of_birth", "birthdate"];
const AGE_ALIASES = ["age", "age_years"];

/** Build the canonical source envelope for a document case. */
export function buildDocumentSourceEnvelope(
    signals: DocumentSignals,
    opts: { sourceId: string; capturedAt: string }
): IntakeSourceEnvelope {
    return {
        source_id: opts.sourceId,
        source_kind: "document",
        captured_at: opts.capturedAt,
        raw_material: {
            file_name: signals.fileName ?? null,
            title: signals.title ?? null,
            doc_type: signals.docType ?? null,
            extracted_text: signals.extractedText ?? null,
        },
        metadata: { ...(signals.metadata ?? {}), ...(signals.extractedData ?? {}) },
    };
}

function normalizeKey(key: string): string {
    return key.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Currency-shaped amount detector: requires `$`, comma-grouping, or 2-decimal — avoids matching years/ids. */
function normalizeAmount(raw: string): string | null {
    const looksLikeAmount = /\$|^\d{1,3}(,\d{3})+(\.\d+)?$|^\d+\.\d{2}$/.test(raw.trim());
    if (!looksLikeAmount) return null;
    const cleaned = raw.replace(/[^0-9.]/g, "");
    if (!cleaned || !/\d/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : String(n);
}

/** Exactly one date in text (filename/title); 0 or >1 → null. Lookarounds so `_2026-07-15` matches. */
function singleDateInText(text: string): string | null {
    const re = /(?<!\d)(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})(?!\d)/g;
    const matches = text.match(re);
    if (!matches || matches.length !== 1) return null;
    return parseFlexibleDate(matches[0]);
}

function metaConfidence(): IntakeFactConfidence {
    return "high";
}

function readString(value: unknown): string | null {
    if (typeof value === "string") return value.trim() || null;
    if (typeof value === "number") return String(value);
    return null;
}

/**
 * Extract source-agnostic facts from a document envelope. Pure + deterministic.
 * Emits facts only for values that genuinely fit a shared `IntakeFactType`.
 */
export function extractFactsFromDocument(envelope: IntakeSourceEnvelope): IntakeFactExtractionResult {
    const facts: IntakeFact[] = [];
    const metadata = (envelope.metadata ?? {}) as Record<string, unknown>;
    const rawMaterial = (typeof envelope.raw_material === "object" && envelope.raw_material) || {};
    const fileName = readString((rawMaterial as Record<string, unknown>).file_name) ?? "";
    const title = readString((rawMaterial as Record<string, unknown>).title) ?? "";

    const pushed = new Set<string>();
    const push = (fact: IntakeFact) => {
        if (pushed.has(fact.fact_id)) return;
        pushed.add(fact.fact_id);
        facts.push(fact);
    };

    for (const [rawKey, rawVal] of Object.entries(metadata)) {
        const key = normalizeKey(rawKey);
        const value = readString(rawVal);
        if (!value) continue;
        const factId = `doc:${key}`;
        const evidence = `${DOC_META_EVIDENCE_PREFIX}${key}`;

        // 1) date (value-driven)
        const date = parseFlexibleDate(value);
        if (date) {
            push({
                fact_id: factId,
                fact_type: "date",
                raw_value: value,
                normalized_value: date,
                confidence: metaConfidence(),
                validation_state: "valid",
                evidence,
            });
            continue;
        }

        // 2) amount (currency-shaped)
        const amount = normalizeAmount(value);
        if (amount) {
            push({
                fact_id: factId,
                fact_type: "amount",
                raw_value: value,
                normalized_value: amount,
                confidence: metaConfidence(),
                validation_state: "valid",
                evidence,
            });
            continue;
        }

        // 3) child name (key-aliased; the only person we infer from a document)
        if (CHILD_NAME_ALIASES.includes(key)) {
            push({
                fact_id: factId,
                fact_type: "person_name",
                raw_value: value,
                normalized_value: value,
                confidence: metaConfidence(),
                validation_state: "valid",
                evidence,
                role_hint: "child",
            });
            continue;
        }

        // 4) contact facts (generic, reusable)
        if (EMAIL_ALIASES.includes(key) || /@/.test(value)) {
            push({ fact_id: factId, fact_type: "email", raw_value: value, normalized_value: value.toLowerCase(), confidence: metaConfidence(), validation_state: "unknown", evidence });
            continue;
        }
        if (PHONE_ALIASES.includes(key)) {
            push({ fact_id: factId, fact_type: "phone", raw_value: value, normalized_value: value, confidence: metaConfidence(), validation_state: "unknown", evidence });
            continue;
        }
        if (DOB_ALIASES.includes(key)) {
            const dob = parseFlexibleDate(value);
            if (dob) push({ fact_id: factId, fact_type: "dob", raw_value: value, normalized_value: dob, confidence: metaConfidence(), validation_state: "valid", evidence, role_hint: "child" });
            continue;
        }
        if (AGE_ALIASES.includes(key)) {
            const n = Number(value);
            if (!Number.isNaN(n)) push({ fact_id: factId, fact_type: "age_years", raw_value: value, normalized_value: n, confidence: metaConfidence(), validation_state: "valid", evidence, role_hint: "child" });
            continue;
        }
        // else: org names (agency/payer) and misc — not a shared fact_type; left on envelope.metadata.
    }

    // Filename/title date as a weaker fallback (single, unambiguous only).
    const fileDate = singleDateInText(`${fileName} ${title}`);
    if (fileDate) {
        push({
            fact_id: "doc:filename_date",
            fact_type: "date",
            raw_value: fileDate,
            normalized_value: fileDate,
            confidence: "medium",
            validation_state: "valid",
            evidence: DOC_FILENAME_EVIDENCE,
        });
    }

    return { source: envelope, facts };
}
