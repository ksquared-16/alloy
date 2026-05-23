import {
    fetchWorkUnitOperationalBootstrapSession,
    type WorkUnitBootstrapOwnership,
} from "@/lib/adminV2/workUnitBootstrapClientSession";

/** Parse `/adminV2/workspace/dept/:deptId/work-unit/:wuId` from a dept oper console href. */
export function parseWorkUnitBootstrapOwnershipFromHref(
    href: string,
    departmentId: string,
    selectedSiteId: string | null
): WorkUnitBootstrapOwnership | null {
    if (!href.trim() || !departmentId.trim()) return null;
    try {
        const base =
            typeof window !== "undefined" ? window.location.origin : "https://alloy.local";
        const pathname = new URL(href, base).pathname;
        const match = pathname.match(/\/work-unit\/([^/]+)/);
        if (!match?.[1]) return null;
        return {
            departmentId,
            workUnitId: decodeURIComponent(match[1]),
            selectedSiteId,
        };
    } catch {
        return null;
    }
}

/** Start canonical WU operational-bootstrap inflight before hard navigation from /dept. */
export function prefetchWorkUnitOperationalBootstrapFromDeptHref(
    href: string,
    departmentId: string,
    selectedSiteId: string | null
): void {
    const ownership = parseWorkUnitBootstrapOwnershipFromHref(href, departmentId, selectedSiteId);
    if (!ownership) return;
    void fetchWorkUnitOperationalBootstrapSession(ownership, "prefetch").catch(() => {
        /* prefetch is best-effort */
    });
}
