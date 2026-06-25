/**
 * POS-FP9 — persist + read a classification on an existing Processing Case.
 *
 * Storage (NO schema change): reuses the columns that already exist —
 *   - `processing_cases.case_type`            ← classification_key (queryable, already surfaced)
 *   - `processing_cases.metadata.classification` ← full result + classified_at
 *
 * This NEVER changes lifecycle `status`, NEVER touches any business record, and
 * NEVER opens a case. It only annotates a case that already exists. Mirrors the
 * FP5 `dbCompleteProcessingCaseWithResult` merge pattern.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessingClassificationResult, StoredProcessingClassification } from "./types";

/** Stamp the deterministic result with persistence time (kept out of the pure classifier). */
export function toStoredClassification(
    result: ProcessingClassificationResult,
    now: Date = new Date(),
    correctedAt?: Date
): StoredProcessingClassification {
    const stored: StoredProcessingClassification = { ...result, classified_at: now.toISOString() };
    if (correctedAt) stored.corrected_at = correctedAt.toISOString();
    return stored;
}

/**
 * Write the classification onto an existing case. Annotation only:
 * updates `case_type` + `metadata.classification`; leaves `status` untouched.
 */
export async function dbStoreProcessingCaseClassification(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        caseId: string;
        result: ProcessingClassificationResult;
        now?: Date;
        /** When set, stamps `corrected_at` (operator confirm/correct provenance). */
        correctedAt?: Date;
    }
): Promise<StoredProcessingClassification> {
    const stored = toStoredClassification(args.result, args.now ?? new Date(), args.correctedAt);

    const { data: existing, error: readErr } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const baseMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const metadata = { ...baseMeta, classification: stored };

    const { error } = await supabase
        .from("processing_cases")
        .update({ case_type: stored.classification_key, metadata })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) throw new Error(error.message);

    return stored;
}

/** Pure: parse a case's metadata jsonb into a stored classification (or null). For the read model. */
export function parseStoredClassification(metadata: unknown): StoredProcessingClassification | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>).classification;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.classification_key !== "string" || typeof c.status !== "string") return null;
    const parsed: StoredProcessingClassification = {
        classification_key: c.classification_key as StoredProcessingClassification["classification_key"],
        label: typeof c.label === "string" ? c.label : (c.classification_key as string),
        confidence: typeof c.confidence === "number" ? c.confidence : 0,
        signals: Array.isArray(c.signals) ? (c.signals as StoredProcessingClassification["signals"]) : [],
        status: c.status as StoredProcessingClassification["status"],
        classifier_version: typeof c.classifier_version === "string" ? c.classifier_version : "unknown",
        classified_at: typeof c.classified_at === "string" ? c.classified_at : "",
    };
    if (typeof c.corrected_at === "string") parsed.corrected_at = c.corrected_at;
    return parsed;
}
