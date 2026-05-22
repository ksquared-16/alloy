/**
 * Hard gate: while pending, AdminV2 shell sidecars must not issue network requests.
 * Cleared only by explicit primary paint marks (WU primary lane, dept ready, drawer primary).
 */

let adminV2PrimarySurfacePending = false;
let adminV2DrawerOpenPending = false;
let pendingReason: string | null = null;

export function isAdminV2PrimarySurfacePending(): boolean {
    return adminV2PrimarySurfacePending;
}

export function isAdminV2DrawerOpenPending(): boolean {
    return adminV2DrawerOpenPending;
}

/** True while WU/dept route or drawer open is on the critical path — sidecars must not hit the network. */
export function isAdminV2SidecarNetworkBlocked(): boolean {
    return adminV2PrimarySurfacePending || adminV2DrawerOpenPending;
}

export function setAdminV2DrawerOpenPending(pending: boolean, reason: string): void {
    adminV2DrawerOpenPending = pending;
    if (typeof window !== "undefined") {
        console.info("[adminv2-primary-gate]", { drawer_pending: pending, reason });
    }
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
    if (mark === "drawer_primary_ready" || mark === "drawer_primary_ready_at") {
        setAdminV2DrawerOpenPending(false, `mark:${mark}`);
    }
    if (!adminV2PrimarySurfacePending) return;
    setAdminV2PrimarySurfacePending(false, `mark:${mark}`);
}
