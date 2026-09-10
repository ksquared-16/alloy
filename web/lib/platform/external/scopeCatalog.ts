/**
 * The one place that says what a public scope permits.
 *
 * ── WHY A CATALOG AND NOT A STRING COMPARE IN EACH ROUTE ──
 *
 * B.2 enforced scopes but had no central statement of which scope governs which
 * operation, so the knowledge lived in whichever handler happened to check.
 * Scattered `scopes.includes("…")` calls are how two routes end up disagreeing
 * about the same permission, and how a new route quietly ships requiring nothing.
 * A route now names its OPERATION; the catalog decides the scope.
 *
 * ── EXTERNAL SCOPES ARE NOT OPERATOR RBAC ──
 *
 * They are deliberately their own vocabulary, mapped to Alloy authority rather
 * than equal to it. Alloy's internal permission keys describe what a MEMBER may
 * do and are still being reshaped — PR #802 moved financial permissions during
 * Thread 3's own closeout. Publishing them as external scopes would make every
 * internal rename a partner-visible breaking change. The indirection is the
 * product.
 *
 * ── EXACT MATCH, ALWAYS ──
 *
 * No prefix semantics, no wildcards, no hierarchy. A catalog in which
 * `locations` implies `locations.read`, or `locations.read` implies
 * `locations.readwrite`, is one where granting a read quietly grants something
 * else. Read and write are separate entries by construction, so a future
 * `locations.write` cannot be satisfied by a read grant.
 */

import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";
import { hasScope, type AuthorizationVerdict } from "@/lib/platform/principal/principalAuthorization";

export type PublicAccess = "read" | "write";

export type PublicScopeDefinition = {
    scope: string;
    access: PublicAccess;
    /** What this grants, in a developer's words. Feeds the documentation. */
    summary: string;
    /**
     * The Alloy authority actually invoked. Recorded so the mapping from public
     * contract to internal truth is legible, and so a reviewer can see that a
     * scope is not simply a label.
     */
    alloyAuthority: string;
};

/** The complete V1 external scope catalog. Small on purpose: it can grow compatibly, it cannot shrink. */
export const PUBLIC_SCOPES = {
    "context.read": {
        scope: "context.read",
        access: "read",
        summary: "Read the calling installation's own context.",
        alloyAuthority: "none — the installation describing itself",
    },
    "locations.read": {
        scope: "locations.read",
        access: "read",
        summary: "Read organizational locations (sites and units) within the installation boundary.",
        alloyAuthority: "public.list_external_locations, boundary-enforced in SQL",
    },
} as const satisfies Record<string, PublicScopeDefinition>;

export type PublicScope = keyof typeof PUBLIC_SCOPES;

/**
 * Every public operation, and the scope it requires.
 *
 * The operation id is the same string the OpenAPI artifact and the activity log
 * use, so "what did this caller do", "what does the contract say" and "what did
 * we require" cannot drift into three different vocabularies.
 */
export const PUBLIC_OPERATIONS = {
    getContext: { operationId: "getContext", scope: null, route: "/api/v1/context" },
    issueAccessToken: { operationId: "issueAccessToken", scope: null, route: "/api/v1/oauth/token" },
    listLocations: { operationId: "listLocations", scope: "locations.read", route: "/api/v1/locations" },
} as const satisfies Record<
    string,
    { operationId: string; scope: PublicScope | null; route: string }
>;

export type PublicOperationId = keyof typeof PUBLIC_OPERATIONS;

/**
 * `getContext` requires no scope deliberately: it reports the installation's own
 * identity and grants, and a caller that cannot discover what it holds cannot
 * debug why anything else was refused. It exposes no domain data, so there is
 * nothing for a scope to protect.
 */
export function scopeForOperation(operationId: PublicOperationId): PublicScope | null {
    return PUBLIC_OPERATIONS[operationId].scope;
}

export function requireOperationScope(
    principal: ApplicationPrincipal,
    operationId: PublicOperationId,
): AuthorizationVerdict {
    const required = scopeForOperation(operationId);
    if (required === null) return { ok: true };

    // Exact membership. `hasScope` does no prefix matching, and this is the only
    // place the requirement is decided.
    if (hasScope(principal, required)) return { ok: true };

    return {
        ok: false,
        code: "forbidden_scope",
        message: `This installation has not been granted ${required}.`,
    };
}

/** Every scope a developer could be granted. Used by documentation and tests. */
export function allPublicScopes(): PublicScopeDefinition[] {
    return Object.values(PUBLIC_SCOPES);
}
