import type { SupabaseClient } from "@supabase/supabase-js";
import { logAccessReadFailure } from "@/lib/admin/accessReadFailureLog";

/**
 * W-13 — THE question portal admission asks, and the only module allowed to answer it.
 *
 * **What it replaced.** Admission was `PORTAL_ROLES = new Set(["admin", "ops"])` tested against the
 * principal's `user_roles` rows, written out twice (`resolveAdminAccessCore`,
 * `resolveAdminPortalOrgCore`). That is a role literal deciding authority, which is the fifth layer
 * `04-authentication-model.md §3.6` records and the operator's standing directive — *"reduce to
 * four layers"* — asks to remove. `20260818170000` removed the two sites where the literal
 * CONFERRED authority. This removes the last thing it decided: who gets through the front door.
 *
 * **The question is now the product's question.** Not *"is this principal's role named admin or
 * ops?"* but *"does this principal hold the capability to enter the operator portal for this
 * organization?"* The difference is what makes admission configurable: a custom role that holds
 * {@link PORTAL_ADMISSION_CAPABILITY} enters, and a system role that does not hold it is refused
 * however it is named.
 *
 * **Why one module rather than a shared boolean.** The two resolvers reach the answer by different
 * routes — the full resolver already holds the principal's whole grant union, the light resolver
 * deliberately does not fetch it — so they cannot share a call, only a definition. `M2-13` is this
 * initiative's record of two gates in one request disagreeing about the same principal, and two
 * copies of an admission predicate is how that happens. The capability key, the three outcomes, and
 * the fail-closed rule are stated once, here.
 */
export const PORTAL_ADMISSION_CAPABILITY = "portal.access";

/**
 * Three outcomes, because two of them are denials that mean different things.
 *
 * The instruction this implements is explicit that *"NO portal.access"* and *"COULD NOT RESOLVE
 * portal access"* must stay distinguishable: both refuse, and an operator debugging a lockout needs
 * to know which one they are looking at. Collapsing them to `false` is the W-43 mistake in the
 * other direction — there, a failed read was resolved to an empty set and read as a legitimate
 * answer; here it would be resolved to a legitimate refusal and read as a capability decision.
 *
 * `unresolved` is a DENIAL. Nothing in this module fails open.
 */
export type PortalAdmission = "admitted" | "no-capability" | "unresolved";

/** True only for `admitted`. Written out so no caller invents its own truthiness rule. */
export function isPortalAdmitted(admission: PortalAdmission): boolean {
    return admission === "admitted";
}

/**
 * Admission from a grant union the caller has already resolved.
 *
 * `null` is the caller's W-43 answer — *the grant read FAILED* — and maps to `unresolved`, not to
 * `no-capability`. The full resolver already denies on `null` before reaching here; the mapping is
 * stated anyway so that the type, not a call ordering, is what guarantees it.
 */
export function portalAdmissionFromPermissionKeys(permissionKeys: string[] | null): PortalAdmission {
    if (permissionKeys === null) return "unresolved";
    return permissionKeys.includes(PORTAL_ADMISSION_CAPABILITY) ? "admitted" : "no-capability";
}

/**
 * Admission for a caller that has NOT fetched the grant union — the light portal context, which
 * exists precisely to skip that fetch and the scope tables behind it.
 *
 * Reads one key rather than the union, so the light path stays light: this is a single indexed
 * lookup on `(org_id, role_key, permission_key)`, not the union fetch it was built to avoid.
 *
 * **Organization-scoped by construction.** The `org_id` filter is the whole of the org-isolation
 * property the instruction asks to prove: a `portal.access` grant in one organization is a row
 * keyed to that organization, and it is never consulted for another. There is no global variant of
 * this question and no role-name shortcut past it.
 */
export async function fetchPortalAdmission(
    supabase: SupabaseClient,
    orgId: string,
    roleKeys: string[],
    where: string,
    userId: string
): Promise<PortalAdmission> {
    if (!roleKeys.length) return "no-capability";
    const { data, error } = await supabase
        .from("role_permission_grants")
        .select("permission_key")
        .eq("org_id", orgId)
        .in("role_key", roleKeys)
        .eq("permission_key", PORTAL_ADMISSION_CAPABILITY)
        .eq("allowed", true)
        .limit(1);
    if (error) {
        logAccessReadFailure(where, "role_permission_grants", userId, orgId, error.message);
        return "unresolved";
    }
    return (data?.length ?? 0) > 0 ? "admitted" : "no-capability";
}

/**
 * The refusal record for the gates that hold only the resolved boolean.
 *
 * **Why the full path can pass a constant reason and be honest about it.** On that path `unresolved`
 * cannot reach a gate: `resolveAdminAccessCore` returns `null` on a failed grant read (W-43), which
 * the bundle turns into `{ ok: false, status: 403 }` before any `portalEligible` is read. So a gate
 * looking at `bundle.ok && !bundle.portalEligible` is looking at a principal whose grants WERE read
 * and did not contain the key. The light path, which resolves the two outcomes itself, passes its
 * own.
 */
export function logPortalDenied(
    where: string,
    userId: string,
    orgId: string | null,
    reason: Exclude<PortalAdmission, "admitted">
): void {
    console.warn(
        `[access-identity][W-13][portal-denied] where=${where} user_id=${userId} ` +
            `org_id=${orgId ?? "unresolved"} reason=${reason}`
    );
}
