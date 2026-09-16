/**
 * Communications send authorization (Card 25).
 *
 * Uses existing org RBAC: `user_roles` → `role_permission_grants` via
 * `resolveAdminAccessCore` / `loadAdminAccessBundleCached` — no parallel permission system.
 *
 * Permission key: {@link COMMUNICATIONS_SEND_PERMISSION_KEY}
 *
 * Rules:
 * - Require `communications.send` on the resolved `permissionKeys`, OR the legacy catalog key
 *   `ops.messaging.write` (already seeded in `permission_keys` / grants for ops-style roles).
 *
 * THE ROLE TITLE IS GONE. This opened with
 * `roleKeys.some(r => r === "admin" || r === "ops") -> return true`, which is the authority layer
 * `W-13` removed everywhere else: a role KEY, recorded in no grant table, satisfying a capability
 * check on its own. It made the role editor a fiction here — a custom role given exactly the
 * administrator's package still could not send, and an `admin` role stripped of
 * `communications.send` still could. Every organization's `admin` and `ops` hold
 * `communications.send` through `seed_default_rbac`, so reading the grant instead of the name costs
 * that population nothing; what it buys is that a role means its package and nothing else.
 *
 * `roleKeys` is no longer a parameter rather than an ignored one, so no caller can pass a title and
 * believe it still counts.
 *
 * The legacy ALIAS is deliberately kept. It is a capability recorded in `role_permission_grants`,
 * not a title, so it is not the defect this removed; retiring it is a narrowing with its own
 * blast radius and belongs to its own decision.
 */

import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    decideCommunicationsSendScope,
    type SendScopeDecision,
} from "@/lib/communications/communicationsSendScope";

export type CommunicationsActor = { userId: string };

export const COMMUNICATIONS_SEND_PERMISSION_KEY = "communications.send" as const;

/** Legacy catalog key aligned with “send/manage messages” in seed_default_rbac. */
export const LEGACY_MESSAGING_SEND_PERMISSION_ALIAS = "ops.messaging.write" as const;

/**
 * Pure check: may this org membership send record-level communications?
 * Prefer using {@link assertCommunicationsSendAllowed} in API routes (loads bundle + verifies org/user).
 */
export function hasCommunicationsSendPermission(permissionKeys: string[]): boolean {
    if (permissionKeys.includes(COMMUNICATIONS_SEND_PERMISSION_KEY)) return true;
    if (permissionKeys.includes(LEGACY_MESSAGING_SEND_PERMISSION_ALIAS)) return true;
    return false;
}

/**
 * Enforces `communications.send` (or the legacy capability alias) — no role-title bypass. Resolves the same admin
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

    if (hasCommunicationsSendPermission(bundle.permissionKeys)) {
        return { ok: true };
    }

    return {
        ok: false,
        message: "You do not have permission to send communications for this organization.",
    };
}


/**
 * Enforce the LOCATION half of send authorization for an existing conversation.
 *
 * `assertCommunicationsSendAllowed` answers "may this user send at all". This
 * answers "may they send in THIS conversation", which is the question a
 * multi-location organization actually needs: a Riverside-only operator holding
 * `communications.send` must not be able to answer a Lakeside family.
 *
 * It composes two authorities that already exist — the org RBAC permission and
 * `user_site_access` via the access bundle's `siteScope` /
 * `allowedSiteLocationIds`. No Communications ACL, no new table.
 *
 * Note what it does NOT do: it never selects or influences the identity. The
 * conversation's location already decided that. This only decides whether this
 * operator may act in that conversation, so an authorized reply still goes out
 * from the location's own address rather than anything tied to the user.
 *
 * A thread that cannot be read is refused rather than allowed — an unreadable
 * conversation is not an unrestricted one.
 */
export async function assertCommunicationsSendAllowedForThread(params: {
    supabase: SupabaseClient;
    orgId: string;
    threadId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const bundle = await loadAdminAccessBundleCached();
    if (!bundle.ok) return { ok: false, message: "Forbidden" };
    if (bundle.orgId !== params.orgId) return { ok: false, message: "Forbidden" };

    const { data: thread, error } = await params.supabase
        .from("communication_threads")
        .select("id, location_id, assigned_user_id")
        .eq("id", params.threadId)
        .eq("org_id", params.orgId)
        .maybeSingle();

    if (error || !thread) {
        return { ok: false, message: "That conversation is not available." };
    }

    const decision: SendScopeDecision = decideCommunicationsSendScope({
        hasCommunicationsSend: hasCommunicationsSendPermission(bundle.permissionKeys),
        siteScope: bundle.siteScope,
        allowedSiteLocationIds: bundle.allowedSiteLocationIds,
        conversationLocationId: (thread as { location_id?: string | null }).location_id ?? null,
        // The canonical assignment model — an explicitly assigned conversation is
        // a deliberate grant of THIS conversation, and outranks blanket scope.
        assignedUserId: (thread as { assigned_user_id?: string | null }).assigned_user_id ?? null,
        actorUserId: bundle.userId,
    });

    return decision.allowed ? { ok: true } : { ok: false, message: decision.message };
}
