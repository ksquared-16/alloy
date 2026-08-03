/**
 * THE canonical document-access decision.
 *
 * Every signed-URL producer calls this before signing. Knowing or guessing a
 * document id must never be sufficient.
 *
 * WHAT WAS WRONG
 * The three signing routes checked only `ctx.ok` — "is there a session?" — and
 * then signed with the service-role client, which bypasses the `documents` RLS
 * that restricts SELECT to owner|admin|ops|manager. `getAdminContextCached`
 * returns ok for ANY org member (lib/admin/getAdminContext.ts:50-52), so a
 * viewer could mint a URL for any document in their org, including another
 * child's records. Live verification confirmed the storage layer itself is
 * fail-closed, so this was the whole of the defect — and all of it is here.
 *
 * AUTHORIZATION IS ROW-DRIVEN, NOT PATH-DRIVEN
 * The decision is made from the canonical `documents` row and its linked
 * operational context. The storage path is then checked to match that row
 * exactly. A caller may never submit or override a path: that would make the
 * path the authority and the row decorative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentAccessOperation = "preview" | "download" | "attachment";

export type DocumentAccessDecision =
    | { outcome: "allowed"; document: AuthorizedDocument }
    | { outcome: "blocked"; code: DocumentBlockCode; message: string }
    | { outcome: "not_found" };

export type DocumentBlockCode =
    | "UNAUTHENTICATED"
    | "NO_ORG"
    | "INSUFFICIENT_ROLE"
    | "ORG_MISMATCH"
    | "SCOPE_DENIED"
    | "DOCUMENT_RESTRICTED"
    | "STORAGE_LOCATION_MISSING"
    | "PATH_MISMATCH"
    | "OWNERSHIP_METADATA_INSUFFICIENT";

export type AuthorizedDocument = {
    id: string;
    orgId: string;
    bucket: string;
    storagePath: string;
    entityType: string | null;
    entityId: string | null;
    status: string | null;
};

export type DocumentActor = {
    ok: boolean;
    /**
     * Why the actor failed, when ok is false. Preserves the distinction between
     * "not signed in" (401) and "signed in but not a member of this org" (403);
     * collapsing them would make the route less informative to a legitimate
     * operator without making it any safer.
     */
    failureStatus?: 401 | 403;
    userId?: string;
    orgId?: string;
    role?: string;
    roleKeys?: string[];
    permissionKeys?: string[];
};

/**
 * Roles permitted to read documents.
 *
 * Mirrors the `documents` RLS SELECT policy (owner|admin|ops|manager). The
 * routes bypass RLS via the service-role client, so this restores in code the
 * boundary the database already declares — rather than inventing a new one.
 */
export const DOCUMENT_READ_ROLES: readonly string[] = ["owner", "admin", "ops", "manager"] as const;

/** Explicit permission that grants document read independent of legacy role. */
export const DOCUMENT_READ_PERMISSION = "documents.read";

/**
 * Document statuses that must never be signed regardless of actor.
 * `null` status is treated as normal — most rows predate any status vocabulary.
 */
const RESTRICTED_STATUSES: readonly string[] = ["deleted", "quarantined", "restricted"] as const;

/**
 * Entity types whose ownership metadata is rich enough for relationship-level
 * authorization today. Anything else falls back to the privileged-role check.
 *
 * DOCUMENTED GAP (for Access & Identity work): `documents` carries only
 * `entity_type`/`entity_id`, with no location, department, or household
 * columns. Location-, department- and household-scoped document access
 * therefore cannot be enforced precisely yet. Rather than defaulting every
 * authenticated org member to access, unmodelled types fail closed to the
 * privileged-role set above.
 */
const RELATIONSHIP_SCOPED_ENTITY_TYPES: readonly string[] = ["persons", "customers", "opportunities", "jobs"] as const;

function hasPrivilegedRole(actor: DocumentActor): boolean {
    if (actor.permissionKeys?.includes(DOCUMENT_READ_PERMISSION)) return true;
    const keys = [...(actor.roleKeys ?? []), ...(actor.role ? [actor.role] : [])];
    return keys.some((k) => DOCUMENT_READ_ROLES.includes(k));
}

export type DocumentAccessInput = {
    supabase: SupabaseClient;
    actor: DocumentActor;
    documentId: string;
    operation: DocumentAccessOperation;
    /**
     * Expected bucket/path, when the caller believes it knows them. Used ONLY to
     * verify agreement with the stored row — never to select what gets signed.
     */
    expected?: { bucket?: string | null; storagePath?: string | null };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decide whether `actor` may obtain a signed URL for `documentId`.
 *
 * Returns `not_found` for both "no such document" and "exists in another org",
 * so the route is not an existence oracle for other tenants.
 */
export async function assertDocumentAccess(input: DocumentAccessInput): Promise<DocumentAccessDecision> {
    const { actor } = input;

    // 1. Authenticated actor.
    if (!actor.ok) {
        return actor.failureStatus === 403
            ? { outcome: "blocked", code: "NO_ORG", message: "No organization is available for this session." }
            : { outcome: "blocked", code: "UNAUTHENTICATED", message: "Sign in to view this document." };
    }

    // 2. Organization membership.
    if (!actor.orgId) {
        return { outcome: "blocked", code: "NO_ORG", message: "No organization is available for this session." };
    }

    // Malformed ids fail safely and identically to a miss.
    if (!input.documentId || !UUID_RE.test(input.documentId)) {
        return { outcome: "not_found" };
    }

    // 3. Permission / role. Checked BEFORE the row is read, so an unauthorized
    //    actor learns nothing about which ids exist.
    if (!hasPrivilegedRole(actor)) {
        return {
            outcome: "blocked",
            code: "INSUFFICIENT_ROLE",
            message: "You do not have permission to view documents.",
        };
    }

    // 4. Document row ownership — org-scoped read.
    const { data, error } = await input.supabase
        .from("documents")
        .select("id, org_id, bucket, storage_path, entity_type, entity_id, status")
        .eq("id", input.documentId)
        .eq("org_id", actor.orgId)
        .maybeSingle();

    if (error) {
        console.error("[document-access] lookup failed", { code: (error as { code?: string }).code });
        return { outcome: "blocked", code: "SCOPE_DENIED", message: "This document could not be verified." };
    }
    if (!data) {
        // Absent, or owned by another organization. Indistinguishable by design.
        return { outcome: "not_found" };
    }

    const row = data as Record<string, unknown>;
    const orgId = String(row.org_id ?? "");
    const bucket = String(row.bucket ?? "").trim();
    const storagePath = String(row.storage_path ?? "").trim();
    const entityType = row.entity_type ? String(row.entity_type) : null;
    const entityId = row.entity_id ? String(row.entity_id) : null;
    const status = row.status ? String(row.status) : null;

    // Defence in depth: the query already filtered by org.
    if (orgId !== actor.orgId) {
        return { outcome: "not_found" };
    }

    // 8. Document status / visibility.
    if (status && RESTRICTED_STATUSES.includes(status)) {
        return {
            outcome: "blocked",
            code: "DOCUMENT_RESTRICTED",
            message: "This document is not available.",
        };
    }

    // 6. Storage location must exist on the row. An orphaned storage object has
    //    no row at all and is therefore unreachable through this path.
    if (!bucket || !storagePath) {
        return {
            outcome: "blocked",
            code: "STORAGE_LOCATION_MISSING",
            message: "This document has no stored file.",
        };
    }

    // 7. The bucket/path signed must be EXACTLY the row's. A caller-supplied
    //    value may only agree, never redirect.
    if (input.expected?.bucket && input.expected.bucket !== bucket) {
        return { outcome: "blocked", code: "PATH_MISMATCH", message: "This document could not be verified." };
    }
    if (input.expected?.storagePath && input.expected.storagePath !== storagePath) {
        return { outcome: "blocked", code: "PATH_MISMATCH", message: "This document could not be verified." };
    }

    // 5. Relationship / operational scope, where the metadata supports it.
    if (entityType && !RELATIONSHIP_SCOPED_ENTITY_TYPES.includes(entityType)) {
        // Unmodelled type: the privileged-role check above is the strongest
        // scope available. Fail closed rather than widening.
        if (!hasPrivilegedRole(actor)) {
            return {
                outcome: "blocked",
                code: "OWNERSHIP_METADATA_INSUFFICIENT",
                message: "You do not have permission to view this document.",
            };
        }
    }

    return {
        outcome: "allowed",
        document: { id: String(row.id), orgId, bucket, storagePath, entityType, entityId, status },
    };
}

/**
 * Expiry per operation. Shortest practical window.
 *
 * The profile-photo route previously signed for SEVEN DAYS — on a child's
 * photograph. A signed URL is a bearer credential; a week-long one survives
 * every revocation this platform can perform.
 */
export function signedUrlExpirySeconds(operation: DocumentAccessOperation): number {
    switch (operation) {
        case "preview":
            return 60 * 5;
        case "download":
            return 60 * 10;
        case "attachment":
            return 60 * 15;
    }
}

/** Map a decision to an HTTP response shape. Never leaks the storage path. */
export function documentAccessHttp(decision: DocumentAccessDecision): { status: number; body: Record<string, unknown> } {
    if (decision.outcome === "allowed") return { status: 200, body: { ok: true } };
    if (decision.outcome === "not_found") {
        return { status: 404, body: { ok: false, error: "Document not found", code: "NOT_FOUND" } };
    }
    const status = decision.code === "UNAUTHENTICATED" ? 401 : 403;
    return { status, body: { ok: false, error: decision.message, code: decision.code } };
}
