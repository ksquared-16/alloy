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

/** Manage-menu destructive ops (delete lead) — aligned with `requireAdminOrOps` API gates. */
export function hasPortalRecordManageAccess(roleKeys: readonly string[]): boolean {
    return roleKeys.some((k) => {
        const key = String(k).trim().toLowerCase();
        return key === "admin" || key === "ops";
    });
}

export function resolvePortalRecordManageAccess(params: {
    roleKeys: readonly string[];
    legacyRole?: string | null;
}): boolean {
    const keys = params.roleKeys.map((k) => String(k).trim()).filter(Boolean);
    if (keys.length > 0) return hasPortalRecordManageAccess(keys);
    const legacy = (params.legacyRole ?? "").trim().toLowerCase();
    return legacy === "admin" || legacy === "ops";
}
