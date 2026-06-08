/**
 * AdminV2 routes bundle heavy RSC payloads and/or mount expensive client data effects.
 * Next.js `<Link>` viewport prefetch issues background RSC fetches for every link in view,
 * which competes with the user's active navigation and inflates end-to-end timings.
 *
 * **Default:** pass `prefetch={false}` (or use `AdminV2NavLink`, which applies this automatically)
 * for paths below. Click navigation is unchanged. Add explicit, intent-based prefetch later only
 * if we introduce a thin shell, static segments, or other bounded prefetch targets.
 */
export function shouldDisableAdminV2LinkPrefetch(href: string): boolean {
    const path = href.split(/[?#]/)[0] ?? "";
    if (path === "/adminV2/workspace") return true;
    if (path.startsWith("/adminV2/workspace/")) return true;
    if (path === "/adminV2/workflows" || path.startsWith("/adminV2/workflows/")) return true;
    if (path === "/adminV2/ai-activity" || path.startsWith("/adminV2/ai-activity/")) return true;
    if (path === "/adminV2/settings" || path.startsWith("/adminV2/settings/")) return true;
    if (path === "/adminV2/forms" || path.startsWith("/adminV2/forms/")) return true;
    if (path === "/admin/v2" || path.startsWith("/admin/v2/")) return true;
    if (path === "/adminv2" || path.startsWith("/adminv2/")) return true;
    if (path.startsWith("/admin/opportunities")) return true;
    if (path.startsWith("/admin/system/work-units")) return true;
    /** Legacy workspace bridge under classic `/admin` still mounts heavy department/queue pages. */
    if (path.startsWith("/admin/workspace")) return true;
    return false;
}
