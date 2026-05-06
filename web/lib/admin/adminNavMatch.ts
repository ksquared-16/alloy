/**
 * Whether a sidebar nav `href` should show as active for the current pathname.
 * Exact match, plus prefix matches for multi-page hubs (workspace, forms).
 */
export function pathnameMatchesNavHref(href: string, pathname: string): boolean {
    if (href === pathname) return true;
    if (href === "/admin/workspace" && pathname.startsWith("/admin/workspace")) return true;
    if (href === "/admin/forms" && pathname.startsWith("/admin/forms")) return true;
    return false;
}
