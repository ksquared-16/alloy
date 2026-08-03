/**
 * Phase 0 behavioral test harness — actor fixtures.
 *
 * Phase 0 makes authorization claims ("a low-privilege viewer cannot mint a
 * signed URL", "only an authorized operator may send an emergency message").
 * Those claims are only meaningful if tests can express DIFFERENT actors.
 *
 * `getAdminContextCached` returns `{ ok, orgId, role, userId }` and admits ANY
 * caller with an org-role bundle — the compatibility `role` is derived from
 * roleKeys, and failure is 403 only when there is no org membership at all
 * (lib/admin/getAdminContext.ts:39,50-52). That is precisely the gap P0-2
 * closes, so the harness must be able to construct a caller who passes
 * `ctx.ok` while still being unauthorized for a given document.
 */
import type { AdminContextResult } from "@/lib/admin/getAdminContext";

export const TEST_ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const TEST_ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";

export type ActorRole = "owner" | "admin" | "ops" | "manager" | "viewer" | "staff";

export type Actor = {
    label: string;
    userId: string;
    orgId: string;
    role: ActorRole;
    /** Permission keys the actor holds. Empty = relies on legacy role fallback. */
    permissionKeys: string[];
};

function actor(label: string, role: ActorRole, orgId: string, permissionKeys: string[] = []): Actor {
    return {
        label,
        userId: `11111111-0000-4000-8000-${role.padEnd(12, "0").slice(0, 12)}`,
        orgId,
        role,
        permissionKeys,
    };
}

/**
 * The actor matrix Phase 0 security tests iterate over.
 *
 * `viewer` and `staff` are the load-bearing cases: they pass `ctx.ok` today and
 * must be refused by `assertDocumentAccess` after P0-2.
 */
export const ACTORS = {
    orgAAdmin: actor("org-A admin", "admin", TEST_ORG_A, ["communications.send"]),
    orgAOps: actor("org-A ops", "ops", TEST_ORG_A, ["communications.send"]),
    orgAManager: actor("org-A manager", "manager", TEST_ORG_A),
    orgAViewer: actor("org-A viewer", "viewer", TEST_ORG_A),
    orgAStaff: actor("org-A staff", "staff", TEST_ORG_A),
    orgBAdmin: actor("org-B admin (cross-tenant)", "admin", TEST_ORG_B, ["communications.send"]),
} as const;

/** Every actor who should be REFUSED access to another child's document in their own org. */
export const LOW_PRIVILEGE_ACTORS: Actor[] = [ACTORS.orgAViewer, ACTORS.orgAStaff];

/** Build the `getAdminContextCached` return value for an actor. */
export function adminContextFor(actor: Actor): AdminContextResult {
    return { ok: true, orgId: actor.orgId, role: actor.role, userId: actor.userId };
}

/** An unauthenticated caller. */
export const UNAUTHENTICATED: AdminContextResult = { ok: false, status: 401 };

/** An authenticated caller with no org membership. */
export const NO_ORG_MEMBERSHIP: AdminContextResult = { ok: false, status: 403 };
