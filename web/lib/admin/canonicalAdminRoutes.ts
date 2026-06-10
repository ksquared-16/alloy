/**
 * Canonical product URLs (Phase H1 interim + Phase G operator routes).
 *
 * **Operator (Phase G — live):**
 * - `/workspace` — operator landing (daily work)
 * - `/workspace/work-unit/:workUnitSlug` — work-unit queue (slug from `work_units.key` or queue lane key)
 * - `/workspace/work-unit/:workUnitSlug/:recordId` — drawer URL state
 *
 * **Admin / config:**
 * - `/admin` — admin / settings / config landing (not operator home)
 * - `/admin/settings/*` — settings sub-surfaces (exact `/admin/settings` redirects to `/admin` interim)
 *
 * **Legacy:**
 * - `/legacy-admin` — archived old admin
 *
 * **H1 compatibility:** `/admin/workspace` still rewrites to operator workspace until bookmarks migrate.
 */

/** Public canonical admin base — use for product nav hrefs. */
export const CANONICAL_ADMIN_BASE = "/admin" as const;

/** Legacy admin implementation base (financials, old list pages, unmigrated system). */
export const LEGACY_ADMIN_BASE = "/legacy-admin" as const;

/** Transitional — redirects to {@link CANONICAL_ADMIN_BASE}. */
export const TRANSITIONAL_ADMIN_V2_BASE = "/adminV2" as const;

/** Canonical workspace entry under admin (H1 interim — operator home until `/workspace` ships). */
export const CANONICAL_ADMIN_WORKSPACE = `${CANONICAL_ADMIN_BASE}/workspace` as const;

/** Phase G — operator landing at root `/workspace`. */
export const CANONICAL_OPERATOR_BASE = "/workspace" as const;

/** Phase G — work-unit queue route prefix. */
export const CANONICAL_OPERATOR_WORK_UNIT_PREFIX = `${CANONICAL_OPERATOR_BASE}/work-unit` as const;

/** Admin / settings / config landing — not the operator home. */
export const CANONICAL_ADMIN_CONFIG_LANDING = CANONICAL_ADMIN_BASE;

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
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (p.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/`)) {
        return `${CANONICAL_ADMIN_BASE}${p.slice(TRANSITIONAL_ADMIN_V2_BASE.length)}`;
    }
    if (p === "/admin/v2" || p === "/adminv2") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
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
    if (p === CANONICAL_OPERATOR_BASE || p.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) {
        return true;
    }
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
    if (trimmed === CANONICAL_OPERATOR_BASE || trimmed.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) {
        return trimmed;
    }
    if (trimmed === TRANSITIONAL_ADMIN_V2_BASE) {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (trimmed.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/`)) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice(TRANSITIONAL_ADMIN_V2_BASE.length)}`;
    }
    if (trimmed === "/admin/v2") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (trimmed.startsWith("/admin/v2/")) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice("/admin/v2".length)}`;
    }
    if (trimmed === "/adminv2") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (trimmed.startsWith("/adminv2/")) {
        return `${CANONICAL_ADMIN_BASE}${trimmed.slice("/adminv2".length)}`;
    }
    if (trimmed === CANONICAL_ADMIN_BASE) {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    return trimmed;
}

function matchesCanonicalPrefix(pathname: string, prefix: string): boolean {
    const p = normalizeToCanonicalAdminPath(pathname);
    return p === prefix || p.startsWith(`${prefix}/`);
}

export function isCanonicalWorkspacePath(pathname: string): boolean {
    const p = pathname.trim();
    if (p === CANONICAL_OPERATOR_BASE || p.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) {
        return true;
    }
    return matchesCanonicalPrefix(pathname, CANONICAL_ADMIN_WORKSPACE);
}

export function isCanonicalSettingsPath(pathname: string): boolean {
    const p = normalizeToCanonicalAdminPath(pathname.trim());
    if (p === CANONICAL_ADMIN_BASE || p === CANONICAL_ADMIN_CONFIG_LANDING) return true;
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
    if (p === CANONICAL_OPERATOR_BASE || p.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) return true;
    if (isCanonicalWorkspacePath(p)) return true;
    if (isCanonicalSettingsPath(p)) return true;
    if (isCanonicalFormsPath(p)) return true;
    if (p.startsWith(`${LEGACY_ADMIN_BASE}/workspace`)) return true;
    return false;
}

/** Product nav — forms module base. */
export const ADMIN_FORMS_HREF = `${CANONICAL_ADMIN_BASE}/forms` as const;

/** Product nav — workflows module base. */
export const ADMIN_WORKFLOWS_HREF = `${CANONICAL_ADMIN_BASE}/workflows` as const;

/** Product nav — AI activity module base. */
export const ADMIN_AI_ACTIVITY_HREF = `${CANONICAL_ADMIN_BASE}/ai-activity` as const;

/** Product nav — settings sub-surfaces (`/admin/settings/...`). Exact `/admin` is settings landing. */
export const ADMIN_SETTINGS_SUBPATH_PREFIX = `${CANONICAL_ADMIN_BASE}/settings` as const;

/** Build `/admin/settings/:subpath` for product nav (never `/adminV2/settings/...`). */
export function adminSettingsSubpathHref(subpath: string): string {
    const trimmed = subpath.trim().replace(/^\//, "").replace(/^settings\/?/, "");
    if (!trimmed) return ADMIN_SETTINGS_SUBPATH_PREFIX;
    return `${ADMIN_SETTINGS_SUBPATH_PREFIX}/${trimmed}`;
}

/** Build `/admin/:segment` for product nav (forms, workflows, settings/…, etc.). */
export function adminProductHref(segment: string): string {
    const trimmed = segment.trim().replace(/^\//, "");
    if (!trimmed) return CANONICAL_ADMIN_CONFIG_LANDING;
    return `${CANONICAL_ADMIN_BASE}/${trimmed}`;
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
