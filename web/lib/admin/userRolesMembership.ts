/**
 * Helpers for org membership rows in `user_roles` (composite identity: user_id + org_id + role).
 */

/** Group role keys by user_id; each user's roles are sorted uniquely. */
export function groupSortedRoleKeysByUserId(rows: { user_id: string; role: string }[]): Map<string, string[]> {
    const m = new Map<string, Set<string>>();
    for (const r of rows) {
        const role = typeof r.role === "string" ? r.role.trim() : "";
        if (!role || typeof r.user_id !== "string" || !r.user_id) continue;
        if (!m.has(r.user_id)) m.set(r.user_id, new Set());
        m.get(r.user_id)!.add(role);
    }
    return new Map([...m.entries()].map(([uid, set]) => [uid, [...set].sort((a, b) => a.localeCompare(b))]));
}

/**
 * Single value for admin UI dropdowns that expect one selected role_key.
 * Prefer portal lane roles first; otherwise first lexicographic role_key.
 */
export function displayRoleForAdminPicker(roleKeys: string[]): string {
    if (!roleKeys.length) return "";
    const s = new Set(roleKeys);
    if (s.has("admin")) return "admin";
    if (s.has("ops")) return "ops";
    return [...roleKeys].sort((a, b) => a.localeCompare(b))[0] ?? "";
}
