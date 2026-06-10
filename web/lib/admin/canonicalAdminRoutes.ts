/**
 * Canonical product URLs (Phase H1 interim + Phase G target doctrine).
 *
 * **H1 interim (live today):** `/admin/*` rewrites to `app/adminV2/*`; legacy at `/legacy-admin/*`.
 *
 * **Target doctrine (Phase G — not yet routed):**
 * - `/workspace` — operator landing (daily work)
 * - `/workspace/work-unit/:workUnitSlug` — work-unit queue
 * - `/workspace/work-unit/:workUnitSlug/:recordId` — drawer URL state
 * - `/admin` — admin / settings / config landing (not the operator home)
 * - `/legacy-admin` — archived old admin (financials until migrated)
 *
 * H1 still serves operator workspace at `/admin/workspace` until `/workspace` routes ship.
 */

/** Public canonical admin base — use for product nav hrefs. */
export const CANONICAL_ADMIN_BASE = "/admin" as const;

/** Legacy admin implementation base (financials, old list pages, unmigrated system). */
export const LEGACY_ADMIN_BASE = "/legacy-admin" as const;

/** Transitional — redirects to {@link CANONICAL_ADMIN_BASE}. */
export const TRANSITIONAL_ADMIN_V2_BASE = "/adminV2" as const;

/** Canonical workspace entry under admin (H1 interim — operator home until `/workspace` ships). */
export const CANONICAL_ADMIN_WORKSPACE = `${CANONICAL_ADMIN_BASE}/workspace` as const;

/** Phase G target — operator landing at root `/workspace` (not routed yet). */
export const CANONICAL_OPERATOR_BASE = "/workspace" as const;

/** Phase G target — work-unit queue route prefix. */
export const CANONICAL_OPERATOR_WORK_UNIT_PREFIX = `${CANONICAL_OPERATOR_BASE}/work-unit` as const;

/**
 * Path prefixes served by the canonical AdminV2 app (rewrite targets).
 * Any other `/admin/*` path redirects to the matching `/legacy-admin/*` route.
 */
export const CANONICAL_ADMIN_PATH_PREFIXES = [
    `${CANONICAL_ADMIN_BASE}/workspace`,
    `${CANONICAL_ADMIN_BASE}/settings`,
    `${CANONICAL_ADMIN_BASE}/forms`,
    `${CANONICAL_ADMIN_BASE}/workflows`,
    `${CANONICAL_ADMIN_BASE}/messages`,
    `${CANONICAL_ADMIN_BASE}/ai-activity`,
    `${CANONICAL_ADMIN_BASE}/finance`,
    `${CANONICAL_ADMIN_BASE}/tasks`,
    `${CANONICAL_ADMIN_BASE}/compliance`,
    `${CANONICAL_ADMIN_BASE}/operations`,
    `${CANONICAL_ADMIN_BASE}/inquiries`,
    `${CANONICAL_ADMIN_BASE}/system`,
] as const;

export function isCanonicalAdminPath(pathname: string): boolean {
    const p = pathname.trim();
    if (p === CANONICAL_ADMIN_BASE) return true;
    return CANONICAL_ADMIN_PATH_PREFIXES.some(
        (prefix) => p === prefix || p.startsWith(`${prefix}/`),
    );
}

/** Map old `/admin/...` bookmark to `/legacy-admin/...` when not canonical. */
export function legacyAdminRedirectTarget(pathname: string): string | null {
    const p = pathname.trim();
    if (!p.startsWith(`${CANONICAL_ADMIN_BASE}/`) && p !== CANONICAL_ADMIN_BASE) {
        return null;
    }
    if (isCanonicalAdminPath(p)) return null;
    const suffix = p === CANONICAL_ADMIN_BASE ? "" : p.slice(CANONICAL_ADMIN_BASE.length);
    return `${LEGACY_ADMIN_BASE}${suffix}`;
}

/** Normalize transitional `/adminV2` or `/admin/v2` paths to canonical `/admin`. */
export function normalizeTransitionalAdminPath(pathname: string): string | null {
    const p = pathname.trim();
    if (p === TRANSITIONAL_ADMIN_V2_BASE) {
        return CANONICAL_ADMIN_WORKSPACE;
    }
    if (p.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/`)) {
        return `${CANONICAL_ADMIN_BASE}${p.slice(TRANSITIONAL_ADMIN_V2_BASE.length)}`;
    }
    if (p === "/admin/v2" || p === "/adminv2") {
        return CANONICAL_ADMIN_WORKSPACE;
    }
    if (p.startsWith("/admin/v2/")) {
        return `${CANONICAL_ADMIN_BASE}${p.slice("/admin/v2".length)}`;
    }
    if (p.startsWith("/adminv2/")) {
        return `${CANONICAL_ADMIN_BASE}${p.slice("/adminv2".length)}`;
    }
    return null;
}

/** True when pathname is canonical admin or legacy admin (auth-protected operator surfaces). */
export function isOperatorAdminPath(pathname: string): boolean {
    const p = pathname.trim();
    return (
        p === CANONICAL_ADMIN_BASE ||
        p.startsWith(`${CANONICAL_ADMIN_BASE}/`) ||
        p === LEGACY_ADMIN_BASE ||
        p.startsWith(`${LEGACY_ADMIN_BASE}/`) ||
        p === TRANSITIONAL_ADMIN_V2_BASE ||
        p.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/`) ||
        p === "/admin/v2" ||
        p.startsWith("/admin/v2/") ||
        p === "/adminv2" ||
        p.startsWith("/adminv2/")
    );
}

/**
 * Normalize browser pathname to canonical `/admin/...` for route matching.
 * Accepts transitional `/adminV2`, `/admin/v2`, `/adminv2` aliases.
 */
export function normalizeToCanonicalAdminPath(pathname: string): string {
    const trimmed = pathname.trim();
    if (trimmed === TRANSITIONAL_ADMIN_V2_BASE) {
        return CANONICAL_ADMIN_WORKSPACE;
    }
    if (trimmed.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/`)) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice(TRANSITIONAL_ADMIN_V2_BASE.length)}`;
    }
    if (trimmed === "/admin/v2") {
        return CANONICAL_ADMIN_WORKSPACE;
    }
    if (trimmed.startsWith("/admin/v2/")) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice("/admin/v2".length)}`;
    }
    if (trimmed === "/adminv2") {
        return CANONICAL_ADMIN_WORKSPACE;
    }
    if (trimmed.startsWith("/adminv2/")) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice("/adminv2".length)}`;
    }
    if (trimmed === CANONICAL_ADMIN_BASE) {
        return CANONICAL_ADMIN_WORKSPACE;
    }
    return trimmed;
}

function matchesCanonicalPrefix(pathname: string, prefix: string): boolean {
    const p = normalizeToCanonicalAdminPath(pathname);
    return p === prefix || p.startsWith(`${prefix}/`);
}

export function isCanonicalWorkspacePath(pathname: string): boolean {
    return matchesCanonicalPrefix(pathname, CANONICAL_ADMIN_WORKSPACE);
}

export function isCanonicalSettingsPath(pathname: string): boolean {
    return matchesCanonicalPrefix(pathname, `${CANONICAL_ADMIN_BASE}/settings`);
}

export function isCanonicalWorkflowsPath(pathname: string): boolean {
    return matchesCanonicalPrefix(pathname, `${CANONICAL_ADMIN_BASE}/workflows`);
}

export function isCanonicalFormsPath(pathname: string): boolean {
    return matchesCanonicalPrefix(pathname, `${CANONICAL_ADMIN_BASE}/forms`);
}

export function isCanonicalAiActivityPath(pathname: string): boolean {
    return matchesCanonicalPrefix(pathname, `${CANONICAL_ADMIN_BASE}/ai-activity`);
}

/**
 * Drawer VM and workspace runtime gates — canonical `/admin` plus transitional aliases
 * until redirects fully settle bookmarks.
 */
export function isCanonicalDrawerHostPath(pathname: string | null | undefined): boolean {
    if (!pathname) return false;
    const p = normalizeToCanonicalAdminPath(pathname.trim());
    if (isCanonicalWorkspacePath(p)) return true;
    if (isCanonicalSettingsPath(p)) return true;
    if (isCanonicalFormsPath(p)) return true;
    if (p.startsWith(`${LEGACY_ADMIN_BASE}/workspace`)) return true;
    return false;
}

/** Build canonical admin href (prefer over `/adminV2/...` in product nav). */
export function canonicalAdminHref(path: string): string {
    const trimmed = path.trim();
    if (trimmed.startsWith(TRANSITIONAL_ADMIN_V2_BASE)) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice(TRANSITIONAL_ADMIN_V2_BASE.length)}`;
    }
    if (trimmed.startsWith("/admin/v2")) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice("/admin/v2".length)}`;
    }
    if (trimmed.startsWith("/adminv2")) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice("/adminv2".length)}`;
    }
    return trimmed;
}
