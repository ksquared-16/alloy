/**
 * THE CALLER'S PERMISSION GRANTS, resolved from the client an action already holds.
 *
 * ── WHY THIS IS NOT `getAdminAccessContextCached` ──
 *
 * That one is server-only: it reaches `cachedAuthSession` → `supabaseServer` → `next/headers`.
 * Registered actions live in `actionRegistry`, which is reachable from a CLIENT component
 * (`queryBosSlashCatalog` → `AICommandSurfaceShell` → `AdminV2Shell`), so importing it there pulls
 * `next/headers` into the browser graph and breaks every adminV2 page — while API routes keep
 * working, which is what makes it look transient. So this resolves the same grants from the
 * service-role client the action already receives, keyed on the actor id the runtime already
 * carries, reading the same tables `resolveAdminAccessCore` reads.
 *
 * ── A FAILED READ IS NOT AN EMPTY GRANT SET ──
 *
 * `null` means the read FAILED and is a different answer from `[]`. W-43 recorded what happens when
 * those are collapsed: the failure becomes OPEN for every surface that gates on admission alone.
 * Every caller here fails CLOSED.
 *
 * ── ONE OWNER ──
 *
 * Health asked this question first and owned the answer. Enrollment requirement exceptions ask the
 * identical question, so they ask it here rather than growing a second copy — two grant resolvers
 * that agree today are two, and the laxer one is the one that ends up guarding a write.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeRoleKey } from "@/lib/admin/resolveAdminAccessCore";

export type ActorPermissionGrants = {
    /** Resolved grants for the caller. `null` means the grant read FAILED — deny. */
    readonly permissionKeys: readonly string[] | null;
};

export async function resolveActorPermissionGrants(
    supabase: SupabaseClient,
    orgId: string,
    actorUserId: string | null | undefined,
): Promise<ActorPermissionGrants> {
    const userId = (actorUserId ?? "").trim();
    // No actor is not an anonymous caller with no grants — it is an unidentified one. Deny.
    if (!userId || !orgId) return { permissionKeys: null };

    // `user_roles` is the canonical membership table, and the column is `role`, not `role_key`.
    const { data: memberships, error: membershipError } = await supabase
        .from("user_roles")
        .select("org_id, role")
        .eq("org_id", orgId)
        .eq("user_id", userId);
    if (membershipError) return { permissionKeys: null };

    /*
     * NORMALIZED BEFORE COMPARISON — W-42's lesson. A row holding `"admin "` matches no role, so the
     * principal would resolve with an empty grant set while every other surface showed a working
     * administrator. `normalizeRoleKey` is the one definition.
     */
    const roleKeys = [
        ...new Set(
            ((memberships ?? []) as unknown as Array<{ role?: unknown }>)
                .map((m) => normalizeRoleKey(m.role))
                .filter(Boolean),
        ),
    ];
    if (roleKeys.length === 0) return { permissionKeys: [] };

    const { data: grants, error: grantError } = await supabase
        .from("role_permission_grants")
        .select("permission_key")
        .eq("org_id", orgId)
        .in("role_key", roleKeys)
        .eq("allowed", true);
    if (grantError) return { permissionKeys: null };

    return {
        permissionKeys: [
            ...new Set(
                ((grants ?? []) as unknown as Array<{ permission_key?: unknown }>)
                    .map((g) => (g.permission_key != null ? String(g.permission_key).trim() : ""))
                    .filter(Boolean),
            ),
        ],
    };
}
