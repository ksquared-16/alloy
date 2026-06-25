/**
 * Operator session gate — shared path classification for middleware and layouts.
 * Settings must behave like workspace: unauthenticated requests redirect to /login.
 */

import {
    CANONICAL_ADMIN_BASE,
    CANONICAL_OPERATOR_BASE,
    CANONICAL_SETTINGS_BASE,
    isCanonicalSettingsPath,
    isOperatorAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";

/** True when pathname requires an authenticated operator session. */
export function requiresOperatorSession(pathname: string): boolean {
    const p = pathname.trim();
    if (!p) return false;
    if (isOperatorAdminPath(p)) return true;
    if (isCanonicalSettingsPath(p)) return true;
    return false;
}

/** Compatibility aliases that rewrite to `/settings/*` — must not bypass auth. */
export function isSettingsCompatibilityPath(pathname: string): boolean {
    const p = pathname.trim();
    if (p === CANONICAL_SETTINGS_BASE || p.startsWith(`${CANONICAL_SETTINGS_BASE}/`)) return true;
    if (p === `${CANONICAL_ADMIN_BASE}/settings` || p.startsWith(`${CANONICAL_ADMIN_BASE}/settings/`)) {
        return true;
    }
    if (p === CANONICAL_ADMIN_BASE) return true;
    return false;
}

/** Login redirect target for unauthenticated operator surfaces. */
export function operatorLoginRedirectPath(): "/login" {
    return "/login";
}

/** Paths that must match workspace auth behavior in tests and middleware. */
export const OPERATOR_SESSION_GATE_EXAMPLES = {
    workspace: [`${CANONICAL_OPERATOR_BASE}`, `${CANONICAL_OPERATOR_BASE}/work-unit/new-leads`],
    settings: [CANONICAL_SETTINGS_BASE, `${CANONICAL_SETTINGS_BASE}/business-processes`],
    settingsCompatibility: [
        `${CANONICAL_ADMIN_BASE}/settings`,
        `${CANONICAL_ADMIN_BASE}/settings/business-processes`,
    ],
} as const;
