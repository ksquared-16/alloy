/**
 * Generic process stage metadata keys on status_definitions.
 * Enrollment-specific keys remain supported as legacy aliases when reading.
 */

/** Primary generic key — process builder stage rollup assignment. */
export const PROCESS_STAGE_METADATA_KEY = "process_stage_key" as const;

export const PROCESS_STAGE_UNASSIGNED = "unassigned" as const;

/** Legacy enrollment bridge key (read-only compat). */
export const LEGACY_ENROLLMENT_OPERATOR_STAGE_METADATA_KEY = "enrollment_operator_stage" as const;

const STAGE_METADATA_READ_KEYS = [
    PROCESS_STAGE_METADATA_KEY,
    "stage_key",
    "enrollment_stage_key",
    LEGACY_ENROLLMENT_OPERATOR_STAGE_METADATA_KEY,
] as const;

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

/** Parse configured process stage from status definition metadata. */
export function parseProcessStageKeyFromStatusMetadata(
    metadata: Record<string, unknown> | null | undefined,
): string | typeof PROCESS_STAGE_UNASSIGNED | null {
    if (metadata == null || typeof metadata !== "object") return null;
    for (const key of STAGE_METADATA_READ_KEYS) {
        const raw = metadata[key];
        if (raw == null) continue;
        const t = trimOrNull(raw);
        if (!t) continue;
        if (t === PROCESS_STAGE_UNASSIGNED) return PROCESS_STAGE_UNASSIGNED;
        return t;
    }
    return null;
}

export function isExcludedFromProcessStageGrouping(metadata: Record<string, unknown> | null): boolean {
    const parsed = parseProcessStageKeyFromStatusMetadata(metadata);
    return parsed === PROCESS_STAGE_UNASSIGNED;
}

/** Persist process stage rollup on status_definitions.metadata (primary write path). */
export function mergeProcessStageMetadata(
    existing: Record<string, unknown> | null | undefined,
    stage: string | typeof PROCESS_STAGE_UNASSIGNED | null,
): Record<string, unknown> {
    const base =
        existing !== null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...existing }
            : {};
    delete base[LEGACY_ENROLLMENT_OPERATOR_STAGE_METADATA_KEY];
    if (stage == null) {
        delete base[PROCESS_STAGE_METADATA_KEY];
        return base;
    }
    base[PROCESS_STAGE_METADATA_KEY] = stage;
    return base;
}

export function hasProcessStageMetadataOverride(
    metadata: Record<string, unknown> | null | undefined,
): boolean {
    return parseProcessStageKeyFromStatusMetadata(metadata) !== null;
}
