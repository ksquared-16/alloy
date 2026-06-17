/**
 * POS-FP10 — persist + read extraction proposals on an existing Processing Case.
 *
 * Storage (NO schema change): reuses `processing_cases.metadata`, under a dedicated
 * `extraction` key — sibling to `metadata.classification`. Annotation only:
 *   - NEVER writes lifecycle `status`
 *   - NEVER writes `case_type` (that stays owned by classification)
 *   - NEVER touches sources, recommendations, documents, or any business record
 *   - merges into existing metadata (classification + operational_result preserved)
 *
 * These are PROPOSED values; nothing here commits or matches.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionProposalSet, StoredExtractionProposalSet } from "./types";

/** Stamp the deterministic proposal set with persistence time. */
export function toStoredExtraction(
    set: ExtractionProposalSet,
    now: Date = new Date()
): StoredExtractionProposalSet {
    return { ...set, extracted_at: now.toISOString() };
}

/** Write proposals onto an existing case's `metadata.extraction`. Annotation only. */
export async function dbStoreProcessingCaseExtraction(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; set: ExtractionProposalSet; now?: Date }
): Promise<StoredExtractionProposalSet> {
    const stored = toStoredExtraction(args.set, args.now ?? new Date());

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

/** Pure: parse a case's metadata jsonb into a stored extraction set (or null). For the read model. */
export function parseStoredExtraction(metadata: unknown): StoredExtractionProposalSet | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>).extraction;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.classification_key !== "string" || !Array.isArray(e.proposals)) return null;
    return {
        classification_key: e.classification_key as StoredExtractionProposalSet["classification_key"],
        proposals: e.proposals as StoredExtractionProposalSet["proposals"],
        extractor_version: typeof e.extractor_version === "string" ? e.extractor_version : "unknown",
        extracted_at: typeof e.extracted_at === "string" ? e.extracted_at : "",
    };
}
