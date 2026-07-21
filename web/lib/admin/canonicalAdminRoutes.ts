/**
 * Canonical product URLs (Phase H1 interim + Phase G operator routes).
 *
 * **Operator (Phase G — live):**
 * - `/workspace` — operator landing (daily work)
 * - `/workspace/work-unit/:workUnitSlug` — work-unit queue (slug from `work_units.key` or queue lane key)
 * - `/workspace/work-unit/:workUnitSlug/:recordId` — drawer URL state
 *
 * **Admin / config:**
 * - `/organization` — Organization configuration landing
 * - `/organization/programs` — Organization Programs (canonical)
 * - `/settings/*` — settings sub-surfaces (compatibility / remaining domains)
 * - `/admin/settings/*` — compatibility redirect → `/settings/*`
 * - `/settings`, `/settings/organization`, `/admin` — compatibility redirects → `/organization`
 * - `/settings/commercial/programs` — compatibility redirect → `/organization/programs`
 *
 * **Legacy:**
 * - `/legacy-admin` — archived old admin
 *
 * **H1 compatibility:** `/admin/workspace` still rewrites to operator workspace until bookmarks migrate.
 */

/** Public canonical admin base — non-settings admin modules (forms, workflows, …). */
export const CANONICAL_ADMIN_BASE = "/admin" as const;

/** Alloy OS Configuration Runtime — canonical Settings base URL. */
export const CANONICAL_SETTINGS_BASE = "/settings" as const;

/** Canonical Organization configuration landing. */
export const CANONICAL_ORGANIZATION_BASE = "/organization" as const;

/**
 * Canonical Organization Programs surface.
 * Compatibility `/settings/commercial/programs` redirects here; do not treat Commercial as product IA.
 */
export const CANONICAL_ORGANIZATION_PROGRAMS_HREF = `${CANONICAL_ORGANIZATION_BASE}/programs` as const;

/** Legacy admin implementation base (financials, old list pages, unmigrated system). */
export const LEGACY_ADMIN_BASE = "/legacy-admin" as const;

/** Transitional — redirects to {@link CANONICAL_ADMIN_CONFIG_LANDING}. */
export const TRANSITIONAL_ADMIN_V2_BASE = "/adminV2" as const;

/** Canonical workspace entry under admin (H1 interim — operator home until `/workspace` ships). */
export const CANONICAL_ADMIN_WORKSPACE = `${CANONICAL_ADMIN_BASE}/workspace` as const;

/** Phase G — operator landing at root `/workspace`. */
export const CANONICAL_OPERATOR_BASE = "/workspace" as const;

/** Phase G — work-unit queue route prefix. */
export const CANONICAL_OPERATOR_WORK_UNIT_PREFIX = `${CANONICAL_OPERATOR_BASE}/work-unit` as const;

/** Organization configuration landing. */
export const CANONICAL_ADMIN_CONFIG_LANDING = CANONICAL_ORGANIZATION_BASE;

/**
 * Path prefixes served by the canonical AdminV2 app (rewrite targets).
 * Any other `/admin/*` path redirects to the matching `/legacy-admin/*` route.
 */
export const CANONICAL_ADMIN_PATH_PREFIXES = [
    `${CANONICAL_ADMIN_BASE}/workspace`,
    `${CANONICAL_ADMIN_BASE}/settings`,
    CANONICAL_ORGANIZATION_BASE,
    `${CANONICAL_SETTINGS_BASE}`,
    `${CANONICAL_ADMIN_BASE}/workflows`,
    `${CANONICAL_ADMIN_BASE}/messages`,
    `${CANONICAL_ADMIN_BASE}/ai-activity`,
    `${CANONICAL_ADMIN_BASE}/finance`,
    `${CANONICAL_ADMIN_BASE}/tasks`,
    `${CANONICAL_ADMIN_BASE}/compliance`,
    `${CANONICAL_ADMIN_BASE}/operations`,
    `${CANONICAL_ADMIN_BASE}/inquiries`,
    `${CANONICAL_ADMIN_BASE}/processing`,
    `${CANONICAL_ADMIN_BASE}/system`,
] as const;

export function isCanonicalAdminPath(pathname: string): boolean {
    const p = pathname.trim();
    if (p === CANONICAL_ADMIN_BASE) return true;
    if (p === CANONICAL_ORGANIZATION_BASE || p.startsWith(`${CANONICAL_ORGANIZATION_BASE}/`)) return true;
    if (p === CANONICAL_SETTINGS_BASE || p.startsWith(`${CANONICAL_SETTINGS_BASE}/`)) return true;
    return CANONICAL_ADMIN_PATH_PREFIXES.some(
        (prefix) => p === prefix || p.startsWith(`${prefix}/`),
    );
}

/** Build Organization Programs href; optional selection/detail state survives refresh. */
export function organizationProgramsHref(
    programId?: string | null,
    section?: string | null,
): string {
    const id = typeof programId === "string" ? programId.trim() : "";
    const detailSection = typeof section === "string" ? section.trim() : "";
    const params = new URLSearchParams();
    if (id) params.set("programId", id);
    if (id && detailSection && detailSection !== "overview") {
        params.set("section", detailSection);
    }
    const query = params.toString();
    return query ? `${CANONICAL_ORGANIZATION_PROGRAMS_HREF}?${query}` : CANONICAL_ORGANIZATION_PROGRAMS_HREF;
}

/** Map old `/admin/...` bookmark to operator workspace when not canonical. */
export function legacyAdminRedirectTarget(pathname: string): string | null {
    const p = pathname.trim();
    if (!p.startsWith(`${CANONICAL_ADMIN_BASE}/`) && p !== CANONICAL_ADMIN_BASE) {
        return null;
    }
    if (isCanonicalAdminPath(p)) return null;
    return CANONICAL_OPERATOR_BASE;
}

/** Normalize transitional `/adminV2` or `/admin/v2` paths to canonical settings landing. */
export function normalizeTransitionalAdminPath(pathname: string): string | null {
    const p = pathname.trim();
    if (p === TRANSITIONAL_ADMIN_V2_BASE) {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (p.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/settings/`)) {
        const normalized = `${CANONICAL_SETTINGS_BASE}${p.slice(`${TRANSITIONAL_ADMIN_V2_BASE}/settings`.length)}`;
        return normalized === `${CANONICAL_SETTINGS_BASE}/organization` ? CANONICAL_ADMIN_CONFIG_LANDING : normalized;
    }
    if (p === `${TRANSITIONAL_ADMIN_V2_BASE}/settings`) {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (p.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/`)) {
        return `${CANONICAL_ADMIN_BASE}${p.slice(TRANSITIONAL_ADMIN_V2_BASE.length)}`;
    }
    if (p === "/admin/v2" || p === "/adminv2") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (p.startsWith("/admin/v2/settings/")) {
        const normalized = `${CANONICAL_SETTINGS_BASE}${p.slice("/admin/v2/settings".length)}`;
        return normalized === `${CANONICAL_SETTINGS_BASE}/organization` ? CANONICAL_ADMIN_CONFIG_LANDING : normalized;
    }
    if (p === "/admin/v2/settings") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (p.startsWith("/admin/v2/")) {
        return `${CANONICAL_ADMIN_BASE}${p.slice("/admin/v2".length)}`;
    }
    if (p.startsWith("/adminv2/settings/")) {
        const normalized = `${CANONICAL_SETTINGS_BASE}${p.slice("/adminv2/settings".length)}`;
        return normalized === `${CANONICAL_SETTINGS_BASE}/organization` ? CANONICAL_ADMIN_CONFIG_LANDING : normalized;
    }
    if (p === "/adminv2/settings") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
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
        p === CANONICAL_ORGANIZATION_BASE ||
        p.startsWith(`${CANONICAL_ORGANIZATION_BASE}/`) ||
        p === CANONICAL_SETTINGS_BASE ||
        p.startsWith(`${CANONICAL_SETTINGS_BASE}/`) ||
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

/** Normalize browser pathname to the Organization landing or canonical settings subpaths. */
export function normalizeToCanonicalSettingsPath(pathname: string): string {
    const trimmed = pathname.trim();
    if (
        trimmed === "/admin" ||
        trimmed === "/admin/settings" ||
        trimmed === CANONICAL_SETTINGS_BASE ||
        trimmed === `${CANONICAL_SETTINGS_BASE}/organization` ||
        trimmed === CANONICAL_ORGANIZATION_BASE
    ) {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (trimmed.startsWith("/admin/settings/")) {
        const normalized = `${CANONICAL_SETTINGS_BASE}${trimmed.slice("/admin/settings".length)}`;
        return normalized === `${CANONICAL_SETTINGS_BASE}/organization` ? CANONICAL_ADMIN_CONFIG_LANDING : normalized;
    }
    if (trimmed.startsWith(`${CANONICAL_SETTINGS_BASE}/`)) {
        return trimmed;
    }
    if (trimmed === TRANSITIONAL_ADMIN_V2_BASE || trimmed === "/admin/v2" || trimmed === "/adminv2") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    if (trimmed.startsWith(`${TRANSITIONAL_ADMIN_V2_BASE}/settings/`)) {
        const normalized = `${CANONICAL_SETTINGS_BASE}${trimmed.slice(`${TRANSITIONAL_ADMIN_V2_BASE}/settings`.length)}`;
        return normalized === `${CANONICAL_SETTINGS_BASE}/organization` ? CANONICAL_ADMIN_CONFIG_LANDING : normalized;
    }
    if (trimmed === `${TRANSITIONAL_ADMIN_V2_BASE}/settings`) {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    return trimmed;
}

/**
 * Normalize browser pathname to canonical settings or admin paths for route matching.
 * Accepts transitional `/adminV2`, `/admin/v2`, `/adminv2` aliases.
 */
export function normalizeToCanonicalAdminPath(pathname: string): string {
    const trimmed = pathname.trim();
    if (trimmed === CANONICAL_OPERATOR_BASE || trimmed.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) {
        return trimmed;
    }

    const settingsNormalized = normalizeToCanonicalSettingsPath(trimmed);
    if (
        settingsNormalized === CANONICAL_ADMIN_CONFIG_LANDING ||
        settingsNormalized === CANONICAL_SETTINGS_BASE ||
        settingsNormalized.startsWith(`${CANONICAL_SETTINGS_BASE}/`)
    ) {
        return settingsNormalized;
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
    if (p === CANONICAL_ORGANIZATION_BASE || p.startsWith(`${CANONICAL_ORGANIZATION_BASE}/`)) return true;
    if (p === CANONICAL_SETTINGS_BASE || p.startsWith(`${CANONICAL_SETTINGS_BASE}/`)) return true;
    if (p === CANONICAL_ADMIN_CONFIG_LANDING) return true;
    return matchesCanonicalPrefix(pathname, `${CANONICAL_ADMIN_BASE}/settings`);
}

export function isCanonicalWorkflowsPath(pathname: string): boolean {
    return matchesCanonicalPrefix(pathname, `${CANONICAL_ADMIN_BASE}/workflows`);
}

export function isCanonicalAiActivityPath(pathname: string): boolean {
    return matchesCanonicalPrefix(pathname, `${CANONICAL_ADMIN_BASE}/ai-activity`);
}

/**
 * Drawer VM and workspace runtime gates — canonical settings plus transitional aliases
 * until redirects fully settle bookmarks.
 */
export function isCanonicalDrawerHostPath(pathname: string | null | undefined): boolean {
    if (!pathname) return false;
    const p = normalizeToCanonicalAdminPath(pathname.trim());
    if (p === CANONICAL_OPERATOR_BASE || p.startsWith(`${CANONICAL_OPERATOR_BASE}/`)) return true;
    if (isCanonicalWorkspacePath(p)) return true;
    if (isCanonicalSettingsPath(p)) return true;
    // POS-FP4: Processing Workspace hosts the read-only Processing Case detail drawer.
    if (p === `${CANONICAL_ADMIN_BASE}/processing` || p.startsWith(`${CANONICAL_ADMIN_BASE}/processing/`)) return true;
    if (p.startsWith(`${LEGACY_ADMIN_BASE}/workspace`)) return true;
    return false;
}

/**
 * Root `ConditionalSiteLayout` must not wrap these paths in marketing header/footer.
 * Includes browser-visible `/workspace` and `/settings` plus transitional admin aliases.
 */
export function isPublicMarketingChromeSuppressedPath(pathname: string | null | undefined): boolean {
    if (!pathname) return false;
    const p = pathname.trim();
    if (
        p.startsWith("/adminV2") ||
        p.startsWith("/adminv2") ||
        p.startsWith("/legacy-admin") ||
        p.startsWith("/admin")
    ) {
        return true;
    }
    return isCanonicalWorkspacePath(p) || isCanonicalSettingsPath(p);
}

/** Product nav — workflows module base. */
export const ADMIN_WORKFLOWS_HREF = `${CANONICAL_ADMIN_BASE}/workflows` as const;

/** Product nav — AI activity module base. */
export const ADMIN_AI_ACTIVITY_HREF = `${CANONICAL_ADMIN_BASE}/ai-activity` as const;

/** Product nav — settings sub-surfaces (`/settings/...`). */
export const ADMIN_SETTINGS_SUBPATH_PREFIX = CANONICAL_SETTINGS_BASE;

/** Product nav — Settings → Surfaces (Experience Builder / Design Surfaces). */
export const SURFACES_SETTINGS_HREF = `${ADMIN_SETTINGS_SUBPATH_PREFIX}/surfaces` as const;

/**
 * @deprecated Product IA renamed Layouts → Surfaces. Repointed to the canonical
 * `/settings/surfaces` route; prefer `SURFACES_SETTINGS_HREF`. Kept so existing
 * imports keep linking to the canonical surface (no `/settings/layouts` in nav).
 */
export const LAYOUTS_SETTINGS_HREF = SURFACES_SETTINGS_HREF;

/** Build `/settings/:subpath` for product nav (never `/adminV2/settings/...`). */
export function adminSettingsSubpathHref(subpath: string): string {
    const trimmed = subpath.trim().replace(/^\//, "").replace(/^settings\/?/, "");
    if (!trimmed || trimmed === "organization") return CANONICAL_ADMIN_CONFIG_LANDING;
    return `${ADMIN_SETTINGS_SUBPATH_PREFIX}/${trimmed}`;
}

/** Build `/admin/:segment` for product nav (forms, workflows, settings/…, etc.). */
export function adminProductHref(segment: string): string {
    const trimmed = segment.trim().replace(/^\//, "");
    if (!trimmed) return CANONICAL_ADMIN_CONFIG_LANDING;
    if (trimmed === "settings" || trimmed.startsWith("settings/")) {
        return adminSettingsSubpathHref(trimmed.replace(/^settings\/?/, ""));
    }
    return `${CANONICAL_ADMIN_BASE}/${trimmed}`;
}

/** Build canonical admin href (prefer over `/adminV2/...` in product nav). */
export function canonicalAdminHref(path: string): string {
    const trimmed = path.trim();
    if (trimmed.startsWith(TRANSITIONAL_ADMIN_V2_BASE)) {
        const suffix = trimmed.slice(TRANSITIONAL_ADMIN_V2_BASE.length);
        if (suffix === "/settings" || suffix.startsWith("/settings/")) {
            const normalized = `${CANONICAL_SETTINGS_BASE}${suffix.slice("/settings".length)}`;
            return normalized === CANONICAL_SETTINGS_BASE || normalized === `${CANONICAL_SETTINGS_BASE}/organization`
                ? CANONICAL_ADMIN_CONFIG_LANDING
                : normalized;
        }
        return `${CANONICAL_ADMIN_BASE}${suffix}`;
    }
    if (trimmed.startsWith("/admin/v2")) {
        const suffix = trimmed.slice("/admin/v2".length);
        if (suffix === "/settings" || suffix.startsWith("/settings/")) {
            const normalized = `${CANONICAL_SETTINGS_BASE}${suffix.slice("/settings".length)}`;
            return normalized === CANONICAL_SETTINGS_BASE || normalized === `${CANONICAL_SETTINGS_BASE}/organization`
                ? CANONICAL_ADMIN_CONFIG_LANDING
                : normalized;
        }
        return `${CANONICAL_ADMIN_BASE}${suffix}`;
    }
    if (trimmed.startsWith("/adminv2")) {
        const suffix = trimmed.slice("/adminv2".length);
        if (suffix === "/settings" || suffix.startsWith("/settings/")) {
            const normalized = `${CANONICAL_SETTINGS_BASE}${suffix.slice("/settings".length)}`;
            return normalized === CANONICAL_SETTINGS_BASE || normalized === `${CANONICAL_SETTINGS_BASE}/organization`
                ? CANONICAL_ADMIN_CONFIG_LANDING
                : normalized;
        }
        return `${CANONICAL_ADMIN_BASE}${suffix}`;
    }
    if (trimmed.startsWith("/admin/settings/")) {
        const normalized = `${CANONICAL_SETTINGS_BASE}${trimmed.slice("/admin/settings".length)}`;
        return normalized === `${CANONICAL_SETTINGS_BASE}/organization` ? CANONICAL_ADMIN_CONFIG_LANDING : normalized;
    }
    if (trimmed === "/admin/settings" || trimmed === "/admin") {
        return CANONICAL_ADMIN_CONFIG_LANDING;
    }
    return trimmed;
}
