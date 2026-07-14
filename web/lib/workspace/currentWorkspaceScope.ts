/**
 * Current workspace scope (Trust Closure). The authenticated org / principal / access-scope for the
 * live workspace session, published by `WorkspaceOrgProvider`. It lets non-React navigation
 * affordances (sidebar links, shell navigation) warm the Work Unit surface session under the SAME
 * org/user/scope the runtime seeds from — without threading React context through every call site.
 *
 * Module-scoped and single-tenant per browser session; cleared on org change / logout with the
 * rest of the workspace session state. Never used for authorization — only to key a client prefetch.
 */

export type CurrentWorkspaceScope = {
    orgId: string | null;
    userId: string | null;
    scopeFingerprint: string | null;
};

let current: CurrentWorkspaceScope = { orgId: null, userId: null, scopeFingerprint: null };

export function setCurrentWorkspaceScope(scope: CurrentWorkspaceScope): void {
    current = { orgId: scope.orgId, userId: scope.userId, scopeFingerprint: scope.scopeFingerprint };
}

export function getCurrentWorkspaceScope(): CurrentWorkspaceScope {
    return current;
}

export function clearCurrentWorkspaceScope(): void {
    current = { orgId: null, userId: null, scopeFingerprint: null };
}
