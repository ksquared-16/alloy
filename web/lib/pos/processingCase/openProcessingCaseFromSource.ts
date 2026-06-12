/**
 * POS-FP1 — open a Processing Case from a source (idempotent, one primary).
 *
 * Pure orchestration over injected storage deps:
 * - Idempotent: if the source is already the primary of a case, return that case.
 * - One primary: a newly opened case gets exactly one primary source row.
 * - Related sources are attached separately and never create a competing runtime.
 *
 * No source data is copied; the case only references the source by kind + id.
 */

import type { ProcessingCaseDeps, ProcessingCaseSourceKind } from "./types";

export interface OpenProcessingCaseResult {
    processingCaseId: string;
    /** true when a new case was created; false when an existing case was returned (idempotent hit). */
    created: boolean;
}

export async function openProcessingCaseFromSource(
    deps: ProcessingCaseDeps,
    args: {
        orgId: string;
        sourceKind: ProcessingCaseSourceKind;
        sourceId: string;
        caseType?: string | null;
    }
): Promise<OpenProcessingCaseResult> {
    const existingCaseId = await deps.findCaseIdByPrimarySource({
        orgId: args.orgId,
        sourceKind: args.sourceKind,
        sourceId: args.sourceId,
    });
    if (existingCaseId) {
        return { processingCaseId: existingCaseId, created: false };
    }

    const inserted = await deps.insertCase({
        orgId: args.orgId,
        status: "received",
        caseType: args.caseType ?? null,
    });
    await deps.insertSource({
        orgId: args.orgId,
        processingCaseId: inserted.id,
        sourceKind: args.sourceKind,
        sourceId: args.sourceId,
        role: "primary",
    });
    return { processingCaseId: inserted.id, created: true };
}

/** Attach an additional (related) source to an existing case. Never a primary; never forks the case. */
export async function attachRelatedSource(
    deps: ProcessingCaseDeps,
    args: {
        orgId: string;
        processingCaseId: string;
        sourceKind: ProcessingCaseSourceKind;
        sourceId: string;
    }
): Promise<void> {
    await deps.insertSource({
        orgId: args.orgId,
        processingCaseId: args.processingCaseId,
        sourceKind: args.sourceKind,
        sourceId: args.sourceId,
        role: "related",
    });
}
