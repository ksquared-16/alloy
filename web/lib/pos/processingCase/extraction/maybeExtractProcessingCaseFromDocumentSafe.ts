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
