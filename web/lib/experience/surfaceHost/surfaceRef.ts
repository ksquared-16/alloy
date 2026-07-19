/**
 * Surface Host — the operational-surface reference (NAV-1 (A): client-driven surfaces).
 *
 * A `SurfaceRef` is the Host's client-context identity for one operational surface. The URL is a
 * PROJECTION of it, never the owner (docs/platform/experience/surface-host-architecture.md). Phase 1
 * only READS the URL into a ref (hydration); it never writes the URL (that is Phase 2).
 *
 * `key` identifies the SURFACE (kind + work-unit slug) — NOT the record. A record change within a
 * Work Unit is an intra-surface Focus Panel concern (already owned by the drawer), so it does not
 * change the surface key and must not trigger a surface transition.
 *
 * Reuses the frozen canonical operator-route parser — no new routing logic.
 */

import {
    normalizeOperatorPathname,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";

export type SurfaceKind = "workspace" | "work-unit";

export type SurfaceRef = {
    kind: SurfaceKind;
    /** Work Unit slug (work-unit surfaces only). */
    workUnitSlug: string | null;
    /** Focus Panel record open within the surface — intra-surface, not part of the surface key. */
    recordId: string | null;
    /** Stable surface identity (kind + slug). Same key = same surface (record may still differ). */
    key: string;
};

const WORKSPACE_REF: SurfaceRef = {
    kind: "workspace",
    workUnitSlug: null,
    recordId: null,
    key: "workspace",
};

/** Read the current URL into a SurfaceRef (hydration). Defensive: any parse failure → workspace. */
export function surfaceRefFromPath(pathname: string | null | undefined): SurfaceRef {
    try {
        if (!pathname) return WORKSPACE_REF;
        const normalized = normalizeOperatorPathname(pathname);
        const { workUnitSlug, recordId } = parseOperatorWorkUnitPath(normalized);
        if (workUnitSlug) {
            return {
                kind: "work-unit",
                workUnitSlug,
                recordId: recordId ?? null,
                key: `work-unit:${workUnitSlug}`,
            };
        }
        return WORKSPACE_REF;
    } catch {
        return WORKSPACE_REF;
    }
}
