/**
 * AdminV2 routes bundle heavy RSC payloads and/or mount expensive client data effects.
 * Next.js `<Link>` viewport prefetch issues background RSC fetches for every link in view,
 * which competes with the user's active navigation and inflates end-to-end timings.
 *
 * **Default:** pass `prefetch={false}` (or use `AdminV2NavLink`, which applies this automatically)
 * for paths below. Click navigation is unchanged. Add explicit, intent-based prefetch later only
 * if we introduce a thin shell, static segments, or other bounded prefetch targets.
 */
import {
    ADMIN_AI_ACTIVITY_HREF,
    ADMIN_FORMS_HREF,
    ADMIN_SETTINGS_SUBPATH_PREFIX,
    ADMIN_WORKFLOWS_HREF,
    CANONICAL_ADMIN_WORKSPACE,
    CANONICAL_OPERATOR_BASE,
    canonicalAdminHref,
} from "@/lib/admin/canonicalAdminRoutes";

const HEAVY_ROUTE_PREFIXES = [
    CANONICAL_OPERATOR_BASE,
    CANONICAL_ADMIN_WORKSPACE,
    ADMIN_WORKFLOWS_HREF,
    ADMIN_AI_ACTIVITY_HREF,
    ADMIN_SETTINGS_SUBPATH_PREFIX,
    ADMIN_FORMS_HREF,
    "/adminV2/workflows",
    "/adminV2/ai-activity",
    "/adminV2/forms",
    "/admin/v2",
    "/adminv2",
    "/admin/opportunities",
    "/admin/system/work-units",
    "/legacy-admin",
] as const;

export function shouldDisableAdminV2LinkPrefetch(href: string): boolean {
    const path = canonicalAdminHref(href.split(/[?#]/)[0] ?? "");
    return HEAVY_ROUTE_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
}
