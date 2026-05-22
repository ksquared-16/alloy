/**
 * Hard gate: while pending, AdminV2 shell sidecars must not issue network requests.
 * Cleared only by explicit primary paint marks (WU primary lane, dept ready, drawer primary).
 */

let adminV2PrimarySurfacePending = false;
let pendingReason: string | null = null;

export function isAdminV2PrimarySurfacePending(): boolean {
    return adminV2PrimarySurfacePending;
}

export function setAdminV2PrimarySurfacePending(pending: boolean, reason: string): void {
    adminV2PrimarySurfacePending = pending;
    pendingReason = pending ? reason : null;
    if (typeof window !== "undefined") {
        console.info("[adminv2-primary-gate]", { pending, reason });
    }
}

export function adminV2PrimarySurfacePendingReason(): string | null {
    return pendingReason;
}

/** Call when a primary paint mark is recorded — ends the hard sidecar block. */
export function clearAdminV2PrimarySurfacePendingFromMark(mark: string): void {
    if (!adminV2PrimarySurfacePending) return;
    setAdminV2PrimarySurfacePending(false, `mark:${mark}`);
}
