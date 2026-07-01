/**
 * Canonical status read helpers (Phase 4).
 *
 * Runtime loaders use status_key only. Legacy text columns are isolated to
 * maintenance-only helpers in canonicalLegacyStatusMaintenance.ts.
 */

function trimStatus(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Runtime default — status_key only (opportunities, persons, customers). */
export function resolveCanonicalStatusKey(row: { status_key?: unknown }): string | null {
    return trimStatus(row.status_key);
}

/** Enrollment case grain. */
export function resolveOpportunityCaseStatusKey(row: { status_key?: unknown }): string | null {
    return resolveCanonicalStatusKey(row);
}

/** Child enrollment / outcome grain (OCM only — no legacy text column). */
export function resolveOcmOutcomeStatusKey(row: { outcome_status_key?: unknown }): string | null {
    return trimStatus(row.outcome_status_key);
}
