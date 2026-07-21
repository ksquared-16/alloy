/**
 * Configuration Continuity — Organization Runtime Foundation (Checkpoint A).
 *
 * Shared runtime infrastructure for `/organization` and `/settings/*`.
 * Inherits Work Unit *laws* (acknowledge → retain → warm → settle) without
 * importing Work Unit product grain (queues, Focus Panel, Work Views).
 *
 * @see docs/audits/active/organization-runtime-checkpoint-a-2026-07.md
 */

import {
    CANONICAL_ORGANIZATION_BASE,
    CANONICAL_ORGANIZATION_FINANCIALS_HREF,
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    CANONICAL_SETTINGS_BASE,
    isCanonicalSettingsPath,
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    LOCATION_SETTINGS_PATH,
    ORGANIZATION_LOCATIONS_PATH,
} from "@/lib/admin/canonicalLocationSettingsRoutes";
import { emitPerf, perfDevDetailEnabled } from "@/lib/perf/perfNamespaceLog";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

/** Soft-nav loading variants for Configuration Continuity (not Work Unit grain). */
export type ConfigurationSoftNavVariant = "organization" | "configuration";

/**
 * True when the href is inside the Organization / Settings configuration namespace.
 * Workflows, forms, and operator workspace paths are excluded.
 */
export function isConfigurationSoftNavEligibleHref(href: string): boolean {
    const pathOnly = (href.split(/[?#]/)[0] ?? href).trim();
    const withSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    const normalized = normalizeToCanonicalAdminPath(withSlash);
    return isCanonicalSettingsPath(normalized);
}

export function resolveConfigurationSoftNavVariant(href: string): ConfigurationSoftNavVariant {
    const pathOnly = (href.split(/[?#]/)[0] ?? href).trim();
    const withSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    const normalized = normalizeToCanonicalAdminPath(withSlash);
    if (
        normalized === CANONICAL_ORGANIZATION_BASE
        || normalized === `${CANONICAL_ORGANIZATION_BASE}/`
    ) {
        return "organization";
    }
    return "configuration";
}

/** Canonical path comparison for soft-nav reload floor (settings + organization). */
export function normalizeConfigurationSoftNavPathname(pathname: string): string {
    return normalizeToCanonicalAdminPath(pathname.trim());
}

export type ConfigurationPrefetchTarget =
    | typeof CANONICAL_ORGANIZATION_BASE
    | typeof ORGANIZATION_LOCATIONS_PATH
    | typeof LOCATION_SETTINGS_PATH
    | typeof CANONICAL_ORGANIZATION_PROGRAMS_HREF
    | typeof CANONICAL_ORGANIZATION_FINANCIALS_HREF
    | `${typeof CANONICAL_SETTINGS_BASE}/${string}`;

/**
 * Route-aware prefetch for Configuration Continuity.
 * Uses Next.js router.prefetch when available; never blocks navigation.
 */
export function prepareConfigurationSoftNavTarget(
    href: string,
    prefetch?: (href: string) => void | Promise<void>,
): void | Promise<void> {
    const pathOnly = (href.split(/[?#]/)[0] ?? href).trim();
    if (!pathOnly || !isConfigurationSoftNavEligibleHref(pathOnly)) return;
    markConfigurationContinuity("prefetch", { href: pathOnly });
    if (!prefetch) return;
    try {
        return prefetch(pathOnly);
    } catch {
        /* prefetch is best-effort */
    }
}

export type ConfigurationContinuitySignal =
    | "intent"
    | "acknowledge"
    | "prefetch"
    | "shell_retained"
    | "reveal"
    | "invalidated";

export function configurationContinuityMarksEnabled(): boolean {
    if (process.env.NEXT_PUBLIC_PERF_PERCEIVED_MARKS === "0") return false;
    return perfDevDetailEnabled();
}

/** Boundary marks for Organization Continuity (dev/staging). */
export function markConfigurationContinuity(
    signal: ConfigurationContinuitySignal,
    payload: Record<string, unknown> = {},
): number | null {
    if (!configurationContinuityMarksEnabled()) return null;
    const t = typeof performance !== "undefined" ? performance.now() : null;
    emitPerf("settings", `continuity:${signal}`, { interaction: "configuration_continuity", signal, ...payload });
    if (t != null) {
        alloyPerfSet(`config_continuity_${signal}`, t);
    }
    return t;
}

/**
 * Primary Configuration Continuity destinations operators warm most often.
 * Seeds Organization + Locations + Programs + Financials landing (+ common sections).
 */
export const CONFIGURATION_CONTINUITY_WARM_HREFS = [
    CANONICAL_ORGANIZATION_BASE,
    ORGANIZATION_LOCATIONS_PATH,
    CANONICAL_ORGANIZATION_PROGRAMS_HREF,
    CANONICAL_ORGANIZATION_FINANCIALS_HREF,
    `${CANONICAL_ORGANIZATION_FINANCIALS_HREF}?chapter=tuition`,
    `${CANONICAL_ORGANIZATION_FINANCIALS_HREF}?chapter=catalog`,
    `${CANONICAL_ORGANIZATION_FINANCIALS_HREF}?chapter=policies`,
] as const;
