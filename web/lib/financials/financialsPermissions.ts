/**
 * Financials read authorization.
 *
 * Uses the existing org RBAC — `user_roles` → `role_permission_grants` through
 * `resolveActorPermissionGrants` — and adds no parallel permission system.
 *
 * ── WHY THIS IS A NAMED HELPER RATHER THAN AN INLINE CHECK ──
 *
 * The declared route-capability table (W-14 · I-24) binds a claim to its enforcement through three
 * joins: the handler calls a named helper, it tests the verdict, and the helper's module names the
 * capability on an executable line. An inline grants lookup satisfies none of them, so a route that
 * genuinely enforced `fin.read` could only have been recorded as `pending` — adding to a backlog
 * whose ratchet is deliberately tight, in exchange for describing a guard that already existed as
 * absent. Naming it makes the enforcement checkable and reusable by the Financials workspace's later
 * cohorts, which will need exactly this gate.
 *
 * Permission key: {@link FINANCIALS_READ_PERMISSION_KEY}
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";

export const FINANCIALS_READ_PERMISSION_KEY = "fin.read" as const;

/**
 * Enforces `fin.read` for a financial read surface. Returns a verdict rather than throwing, so the
 * caller decides the response shape — and a caller that ignores the verdict fails the table's own
 * binding check rather than shipping a gate in name only.
 *
 * A grants read that FAILS answers null, and null denies: an unidentified caller is not an
 * unprivileged one, and treating the two alike is how a broken lookup becomes an open door.
 */
export async function assertFinancialsReadAllowed(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const grants = await resolveActorPermissionGrants(params.supabase, params.orgId, params.userId ?? null);
    if ((grants.permissionKeys ?? []).includes(FINANCIALS_READ_PERMISSION_KEY)) return { ok: true };
    return { ok: false, message: `Viewing financial work requires ${FINANCIALS_READ_PERMISSION_KEY}.` };
}
