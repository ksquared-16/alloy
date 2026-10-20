import { NextResponse } from "next/server";
/**
 * THE canonical document-access decision.
 *
 * Every route that hands out a document's bytes, a link to them, or the text extracted from them
 * calls this first. Knowing or guessing a document id must never be sufficient.
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
 * WHAT WAS STILL WRONG AFTER THAT (Documents V1 / D1a)
 * - The role gate read `ctx.role`, the compatibility projection that answers `admin` or `ops` for
 *   EVERY portal member (`compatibilityPortalRole`). So the gate admitted every portal member,
 *   including a custom role holding no document authority. It now reads only real role keys and
 *   the `documents.read` capability.
 * - Department/site scope was never consulted. The list route filtered by scope; this decision did
 *   not, so a scope-restricted operator could open by id a document the list hid from them. It now
 *   applies the same `assertDocumentDrawerReadable` the list uses.
 * - The relationship branch compared the stored entity type against plurals (`persons`,
 *   `opportunities`) while every stored row is singular, so it never ran. Entity types are now
 *   canonicalised before any decision is taken from them.
 * - The signer trusted the row's `storage_path` outright. A row whose path left its own
 *   organization's prefix would have signed another tenant's object. Paths must now live under
 *   `<org_id>/` (deployed census 2026-10-20: 279 of 279 rows already do).
 *
 * AUTHORIZATION IS ROW-DRIVEN, NOT PATH-DRIVEN
 * The decision is made from the canonical `documents` row and its linked
 * operational context. The storage path is then checked to match that row
 * exactly. A caller may never submit or override a path: that would make the
 * path the authority and the row decorative.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    accessScopeRestrictsData,
    assertDocumentDrawerReadable,
    scopeDimensionsFromAccess,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";
import type { AdminAccessContextResult } from "@/lib/admin/getAdminAccessContext";
import { canonicalDocumentEntityType } from "@/lib/documents/documentEntityTypes";
import { isStoragePathWithinOrg } from "@/lib/documents/storagePathAuthority";

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
    | "PATH_OUTSIDE_ORG"
    | "OWNERSHIP_METADATA_INSUFFICIENT";

export type AuthorizedDocument = {
    id: string;
    orgId: string;
    bucket: string;
    storagePath: string;
    /** Canonical singular entity type (see `canonicalDocumentEntityType`), or null when unattached. */
    entityType: string | null;
    entityId: string | null;
    status: string | null;
};

/** See {@link DocumentActor.scope}. Never use it on a route that takes a document id from a request. */
export const DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER = "subject_authorized_by_caller" as const;

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
    /**
     * Legacy compatibility projection (`admin` | `ops`). It names every portal member `ops`, so no
     * route that takes a document id from a request is ever admitted by it. Only the
     * caller-authorized avatar path still reads it (see `callerAuthorizedPhotoAdmission`).
     */
    role?: string;
    roleKeys?: string[];
    permissionKeys?: string[];
    /**
     * The actor's department/site scope, or the explicit statement that the CALLER has already
     * authorized the subject this document belongs to.
     *
     * Required, so no caller can reach the decision without saying which. `null` means the access
     * context could not be resolved, and the decision then refuses rather than guessing: before D1a a
     * failed access context fell through to the legacy portal role and was admitted unscoped.
     *
     * `DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER` exists for one path only — profile-photo avatars projected
     * onto rows the caller already read through its own scoped query. Per-document scope there would
     * resolve a `person` against department/site dimensions it has no linkage to, refuse every avatar
     * for a scope-restricted operator, and say nothing true about access: the operator can already see
     * the person. It neither narrows nor widens what those surfaces showed before.
     */
    scope: AdminAccessScopeDimensions | typeof DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER | null;
};

/**
 * Build the actor for a route that serves a document named by the REQUEST.
 *
 * One construction for every such route, so the role/permission/scope triple can never be assembled
 * three different ways again. The scope is the actor's real dimensions; a failed access context
 * yields `null`, which the decision refuses.
 */
export function documentActorForRequest(
    ctx: { ok: true; userId: string; orgId: string; role: string } | { ok: false; status: 401 | 403 },
    access: AdminAccessContextResult,
): DocumentActor {
    if (!ctx.ok) return { ok: false, failureStatus: ctx.status, scope: null };
    return {
        ok: true,
        userId: ctx.userId,
        orgId: ctx.orgId,
        role: ctx.role,
        roleKeys: access.ok ? access.roleKeys : [],
        permissionKeys: access.ok ? access.permissionKeys : [],
        scope: access.ok ? scopeDimensionsFromAccess(access) : null,
    };
}

/**
 * Roles permitted to read documents.
 *
 * Mirrors the `documents` RLS SELECT policy (owner|admin|ops|manager). The
 * routes bypass RLS via the service-role client, so this restores in code the
 * boundary the database already declares — rather than inventing a new one.
 * Matched against the actor's REAL role keys only.
 */
export const DOCUMENT_READ_ROLES: readonly string[] = ["owner", "admin", "ops", "manager"] as const;

/** Explicit permission that grants document read independent of legacy role. */
export const DOCUMENT_READ_PERMISSION = "documents.read";

/**
 * Explicit permission to CREATE, REPLACE or REMOVE a document.
 *
 * Catalogued and granted to `admin` and `ops` in every organization since the permission grid, and
 * — until the CRM/People slice — enforced by nothing at all. Its first callers are the person
 * profile-photo mutations, which are documents-backed: they write the `documents` table and object
 * storage, and the GET beside them is already declared `documents.read`. Putting them under a CRM
 * key because they hang off a person would have said that whoever may edit a household may also
 * write documents, which is a different power with a different owner.
 */
export const DOCUMENT_WRITE_PERMISSION = "documents.write";

/** Refuse unless the caller may write documents, naming the key it wanted. */
export function requireDocumentWrite(
    ctx: { permissionKeys?: readonly string[] | null },
): NextResponse | null {
    if ((ctx.permissionKeys ?? []).includes(DOCUMENT_WRITE_PERMISSION)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: DOCUMENT_WRITE_PERMISSION },
        { status: 403 },
    );
}

/**
 * May this actor read documents at all? The ADMISSION half of the decision, shared by every list,
 * byte, link and text route so they cannot disagree about who is in.
 *
 * `documents.read`, or a real role key the `documents` RLS SELECT policy admits. The compatibility
 * `role` is deliberately not consulted (see the file header).
 */
export function actorMayReadDocuments(actor: { roleKeys?: readonly string[] | null; permissionKeys?: readonly string[] | null }): boolean {
    if ((actor.permissionKeys ?? []).includes(DOCUMENT_READ_PERMISSION)) return true;
    return (actor.roleKeys ?? []).some((k) => DOCUMENT_READ_ROLES.includes(String(k).trim()));
}

/**
 * Admission for the caller-authorized avatar path ONLY — the pre-D1a rule, unchanged.
 *
 * It still accepts the compatibility `role`, so every portal member whose caller has already shown
 * them a person also sees that person's photo, exactly as before. D1a contains the routes that take a
 * document id from a request; it does not decide whether a profile photo is a document for access
 * purposes. Narrowing it here would silently remove avatars for every portal role without
 * `documents.read` (default packages grant that key to `admin` and `ops` only) across every surface
 * that projects them. That is a policy decision recorded for D1b/D2, not a containment fix.
 */
function callerAuthorizedPhotoAdmission(actor: DocumentActor): boolean {
    if (actorMayReadDocuments(actor)) return true;
    return Boolean(actor.role && DOCUMENT_READ_ROLES.includes(actor.role));
}

/** Refuse a list/read route unless {@link actorMayReadDocuments}. */
export function requireDocumentRead(
    actor: { roleKeys?: readonly string[] | null; permissionKeys?: readonly string[] | null },
): NextResponse | null {
    if (actorMayReadDocuments(actor)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: DOCUMENT_READ_PERMISSION },
        { status: 403 },
    );
}

export { isStoragePathWithinOrg };

/**
 * Document statuses that must never be signed regardless of actor.
 * `null` status is treated as normal — most rows predate any status vocabulary.
 */
const RESTRICTED_STATUSES: readonly string[] = ["deleted", "quarantined", "restricted"] as const;

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
 * Is this document's subject inside the actor's department/site scope?
 *
 * The same predicate the document list applies row by row, so a document the list hides can never be
 * opened by id. Types with no department/site linkage (`customer_member`, `person`, `customer`,
 * `vendor`, unattached intake) are readable only by an actor whose scope is unrestricted — fail
 * closed, because no policy exists yet that could place them inside a restricted scope (D2).
 */
export async function documentSubjectInActorScope(
    supabase: SupabaseClient,
    orgId: string,
    scope: DocumentActor["scope"],
    subject: { entityType: string | null; entityId: string | null },
): Promise<boolean> {
    if (scope === DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER) return true;
    if (!scope) return false;
    if (!accessScopeRestrictsData(scope)) return true;
    return assertDocumentDrawerReadable(supabase, orgId, scope, {
        entity_type: subject.entityType,
        entity_id: subject.entityId,
    });
}

/**
 * Keep only the rows whose subject is inside the actor's scope — the list half of the same rule
 * {@link assertDocumentAccess} applies to a single id. Unrestricted scope returns the rows untouched
 * without a query per row.
 */
export async function filterDocumentRowsInActorScope<T extends { entity_type?: unknown; entity_id?: unknown }>(
    supabase: SupabaseClient,
    orgId: string,
    scope: DocumentActor["scope"],
    rows: T[],
): Promise<T[]> {
    if (scope === DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER) return rows;
    if (!scope) return [];
    if (!accessScopeRestrictsData(scope)) return rows;
    const kept: T[] = [];
    for (const row of rows) {
        const ok = await documentSubjectInActorScope(supabase, orgId, scope, {
            entityType: canonicalDocumentEntityType(row.entity_type),
            entityId: row.entity_id != null && String(row.entity_id).trim() ? String(row.entity_id).trim() : null,
        });
        if (ok) kept.push(row);
    }
    return kept;
}

/**
 * Decide whether `actor` may obtain a document's bytes, a link to them, or their extracted text.
 *
 * Returns `not_found` for "no such document", "exists in another org" and "outside your scope" alike,
 * so the route is an existence oracle neither for other tenants nor for records hidden by scope.
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

    // 3. Scope must be stated. An unresolved access context is refused, never treated as unscoped.
    if (actor.scope === null || actor.scope === undefined) {
        return { outcome: "blocked", code: "SCOPE_DENIED", message: "Your access could not be verified." };
    }

    // Malformed ids fail safely and identically to a miss.
    if (!input.documentId || !UUID_RE.test(input.documentId)) {
        return { outcome: "not_found" };
    }

    // 4. Permission / role. Checked BEFORE the row is read, so an unauthorized
    //    actor learns nothing about which ids exist.
    const admitted =
        actor.scope === DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER
            ? callerAuthorizedPhotoAdmission(actor)
            : actorMayReadDocuments(actor);
    if (!admitted) {
        return {
            outcome: "blocked",
            code: "INSUFFICIENT_ROLE",
            message: "You do not have permission to view documents.",
        };
    }

    // 5. Document row ownership — org-scoped read.
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
    const entityType = canonicalDocumentEntityType(row.entity_type);
    const entityId = row.entity_id ? String(row.entity_id) : null;
    const status = row.status ? String(row.status) : null;

    // Defence in depth: the query already filtered by org.
    if (orgId !== actor.orgId) {
        return { outcome: "not_found" };
    }

    // 6. Relationship / operational scope. Same predicate as the list.
    if (!(await documentSubjectInActorScope(input.supabase, orgId, actor.scope, { entityType, entityId }))) {
        return { outcome: "not_found" };
    }

    // 7. Document status / visibility.
    if (status && RESTRICTED_STATUSES.includes(status)) {
        return {
            outcome: "blocked",
            code: "DOCUMENT_RESTRICTED",
            message: "This document is not available.",
        };
    }

    // 8. Storage location must exist on the row. An orphaned storage object has
    //    no row at all and is therefore unreachable through this path.
    if (!bucket || !storagePath) {
        return {
            outcome: "blocked",
            code: "STORAGE_LOCATION_MISSING",
            message: "This document has no stored file.",
        };
    }

    // 9. The object must live inside the row's own organization. A row is not allowed to point the
    //    service-role signer at another tenant's file.
    if (!isStoragePathWithinOrg(storagePath, orgId)) {
        console.error("[document-access] storage path outside organization prefix", { document_id: String(row.id) });
        return { outcome: "blocked", code: "PATH_OUTSIDE_ORG", message: "This document could not be verified." };
    }

    // 10. The bucket/path signed must be EXACTLY the row's. A caller-supplied
    //     value may only agree, never redirect.
    if (input.expected?.bucket && input.expected.bucket !== bucket) {
        return { outcome: "blocked", code: "PATH_MISMATCH", message: "This document could not be verified." };
    }
    if (input.expected?.storagePath && input.expected.storagePath !== storagePath) {
        return { outcome: "blocked", code: "PATH_MISMATCH", message: "This document could not be verified." };
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
