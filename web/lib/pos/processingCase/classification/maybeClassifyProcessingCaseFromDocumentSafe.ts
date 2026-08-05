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
import { governSourceClassification } from "./governSourceClassification";
import type {
    SourceClassificationGovernanceDeps,
    SourceClassificationGovernanceResult,
} from "./governSourceClassification";
import type { ClassifyNonFormSourceInput, StoredProcessingClassification } from "./types";

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
    args: {
        orgId: string;
        caseId: string;
        document: DocumentClassificationSignals;
        /**
         * Trust governance (Phase 1.1). Additive and suppressible: **presence
         * enables it**, omission suppresses it entirely.
         *
         * Opt-in rather than default-on for two reasons. It keeps every existing
         * caller and test byte-identical without editing them, and it makes the
         * suppressed arm — the control that proves Processing-visible output is
         * unchanged — the natural default rather than a special mode.
         *
         * Production passes `{}` to accept the real repository and actor.
         */
        governance?: SourceClassificationGovernanceDeps;
        /**
         * Receives the governance outcome, including a governance GAP. Optional
         * so the existing return contract is untouched — a caller that ignores
         * it behaves exactly as before.
         */
        onGovernanceResult?: (result: SourceClassificationGovernanceResult) => void;
    }
): Promise<StoredProcessingClassification | null> {
    let classifierInput: ClassifyNonFormSourceInput | null = null;
    let stored: StoredProcessingClassification | null = null;

    try {
        if (!args.orgId || !args.caseId) return null;
        classifierInput = {
            sourceKind: args.document.sourceKind ?? "document",
            fileName: args.document.fileName,
            mimeType: args.document.mimeType,
            docType: args.document.docType,
            title: args.document.title,
            metadata: args.document.metadata,
        };
        const result = classifyNonFormSource(classifierInput);
        // Processing writes FIRST and is never blocked by Trust. See the
        // transaction-boundary note in `governSourceClassification.ts`.
        stored = await dbStoreProcessingCaseClassification(supabase, {
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

    // Governance is recorded only for a classification Processing actually
    // stored, and can neither change nor withhold the value returned below.
    if (!args.governance || !classifierInput || !stored) {
        args.onGovernanceResult?.({ status: "disabled" });
        return stored;
    }

    const governance = await governSourceClassification(supabase, {
        orgId: args.orgId,
        caseId: args.caseId,
        input: classifierInput,
        result: stored,
        deps: args.governance,
    });
    args.onGovernanceResult?.(governance);

    return stored;
}
