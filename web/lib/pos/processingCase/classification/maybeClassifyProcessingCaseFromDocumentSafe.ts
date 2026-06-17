/**
 * POS-FP9 — best-effort: classify a Processing Case from its document signals.
 *
 * Called right after a non-form case is opened (e.g. the document upload route).
 * It classifies from cheap document metadata and stores the result on the case.
 *
 * Best-effort: NEVER throws, NEVER blocks the caller (mirrors the `*Safe` pattern).
 * Classification ONLY — no extraction, no record writes, no status change.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyNonFormSource } from "./classifyNonFormSource";
import { dbStoreProcessingCaseClassification } from "./processingCaseClassificationDb";
import type { StoredProcessingClassification } from "./types";

export interface DocumentClassificationSignals {
    sourceKind?: string;
    fileName?: string | null;
    mimeType?: string | null;
    docType?: string | null;
    title?: string | null;
    metadata?: Record<string, unknown> | null;
}

export async function maybeClassifyProcessingCaseFromDocumentSafe(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; document: DocumentClassificationSignals }
): Promise<StoredProcessingClassification | null> {
    try {
        if (!args.orgId || !args.caseId) return null;
        const result = classifyNonFormSource({
            sourceKind: args.document.sourceKind ?? "document",
            fileName: args.document.fileName,
            mimeType: args.document.mimeType,
            docType: args.document.docType,
            title: args.document.title,
            metadata: args.document.metadata,
        });
        return await dbStoreProcessingCaseClassification(supabase, {
            orgId: args.orgId,
            caseId: args.caseId,
            result,
        });
    } catch (e) {
        console.warn(
            "[maybeClassifyProcessingCaseFromDocumentSafe]",
            e instanceof Error ? e.message : e
        );
        return null;
    }
}
