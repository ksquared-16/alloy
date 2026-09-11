/**
 * Processing's ACTIONABLE WORK contract — which cases are cross-record work awaiting an operator.
 *
 * This exists because the answer was previously implicit, and the implicit answer was wrong. The
 * Work Items projection consumed `/api/admin/processing/queue` with no parameters, which is a
 * RECENCY PAGE: the newest `DEFAULT_QUEUE_LIMIT` (25) cases, `created_at desc`. Nothing about that
 * page is a statement of what needs attention — it is a statement about what arrived most recently.
 *
 * The observable consequence was that a tenant with 6 `needs_resolution` cases projected NONE of
 * them into Work Items while projecting 19 `received` ones. That looked like a semantic decision
 * ("only `received` is actionable") and was not one: the six were simply older than the page.
 *
 * So the cohort is declared here, as a predicate over STATUS, and the page size is no longer load
 * bearing.
 *
 * ── What counts, and why ──────────────────────────────────────────────────────────────────────
 *
 * `received`          A case is OPENED at this status (`openProcessingCaseFromSource`) and nothing
 *                     advances it on its own. It sits until an operator opens it. That is work.
 *
 * `processing`        Automation is mid-flight. Included deliberately: a case wedged here is
 *                     invisible to every other surface, and "the system is working on it" is a
 *                     claim that stops being true the moment the work stalls. Surfacing it is how
 *                     a stall becomes observable instead of silent.
 *
 * `needs_review`      The operator is explicitly asked to review. Work by definition.
 *
 * `needs_resolution`  The operator is explicitly asked to DECIDE — "Needs a decision"
 *                     (`POS_STATUS_LABELS`). Identity resolution parks a case here when it cannot
 *                     proceed without a human (`canonicalResolutionEngine`, `formIntakeAdapter`),
 *                     and `decisionOutcomes` records it as NON-TERMINAL: "keep it for further
 *                     review". A case that is blocking a canonical record commit pending a human
 *                     decision is the strongest form of actionable cross-record work there is.
 *
 * ── What does not count ───────────────────────────────────────────────────────────────────────
 *
 * `ready`             Ready to GENERATE a form — a Studio authoring step, not cross-record work.
 * `completed`         Terminal.
 * `archived`          Terminal.
 *
 * `ready` is excluded here to match the projection adapter, which already routes it to its own
 * `ready_generate` lane and declines to project it. This module does not change that judgement; it
 * only stops the input from being truncated before the judgement is ever applied.
 */

import type { ProcessingCaseStatus } from "@/lib/pos/processingCase/readModel/types";

/** Statuses that constitute actionable cross-record work awaiting an operator. */
export const PROCESSING_ACTIONABLE_STATUSES: ProcessingCaseStatus[] = [
    "received",
    "processing",
    "needs_review",
    "needs_resolution",
];

/** Terminal statuses — a case here is concluded and is not work. */
export const PROCESSING_TERMINAL_STATUSES: ProcessingCaseStatus[] = ["completed", "archived"];

export function isProcessingActionableStatus(status: string | null | undefined): boolean {
    return PROCESSING_ACTIONABLE_STATUSES.includes(String(status ?? "") as ProcessingCaseStatus);
}

export function isProcessingTerminalStatus(status: string | null | undefined): boolean {
    return PROCESSING_TERMINAL_STATUSES.includes(String(status ?? "") as ProcessingCaseStatus);
}

/**
 * Page size for the actionable read.
 *
 * Capped at the queue endpoint's `MAX_QUEUE_LIMIT`. This is a ceiling, not a window: the read is
 * already narrowed to the actionable statuses, so it is not competing with completed/archived
 * history for room the way the unfiltered recency page was.
 */
export const PROCESSING_ACTIONABLE_LIMIT = 100;

/** Query string for the actionable cohort read against `/api/admin/processing/queue`. */
export function processingActionableQueryString(): string {
    const params = new URLSearchParams();
    params.set("status", PROCESSING_ACTIONABLE_STATUSES.join(","));
    params.set("limit", String(PROCESSING_ACTIONABLE_LIMIT));
    return params.toString();
}
