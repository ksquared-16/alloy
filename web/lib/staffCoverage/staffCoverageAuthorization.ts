/**
 * Coverage authorization — server-enforced, org first and site second.
 *
 * Hiding a button is not a boundary. Every Coverage read and every Coverage
 * mutation resolves scope here, on the server, from the actor's access context,
 * so a direct API call reaches exactly the same verdict a rendered surface would.
 *
 * Org scope needs no decision: `ctx.orgId` is server-resolved and every Coverage
 * query and RPC is org-qualified, so a cross-org id simply finds nothing. Site
 * scope does need a decision, because a restricted operator holds a real subset
 * of sites and Coverage is always somewhere.
 *
 * Reads NARROW; writes REFUSE. Asking to read a site you do not hold returns an
 * empty result rather than an error — the same shape the attendance queues use,
 * and it avoids turning a read into an existence oracle. Asking to WRITE one is a
 * different act, and it is refused by name.
 */

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { narrowSitesToScope } from "@/lib/childcareOperational/attendance/attendancePermissions";

export type CoverageScopeVerdict = { allowed: true } | { allowed: false; code: string; message: string };

/**
 * A missing access scope is treated as unrestricted on purpose: it is the shape
 * every server context that never computed site restrictions carries, and the
 * callers that DO restrict always pass real dimensions. Inverting this default
 * would fail closed on trusted internal paths that have no site notion at all,
 * which reads as a Coverage bug rather than as the security posture it is.
 */
export function coverageSiteWriteAllowed(
    accessScope: AdminAccessScopeDimensions | null | undefined,
    siteLocationId: string | null | undefined
): CoverageScopeVerdict {
    const site = (siteLocationId ?? "").trim();
    if (!site) {
        return { allowed: false, code: "missing_site", message: "Coverage must name the site it happens at." };
    }
    if (!accessScope || accessScope.siteScope !== "restricted") return { allowed: true };

    const allowed = [...(accessScope.allowedSiteLocationIds ?? [])].map(String);
    if (allowed.includes(site)) return { allowed: true };
    return {
        allowed: false,
        code: "site_out_of_scope",
        message: "You do not have access to that site, so Coverage cannot be planned there.",
    };
}

/**
 * The site allowlist a Coverage read may use.
 *
 * `null` means org-wide. An empty array means "restricted, and the requested site
 * is not held" — a real answer, distinct from `null`, and the caller must return
 * nothing rather than falling back to org-wide.
 */
export function coverageReadableSites(
    accessScope: AdminAccessScopeDimensions | null | undefined,
    requestedSiteLocationId: string | null | undefined
): string[] | null {
    if (!accessScope) {
        const requested = (requestedSiteLocationId ?? "").trim();
        return requested ? [requested] : null;
    }
    return narrowSitesToScope(accessScope, requestedSiteLocationId).siteLocationIds;
}
