/** Shared key normalization for vertical bootstrap (aligns with admin departments / work_units). */

export const DEPARTMENT_KEY_REGEX = /^[a-z0-9_]{2,64}$/;
export const STATUS_KEY_REGEX = /^[a-z0-9_]{2,32}$/;
/** Entity types used in status_definitions / queue definitions — conservative snake_case. */
export const ENTITY_TYPE_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

export function normalizeDepartmentOrWorkUnitKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

export function normalizeStatusKey(raw: string): string {
    return raw.trim().toLowerCase();
}
