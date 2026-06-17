/**
 * POS-FP10 — best-effort: produce + store extraction proposals for a classified case.
 *
 * Called after a document case is opened AND classified (e.g. the upload route). It
 * runs the deterministic extractor for the case's classification and stores the
 * proposals on the case. Best-effort: NEVER throws, NEVER blocks the caller.
 *
 * Proposals ONLY — no extraction of record truth, no matching, no commit, no status
 * change. If the classification has no field targets, or nothing can be honestly
 * proposed, it stores an empty proposal set (still no commit).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessingClassificationKey } from "../classification/types";
import { extractProposalsForClassification } from "./extractProposalsForClassification";
import { dbStoreProcessingCaseExtraction } from "./processingCaseExtractionDb";
import type { StoredExtractionProposalSet } from "./types";

export interface ExtractionDocumentSignals {
    fileName?: string | null;
    title?: string | null;
    docType?: string | null;
    metadata?: Record<string, unknown> | null;
    extractedData?: Record<string, unknown> | null;
    extractedText?: string | null;
}

export async function maybeExtractProcessingCaseFromDocumentSafe(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        caseId: string;
        classificationKey: ProcessingClassificationKey;
        document: ExtractionDocumentSignals;
    }
): Promise<StoredExtractionProposalSet | null> {
    try {
        if (!args.orgId || !args.caseId) return null;
        const set = extractProposalsForClassification({
            classificationKey: args.classificationKey,
            fileName: args.document.fileName,
            title: args.document.title,
            docType: args.document.docType,
            metadata: args.document.metadata,
            extractedData: args.document.extractedData,
            extractedText: args.document.extractedText,
        });
        return await dbStoreProcessingCaseExtraction(supabase, {
            orgId: args.orgId,
            caseId: args.caseId,
            set,
        });
    } catch (e) {
        console.warn("[maybeExtractProcessingCaseFromDocumentSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}
