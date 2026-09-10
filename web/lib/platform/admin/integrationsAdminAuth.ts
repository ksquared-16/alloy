/**
 * Who inside Alloy may administer integrations.
 *
 * ── THE TWO SIDES OF THE BOUNDARY MUST NOT BE CONFUSED ──
 *
 * A public scope (`locations.read`) says what an EXTERNAL APPLICATION may do. An
 * internal permission (`integrations.manage`) says what an ALLOY OPERATOR may do.
 * They face opposite directions and are never interchangeable: an application
 * holding `locations.read` must never thereby be able to mint a credential, and
 * an operator holding `integrations.manage` is not an API caller. Reusing one as
 * the other is the single most dangerous shortcut available in this area, so the
 * two vocabularies live in different modules and neither imports the other's.
 *
 * ── SEPARATE READ FROM MANAGE ──
 *
 * Viewing which integrations exist is a legitimate operational need. Minting a
 * credential is granting machine authority to software — it is at least as
 * consequential as granting a person a role, and it is gated accordingly.
 *
 * ── A CAPABILITY, NOT A ROLE LITERAL ──
 *
 * Thread 3 found role-literal gates (`ctx.role !== "admin"`) are the pattern
 * Alloy is eliminating: a role stored in no table and scoped to no organization.
 * These resolve real permission grants, and a grants read that FAILS denies —
 * an unidentified caller is not an unprivileged one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";

export const INTEGRATIONS_READ_PERMISSION_KEY = "integrations.read" as const;
export const INTEGRATIONS_MANAGE_PERMISSION_KEY = "integrations.manage" as const;

export type IntegrationsAdminVerdict =
    | { ok: true }
    | { ok: false; status: 401 | 403; code: string; message: string };

/** The operations this surface gates, and which permission each needs. */
export const INTEGRATIONS_ADMIN_OPERATIONS = {
    listInstallations: INTEGRATIONS_READ_PERMISSION_KEY,
    viewInstallation: INTEGRATIONS_READ_PERMISSION_KEY,
    viewActivity: INTEGRATIONS_READ_PERMISSION_KEY,

    createInstallation: INTEGRATIONS_MANAGE_PERMISSION_KEY,
    editAccess: INTEGRATIONS_MANAGE_PERMISSION_KEY,
    createCredential: INTEGRATIONS_MANAGE_PERMISSION_KEY,
    rotateCredential: INTEGRATIONS_MANAGE_PERMISSION_KEY,
    revokeCredential: INTEGRATIONS_MANAGE_PERMISSION_KEY,
    suspendInstallation: INTEGRATIONS_MANAGE_PERMISSION_KEY,
    disconnectInstallation: INTEGRATIONS_MANAGE_PERMISSION_KEY,
} as const;

export type IntegrationsAdminOperation = keyof typeof INTEGRATIONS_ADMIN_OPERATIONS;

/**
 * Authorize an internal operator for one operation.
 *
 * Server-side and independent of any navigation decision. Hiding a menu entry is
 * a courtesy; this is the control. A route that renders nothing but does not call
 * this is unprotected.
 */
export async function authorizeIntegrationsAdmin(
    supabase: SupabaseClient,
    params: { orgId: string; actorUserId: string | null | undefined; operation: IntegrationsAdminOperation },
): Promise<IntegrationsAdminVerdict> {
    const userId = (params.actorUserId ?? "").trim();
    if (!userId || !params.orgId) {
        return { ok: false, status: 401, code: "unauthenticated", message: "Sign in to manage integrations." };
    }

    const required = INTEGRATIONS_ADMIN_OPERATIONS[params.operation];
    const grants = await resolveActorPermissionGrants(supabase, params.orgId, userId);

    // A failed grants read answers null, and null denies.
    if (!grants || grants.permissionKeys === null) {
        return { ok: false, status: 403, code: "forbidden", message: "Access to integrations could not be confirmed." };
    }

    // Exact membership. No prefix matching: `integrations` must not imply
    // `integrations.manage`, and read must never imply manage.
    if (!grants.permissionKeys.includes(required)) {
        return {
            ok: false,
            status: 403,
            code: "forbidden",
            message: `This action requires ${required}.`,
        };
    }

    return { ok: true };
}
