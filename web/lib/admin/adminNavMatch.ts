/**
 * Whether a sidebar nav `href` should show as active for the current pathname.
 * Exact match, plus prefix matches for multi-page hubs (workspace).
 */
export function pathnameMatchesNavHref(href: string, pathname: string): boolean {
    if (href === pathname) return true;
    if (href === "/admin/workspace" && pathname.startsWith("/admin/workspace")) return true;
    return false;
}
