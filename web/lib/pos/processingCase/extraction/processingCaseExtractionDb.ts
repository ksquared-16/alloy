/**
 * POS-FP10 (intake-aligned) — persist + read the intake extraction result on a case.
 *
 * Storage (NO schema change): `processing_cases.metadata.extraction` holds the shared
 * intake result — `{ source, facts, candidates, review_warnings, extractor_version,
 * extracted_at }`. Annotation only:
 *   - NEVER writes lifecycle `status`
 *   - NEVER writes `case_type` (owned by classification)
 *   - NEVER touches sources, recommendations, documents, or business records
 *   - merges into existing metadata (classification + operational_result preserved)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessingExtractionResult, StoredProcessingExtraction } from "./types";

/** Stamp the deterministic result with persistence time. */
export function toStoredExtraction(
    result: ProcessingExtractionResult,
    now: Date = new Date()
): StoredProcessingExtraction {
    return { ...result, extracted_at: now.toISOString() };
}

/** Write the intake result onto an existing case's `metadata.extraction`. Annotation only. */
export async function dbStoreProcessingCaseExtraction(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; result: ProcessingExtractionResult; now?: Date }
): Promise<StoredProcessingExtraction> {
    const stored = toStoredExtraction(args.result, args.now ?? new Date());

    const { data: existing, error: readErr } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const baseMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const metadata = { ...baseMeta, extraction: stored };

    // Only `metadata` is written — no case_type, no status, nothing else.
    const { error } = await supabase
        .from("processing_cases")
        .update({ metadata })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) throw new Error(error.message);

    return stored;
}

/** Pure: parse a case's metadata jsonb into a stored intake extraction (or null). For the read model. */
export function parseStoredExtraction(metadata: unknown): StoredProcessingExtraction | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>).extraction;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const e = raw as Record<string, unknown>;
    if (!e.source || typeof e.source !== "object") return null;
    if (!Array.isArray(e.facts) || !Array.isArray(e.candidates)) return null;
    return {
        source: e.source as StoredProcessingExtraction["source"],
        facts: e.facts as StoredProcessingExtraction["facts"],
        candidates: e.candidates as StoredProcessingExtraction["candidates"],
        review_warnings: Array.isArray(e.review_warnings) ? (e.review_warnings as string[]) : [],
        extractor_version: typeof e.extractor_version === "string" ? e.extractor_version : "unknown",
        extracted_at: typeof e.extracted_at === "string" ? e.extracted_at : "",
    };
}
