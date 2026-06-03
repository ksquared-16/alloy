/**
 * Drawer snapshot paint-completeness rank (Drawer Performance Contract, Card 3).
 *
 * Ranks the known drawer record surfaces by how much stable paint content they carry, so
 * snapshot writes can be MONOTONIC — a higher-completeness surface (e.g. `full`) is never
 * silently downgraded to a lower one (e.g. `drawer_primary`) within the snapshot TTL.
 *
 * Surfaces not in this ladder (person seeds, generic entity records without `_record_surface`,
 * future drawer types that don't use a primary/full split) return `null` = "unranked": the
 * monotonic guard does NOT apply to them, so their existing write behavior is preserved
 * (fallback rule — unregistered/unranked types are never made worse).
 */

export const DRAWER_SURFACE_RANK: Record<string, number> = {
    drawer_primary: 2,
    drawer_initial: 2,
    drawer_visible: 2,
    full: 3,
};

/** Numeric paint-completeness rank, or `null` when the surface is outside the known ladder. */
export function drawerSurfaceRank(record: Record<string, unknown> | null | undefined): number | null {
    if (!record || typeof record !== "object") return null;
    const surface = String((record as { _record_surface?: unknown })._record_surface ?? "").trim();
    if (!surface) return null;
    return DRAWER_SURFACE_RANK[surface] ?? null;
}

/** True only for a fully-hydrated `full` surface record. */
export function isFullDrawerSurface(record: Record<string, unknown> | null | undefined): boolean {
    if (!record || typeof record !== "object") return false;
    return String((record as { _record_surface?: unknown })._record_surface ?? "").trim() === "full";
}
