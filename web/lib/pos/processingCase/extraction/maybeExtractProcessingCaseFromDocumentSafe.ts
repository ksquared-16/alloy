/**
 * POS-FP10 (intake-aligned) — best-effort: run the shared intake pipeline for a
 * classified document case and store the result.
 *
 *   document signals → IntakeSourceEnvelope → IntakeFact[] → IntakeFieldCandidate[]
 *
 * Called after a document case is opened AND classified (e.g. the upload route).
 * Best-effort: NEVER throws, NEVER blocks the caller. Review-only — no extraction of
 * record truth, no matching, no commit, no status change.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessingClassificationKey } from "../classification/types";
import { buildDocumentSourceEnvelope, type DocumentSignals } from "./documentFacts";
import { buildProcessingExtraction } from "./buildProcessingExtraction";
import { dbStoreProcessingCaseExtraction } from "./processingCaseExtractionDb";
import type { StoredProcessingExtraction } from "./types";

export type { DocumentSignals as ExtractionDocumentSignals } from "./documentFacts";

export async function maybeExtractProcessingCaseFromDocumentSafe(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        caseId: string;
        classificationKey: ProcessingClassificationKey;
        document: DocumentSignals;
        /** Source id for the envelope (the document id); falls back to the case id. */
        sourceId?: string;
    }
): Promise<StoredProcessingExtraction | null> {
    try {
        if (!args.orgId || !args.caseId) return null;
        const now = new Date();
        const envelope = buildDocumentSourceEnvelope(args.document, {
            sourceId: args.sourceId ?? args.caseId,
            capturedAt: now.toISOString(),
        });
        const result = buildProcessingExtraction({ envelope, classificationKey: args.classificationKey });
        return await dbStoreProcessingCaseExtraction(supabase, {
            orgId: args.orgId,
            caseId: args.caseId,
            result,
            now,
        });
    } catch (e) {
        console.warn("[maybeExtractProcessingCaseFromDocumentSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}

/**
 * Best-effort re-extraction for a case whose classification was just corrected.
 * Loads the case's PRIMARY document source and re-runs the pipeline with the new
 * classification, so candidates are never left stale (correcting to `unknown`
 * re-extracts to zero candidates, clearing the old ones). NEVER throws.
 *
 * No-op when the primary source isn't a document.
 */
export async function maybeReextractProcessingCaseAfterClassificationSafe(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; classificationKey: ProcessingClassificationKey }
): Promise<StoredProcessingExtraction | null> {
    try {
        if (!args.orgId || !args.caseId) return null;
        const { data: src } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", args.orgId)
            .eq("processing_case_id", args.caseId)
            .eq("role", "primary")
            .maybeSingle();
        const source = src as { source_kind?: string; source_id?: string } | null;
        if (!source || source.source_kind !== "document" || !source.source_id) return null;

        const { data: docRow } = await supabase
            .from("documents")
            .select("original_filename, title, doc_type, metadata")
            .eq("org_id", args.orgId)
            .eq("id", source.source_id)
            .maybeSingle();
        const d = (docRow ?? {}) as {
            original_filename?: string | null;
            title?: string | null;
            doc_type?: string | null;
            metadata?: Record<string, unknown> | null;
        };

        return await maybeExtractProcessingCaseFromDocumentSafe(supabase, {
            orgId: args.orgId,
            caseId: args.caseId,
            classificationKey: args.classificationKey,
            sourceId: source.source_id,
            document: {
                fileName: d.original_filename ?? null,
                title: d.title ?? null,
                docType: d.doc_type ?? null,
                metadata: d.metadata ?? null,
            },
        });
    } catch (e) {
        console.warn("[maybeReextractProcessingCaseAfterClassificationSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}
