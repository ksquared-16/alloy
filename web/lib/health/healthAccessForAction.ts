/**
 * THE CALLER'S HEALTH GRANTS, resolved without dragging `next/headers` into the client bundle.
 *
 * ── WHY THIS MODULE EXISTS ──
 *
 * The obvious call was `getAdminAccessContextCached()`. It is server-only: it reaches
 * `cachedAuthSession` → `supabaseServer` → `next/headers`. Registered actions live in
 * `actionRegistry`, which is reachable from a CLIENT component
 * (`queryBosSlashCatalog` → `AICommandSurfaceShell` → `AdminV2Shell`), so importing it there pulled
 * `next/headers` into the browser graph and broke EVERY adminV2 page with
 * "Ecmascript file had an error" — while API routes kept working, which is what made it look
 * transient and cost a session to misdiagnose.
 *
 * So this resolves the same grants from the service-role client the action already receives, keyed on
 * the actor id the runtime already carries. No request-scoped imports, nothing server-only in the
 * static graph, and the same table `resolveAdminAccessCore` reads.
 *
 * ── A FAILED READ STILL DENIES ──
 *
 * `null` means the grant read failed and is NOT the same answer as "holds no grants" (W-43). Health
 * closes on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeRoleKey } from "@/lib/admin/resolveAdminAccessCore";
import type { HealthAccessSubject } from "@/lib/health/healthAccess";

export async function resolveHealthAccessForActor(
    supabase: SupabaseClient,
    orgId: string,
    actorUserId: string | null | undefined,
): Promise<HealthAccessSubject> {
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
     * NORMALIZED BEFORE COMPARISON — W-42's lesson, and it is enforcing here too. A row holding
     * `"admin "` matches no role, so the principal would resolve with an empty grant set while every
     * other surface showed a working administrator. `normalizeRoleKey` is the one definition.
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
