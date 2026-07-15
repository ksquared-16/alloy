/**
 * Current workspace scope (Trust Closure). The authenticated org / principal / access-scope for the
 * live workspace session, published by `WorkspaceOrgProvider`. It lets non-React navigation
 * affordances (sidebar links, shell navigation) warm the Work Unit surface session under the SAME
 * org/user/scope the runtime seeds from — without threading React context through every call site.
 *
 * Module-scoped and single-tenant per browser session; cleared on org change / logout with the
 * rest of the workspace session state. Never used for authorization — only to key a client prefetch.
 */

import { clearRetainedOperatorContext } from "@/lib/presentation/runtime/workUnitOperatorContext";
import { clearWorkspaceSurfaceSessionCache } from "@/lib/presentation/runtime/workspaceSurfaceSessionCache";

export type CurrentWorkspaceScope = {
    orgId: string | null;
    userId: string | null;
    scopeFingerprint: string | null;
};

let current: CurrentWorkspaceScope = { orgId: null, userId: null, scopeFingerprint: null };

/**
 * Flush every retained operator surface (selection, scroll, workspace composition) whenever the
 * authenticated org / principal / access-scope changes. This is the production caller the retained
 * caches were built for: it guarantees a retained surface is NEVER restored across an org change,
 * a principal change, or a permission/access-scope change (scopeFingerprint encodes the access dims).
 * Cache KEYS already prevent a cross-tenant READ; this additionally evicts the prior tenant's entries.
 */
function flushRetainedOperatorSurfaces(): void {
    clearRetainedOperatorContext();
    clearWorkspaceSurfaceSessionCache();
}

export function setCurrentWorkspaceScope(scope: CurrentWorkspaceScope): void {
    const hadPrior =
        current.orgId != null || current.userId != null || current.scopeFingerprint != null;
    const changed =
        current.orgId !== scope.orgId ||
        current.userId !== scope.userId ||
        current.scopeFingerprint !== scope.scopeFingerprint;
    current = { orgId: scope.orgId, userId: scope.userId, scopeFingerprint: scope.scopeFingerprint };
    // Only a genuine change FROM a prior scope is an org/principal/permission switch; the first
    // null→scope set is the initial mount, which must retain (it is the same session, not a switch).
    if (hadPrior && changed) flushRetainedOperatorSurfaces();
}

export function getCurrentWorkspaceScope(): CurrentWorkspaceScope {
    return current;
}

export function clearCurrentWorkspaceScope(): void {
    current = { orgId: null, userId: null, scopeFingerprint: null };
    // Logout / teardown — never leave a retained surface for the next principal.
    flushRetainedOperatorSurfaces();
}
