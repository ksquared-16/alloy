/**
 * Communications send authorization (Card 25).
 *
 * Uses existing org RBAC: `user_roles` → `role_permission_grants` via
 * `resolveAdminAccessCore` / `loadAdminAccessBundleCached` — no parallel permission system.
 *
 * Permission key: {@link COMMUNICATIONS_SEND_PERMISSION_KEY}
 *
 * Rules (minimal, safe):
 * - Users with `admin` or `ops` in `roleKeys` for the active org may send (parity with portal shell).
 * - Otherwise require `communications.send` on the resolved `permissionKeys`, OR the legacy catalog
 *   key `ops.messaging.write` (already seeded in `permission_keys` / grants for ops-style roles).
 *
 * Future: seed `communications.send` in `permission_keys` and `role_permission_grants` per org when
 * orgs need explicit non-admin roles without `ops.messaging.write`; then consider dropping the alias.
 */

import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";

export type CommunicationsActor = { userId: string };

export const COMMUNICATIONS_SEND_PERMISSION_KEY = "communications.send" as const;

/** Legacy catalog key aligned with “send/manage messages” in seed_default_rbac. */
export const LEGACY_MESSAGING_SEND_PERMISSION_ALIAS = "ops.messaging.write" as const;

/**
 * Pure check: may this org membership send record-level communications?
 * Prefer using {@link assertCommunicationsSendAllowed} in API routes (loads bundle + verifies org/user).
 */
export function hasCommunicationsSendPermission(roleKeys: string[], permissionKeys: string[]): boolean {
    const privileged = roleKeys.some((r) => r === "admin" || r === "ops");
    if (privileged) return true;
    if (permissionKeys.includes(COMMUNICATIONS_SEND_PERMISSION_KEY)) return true;
    if (permissionKeys.includes(LEGACY_MESSAGING_SEND_PERMISSION_ALIAS)) return true;
    return false;
}

/**
 * Enforces `communications.send` (with admin/ops bypass and legacy alias). Resolves the same admin
 * access bundle as other CRM routes; returns 403 when denied — caller must not enqueue or send.
 */
export async function assertCommunicationsSendAllowed(params: {
    orgId: string;
    actor: CommunicationsActor | null | undefined;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) {
        return { ok: false, message: "Forbidden" };
    }
    if (!params.actor?.userId) {
        return { ok: false, message: "Forbidden" };
    }
    if (bundle.userId !== params.actor.userId) {
        return { ok: false, message: "Forbidden" };
    }
    if (bundle.orgId !== params.orgId) {
        return { ok: false, message: "Forbidden" };
    }

    if (hasCommunicationsSendPermission(bundle.roleKeys, bundle.permissionKeys)) {
        return { ok: true };
    }

    return {
        ok: false,
        message: "You do not have permission to send communications for this organization.",
    };
}
