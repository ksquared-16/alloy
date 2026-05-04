/** Prefer `admin` when both appear in membership role_keys (compat with legacy `ctx.role`). */
export function compatibilityPortalRole(roleKeys: string[]): "admin" | "ops" {
    if (roleKeys.includes("admin")) return "admin";
    return "ops";
}
