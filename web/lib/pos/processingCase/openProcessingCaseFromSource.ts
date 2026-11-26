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

/**
 * The atomic open was required and is not available (no atomic port, or the database has not received
 * `open_processing_case_with_primary_source` — PGRST202 / 42883). Thrown BEFORE any read or write of the legacy
 * sequence: a caller that requires atomicity gets no case rather than a case that can be orphaned.
 */
export class AtomicProcessingOpenUnavailableError extends Error {
    readonly code = "processing_atomic_open_unavailable" as const;
    constructor() {
        super("open_processing_case_with_primary_source is not available; the non-atomic sequence is refused for this caller");
        this.name = "AtomicProcessingOpenUnavailableError";
    }
}

export function isAtomicProcessingOpenUnavailable(e: unknown): e is AtomicProcessingOpenUnavailableError {
    return e instanceof AtomicProcessingOpenUnavailableError;
}

export async function openProcessingCaseFromSource(
    deps: ProcessingCaseDeps,
    args: {
        orgId: string;
        sourceKind: ProcessingCaseSourceKind;
        sourceId: string;
        caseType?: string | null;
        /**
         * Refuse the pre-migration fallback. Set by callers whose sources can be delivered concurrently by design (D10
         * inbound attachments: provider redelivery), where the non-atomic sequence's orphan case is a real outcome.
         * Existing callers keep the fallback so code deployed before the migration behaves exactly as before.
         */
        requireAtomic?: boolean;
    }
): Promise<OpenProcessingCaseResult> {
    // The atomic path: one transaction for the case and its primary source, so a lost race leaves no orphan case.
    if (deps.openCaseWithPrimarySource) {
        const atomic = await deps.openCaseWithPrimarySource({
            orgId: args.orgId,
            sourceKind: args.sourceKind,
            sourceId: args.sourceId,
            caseType: args.caseType ?? null,
        });
        if (atomic) return atomic;
    }
    if (args.requireAtomic) throw new AtomicProcessingOpenUnavailableError();

    // Pre-migration fallback (and pure test ports without the atomic method). Not atomic: a concurrent open can leave
    // the losing case without a source. Kept only so code deployed before the migration behaves exactly as before.
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
