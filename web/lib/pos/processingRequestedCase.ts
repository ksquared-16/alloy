"use client";

/**
 * Processing's REQUESTED CASE owner — the pending-selection seam the Mailroom never had.
 *
 * ── The defect this closes ────────────────────────────────────────────────────────────────────
 *
 * Opening Processing with an explicit `caseId` set the selection in `ProcessingModal` state, and
 * `usePosCase` loaded that case's detail by id, so the CANVAS was right. The QUEUE RAIL was not:
 * `ProcessingQueueList` renders exactly the rows in the warm queue snapshot, and that snapshot is a
 * recency page (newest 25, `created_at desc`). A requested case older than that page — or one
 * collapsed away by the duplicate-document grouping — appears nowhere in the rail. The rail then
 * shows its default lane with nothing highlighted, and the operator reads the surface the way any
 * operator would: as "Processing ignored what I clicked and gave me its own list".
 *
 * The rail was treating "is this case on the current page?" as if it were "does this case exist?".
 * Membership in the default lane is not a precondition for selecting a case, and this module is
 * what makes that true: the requested subject is resolved on its own terms, by id, and carried into
 * the rail regardless of where it falls in the ordering.
 *
 * ── Shape ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Deliberately the same shape Communications already uses for the identical problem
 * (`setCommandCenterPendingSelection`): a module-level store with a subscribe seam, set by the
 * surface that receives the open intent and read by the surface that renders the queue. Processing
 * having no equivalent is precisely why its deep links degraded to "opened the workspace" while
 * Communications' deep links land on the thread.
 */

import type { ProcessingCaseQueueRow } from "@/lib/pos/processingCase/readModel/types";

export interface ProcessingRequestedCaseState {
    /** The case the operator asked for, or null when Processing was opened without a subject. */
    caseId: string | null;
    /**
     * The requested case's queue row, fetched by id when it was absent from the loaded page.
     * Null while unresolved, when the case is already on the page, or when resolution failed.
     */
    row: ProcessingCaseQueueRow | null;
    /** True while the by-id resolution is in flight. */
    resolving: boolean;
}

interface QueueResponse {
    data?: { rows?: ProcessingCaseQueueRow[] };
}

let state: ProcessingRequestedCaseState = { caseId: null, row: null, resolving: false };
let inflight: string | null = null;
const listeners = new Set<() => void>();

function publish(next: ProcessingRequestedCaseState): void {
    state = next;
    listeners.forEach((l) => l());
}

export function getProcessingRequestedCase(): ProcessingRequestedCaseState {
    return state;
}

export function subscribeProcessingRequestedCase(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Record the case Processing was asked to open.
 *
 * Called by the surface that receives the open intent, NOT by the caller that dispatched it — every
 * entry point (deep-link intent, the already-open `adminv2:open-processing-case` event, an Overview
 * card, a fresh import) therefore gets the same behaviour without each one having to remember to
 * ask for it.
 */
export function setProcessingRequestedCase(caseId: string | null): void {
    const id = caseId?.trim() || null;
    if (id === state.caseId) return;
    inflight = null;
    publish({ caseId: id, row: null, resolving: false });
}

export function clearProcessingRequestedCase(): void {
    setProcessingRequestedCase(null);
}

/**
 * Fetch the requested case's queue row by id.
 *
 * Only needed when the case is absent from the loaded page — the caller checks that first, so a
 * requested case that is already visible costs no request. Best-effort: a failure leaves `row`
 * null and the rail simply renders what it has, which is the pre-existing behaviour rather than a
 * new failure mode.
 */
export async function resolveProcessingRequestedCase(caseId: string): Promise<void> {
    const id = caseId.trim();
    if (!id || id !== state.caseId || inflight === id) return;
    if (state.row?.id === id) return;

    inflight = id;
    publish({ ...state, resolving: true });
    try {
        const res = await fetch(`/api/admin/processing/queue?case_ids=${encodeURIComponent(id)}`, {
            credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as QueueResponse;
        const row = (body.data?.rows ?? []).find((r) => r.id === id) ?? null;
        // The request may have been superseded while in flight (operator clicked another case).
        if (state.caseId === id) publish({ caseId: id, row, resolving: false });
    } catch {
        if (state.caseId === id) publish({ caseId: id, row: null, resolving: false });
    } finally {
        if (inflight === id) inflight = null;
    }
}

/**
 * The rows the rail should render: the loaded page, plus the requested case when the page does not
 * contain it.
 *
 * Pure, so the ordering rule is testable without a DOM. The requested case leads — it is the reason
 * the surface was opened, and burying it inside a lane the operator has to hunt through is the same
 * failure in a quieter form.
 */
export function mergeRequestedCaseIntoRows(
    rows: ProcessingCaseQueueRow[],
    requested: ProcessingRequestedCaseState,
): ProcessingCaseQueueRow[] {
    if (!requested.caseId) return rows;
    if (rows.some((r) => r.id === requested.caseId)) return rows;
    if (!requested.row) return rows;
    return [requested.row, ...rows];
}
