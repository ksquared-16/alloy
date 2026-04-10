/**
 * v1 slice: org-scoped `record_overview_layouts` for job record overview.
 * DB stores `entity_type` as `jobs` (matches RRS seeds + `loadRecordOverviewLayoutRow` callers).
 * Public API / agent slots may use singular `job` — normalize here.
 */

export const RECORD_OVERVIEW_LAYOUT_V1_ENTITY_DB = "jobs" as const;
export const RECORD_OVERVIEW_LAYOUT_V1_SURFACE = "overview" as const;

/** Accept `job` or `jobs` (case-insensitive); returns DB value or null. */
export function normalizeRecordOverviewEntityTypeParam(raw: string | null | undefined): typeof RECORD_OVERVIEW_LAYOUT_V1_ENTITY_DB | null {
    const t = raw?.trim().toLowerCase();
    if (!t) return null;
    if (t === "job" || t === "jobs") return RECORD_OVERVIEW_LAYOUT_V1_ENTITY_DB;
    return null;
}

export function isRecordOverviewLayoutV1Scope(entityDb: string, surface: string): boolean {
    return entityDb === RECORD_OVERVIEW_LAYOUT_V1_ENTITY_DB && surface === RECORD_OVERVIEW_LAYOUT_V1_SURFACE;
}
