/**
 * BOS proposal lifecycle — status transitions (validation helpers only).
 * @see docs/product/bos-foundation.md
 */

import type { BosProposalStatus } from "@/lib/bos/bosCapability";

const TERMINAL_STATUSES: ReadonlySet<BosProposalStatus> = new Set([
    "applied",
    "rejected",
    "superseded",
    "failed",
    "expired",
]);

/** Statuses from which an apply attempt is allowed (after policy approval). */
const APPLY_ELIGIBLE_STATUSES: ReadonlySet<BosProposalStatus> = new Set([
    "validated",
    "approved",
]);

export function isBosProposalTerminal(status: BosProposalStatus): boolean {
    return TERMINAL_STATUSES.has(status);
}

export function canBosProposalApply(status: BosProposalStatus): boolean {
    return APPLY_ELIGIBLE_STATUSES.has(status);
}
