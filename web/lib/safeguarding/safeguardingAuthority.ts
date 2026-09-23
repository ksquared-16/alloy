/**
 * Who may author a safeguarding restriction.
 *
 * ── WHY THIS IS NOT A PERMISSION-KEY CHECK ──
 *
 * `SAFEGUARDING_PERMISSIONS.manage` ("crm.customers.safeguarding.manage") is the right key name and
 * is declared in `safeguardingRestriction.ts`. It is deliberately NOT seeded into
 * `permission_definitions`: another program froze that catalog at a measured width and its own
 * tests forbid a worker appending to it, so registering these rows is a Director-owned step in
 * Access & Identity.
 *
 * That has a consequence a handler must not get wrong. `AdminContext.permissionKeys` is resolved
 * FROM that catalog, so an unseeded key can never appear in it — gating on the key alone would
 * refuse every caller forever, and a capability nobody can invoke is not a capability.
 *
 * So the gate is the authority that is real today, and it is not a weaker one: the table's own RLS
 * write policy is `has_org_role(org_id, ARRAY['owner','admin'])`, and `has_org_role` reads
 * `user_roles.role` — the same column the admin access bundle projects into `roleKeys`. Checking
 * `roleKeys` here evaluates exactly that policy for exactly this caller.
 *
 * ── WHY THE CHECK CANNOT BE LEFT TO RLS ──
 *
 * Admin routes hold a service-role client, which BYPASSES row-level security. The policy on the
 * table is the specification; it is not the enforcement on this path. If this module is removed,
 * nothing else refuses the write.
 *
 * ── WHY `ops` READS BUT DOES NOT WRITE ──
 *
 * The table's SELECT policy admits owner/admin/ops and deliberately omits `manager`, because a
 * child's protective order must not read like ordinary profile content. The write policy is
 * narrower still: authoring or lifting a restriction is an approval, and the database
 * independently refuses to activate an unreviewed row whatever the caller's role.
 */

/** Org roles that may AUTHOR or LIFT a restriction. Mirrors the table's RLS write policy. */
export const SAFEGUARDING_MANAGE_ROLES: readonly string[] = ["owner", "admin"];
/** Org roles that may READ restrictions. Mirrors the table's RLS select policy. */
export const SAFEGUARDING_VIEW_ROLES: readonly string[] = ["owner", "admin", "ops"];

function holdsAny(roleKeys: readonly string[], allowed: readonly string[]): boolean {
    const held = new Set(roleKeys.map((r) => String(r).trim()));
    return allowed.some((r) => held.has(r));
}

export function canManageSafeguarding(roleKeys: readonly string[]): boolean {
    return holdsAny(roleKeys, SAFEGUARDING_MANAGE_ROLES);
}

export function canViewSafeguarding(roleKeys: readonly string[]): boolean {
    return holdsAny(roleKeys, SAFEGUARDING_VIEW_ROLES);
}
