/**
 * The single canonical held-authority resolver (P1 · Wave C).
 *
 * The one source of held-authority truth for BOTH authoring and ratification. It is
 * gateway-backed by the authoritative database function
 * `resolve_held_operational_authority` (the actual resolution over the governed
 * catalog + effective-dated assignments runs server-side; this is the typed TS
 * accessor). It NEVER trusts caller-supplied holdings, never equates service-role
 * with authority, and never grants AI ratifying authority (fail-closed in TS too).
 *
 * RBAC permission (may invoke a command) is SEPARATE from held authority (may bind
 * under a specific authority). This resolver answers only the latter.
 */

/** Frozen holder classes; `ai` is included only to fail closed (AI never holds). */
export type AuthorityHolderType = "human" | "policy" | "process" | "external" | "ai";
export type AuthorityScopeType = "organization" | "location" | "business_process" | "subject" | "subject_type";

export interface HeldAuthorityQuery {
    orgId: string;
    holderType: AuthorityHolderType;
    holderId: string;
    authorityKey: string;
    scopeType: AuthorityScopeType;
    scopeId: string | null;
    effectiveAt?: string;
}

export interface HeldAuthorityResult {
    holds: boolean;
    assignmentId: string | null;
    matchedScope: AuthorityScopeType | null;
    reason: string;
}

/** Backs the resolver with the authoritative DB function (or a fake in tests). */
export interface HeldAuthorityGateway {
    /** Returns the matching assignment id (server-resolved) or null. */
    resolve(query: HeldAuthorityQuery): Promise<{ assignmentId: string | null }>;
}

export async function resolveHeldOperationalAuthority(
    query: HeldAuthorityQuery,
    gateway: HeldAuthorityGateway,
): Promise<HeldAuthorityResult> {
    // AI never holds ratifying authority — fail closed before any read.
    if (query.holderType === "ai") {
        return { holds: false, assignmentId: null, matchedScope: null, reason: "ai_never_holds_authority" };
    }
    if (!query.orgId || !query.holderId || !query.authorityKey) {
        return { holds: false, assignmentId: null, matchedScope: null, reason: "incomplete_query_fail_closed" };
    }
    const { assignmentId } = await gateway.resolve(query);
    if (assignmentId) {
        return { holds: true, assignmentId, matchedScope: query.scopeType, reason: "active_in_scope_assignment" };
    }
    return { holds: false, assignmentId: null, matchedScope: null, reason: "no_active_assignment_or_ungoverned_authority" };
}
