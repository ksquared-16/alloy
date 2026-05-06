/** Prefer `admin` when both appear in membership role_keys (compat with legacy `ctx.role`). */
export function compatibilityPortalRole(roleKeys: string[]): "admin" | "ops" {
    if (hasPortalAdminMutateAccess(roleKeys)) return "admin";
    return "ops";
}

/**
 * True when org membership includes the portal **`admin`** role key (exact match after trim).
 * Aligns with admin-only API gates (`ctx.role === "admin"` derived from the same `roleKeys`).
 */
export function hasPortalAdminMutateAccess(roleKeys: readonly string[]): boolean {
    return roleKeys.some((k) => String(k).trim() === "admin");
}
