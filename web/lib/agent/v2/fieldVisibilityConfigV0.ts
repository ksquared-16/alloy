/**
 * Strict patch document for field definition visibility (agent v2 / admin PUT).
 * Mutates only: is_visible_in_form, is_visible_in_drawer, is_visible_in_table, is_visible_in_public_booking.
 */

const TOP = new Set([
    "version",
    "is_visible_in_form",
    "is_visible_in_drawer",
    "is_visible_in_table",
    "is_visible_in_public_booking",
]);

const VIS_KEYS = [
    "is_visible_in_form",
    "is_visible_in_drawer",
    "is_visible_in_table",
    "is_visible_in_public_booking",
] as const;

export type FieldVisibilityFlagsV0 = {
    is_visible_in_form: boolean;
    is_visible_in_drawer: boolean;
    is_visible_in_table: boolean;
    is_visible_in_public_booking: boolean;
};

export type FieldVisibilityPatchStrictResult =
    | { ok: true; value: Record<string, unknown>; keysTouched: (typeof VIS_KEYS)[number][] }
    | { ok: false; error: string };

function extraKeys(obj: Record<string, unknown>, allowed: Set<string>): string | undefined {
    for (const k of Object.keys(obj)) {
        if (!allowed.has(k)) return k;
    }
    return undefined;
}

/** Parse partial patch; at least one visibility key must be present. */
export function parseFieldVisibilityPatchStrict(raw: unknown): FieldVisibilityPatchStrictResult {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "visibility_patch must be a JSON object" };
    }
    const o = raw as Record<string, unknown>;
    const bad = extraKeys(o, TOP);
    if (bad) return { ok: false, error: `unknown key: ${bad}` };

    if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version !== 1) {
        return { ok: false, error: "version must be 1" };
    }

    const keysTouched: (typeof VIS_KEYS)[number][] = [];
    const out: Record<string, unknown> = { version: 1 };

    for (const k of VIS_KEYS) {
        if (o[k] === undefined) continue;
        if (typeof o[k] !== "boolean") {
            return { ok: false, error: `${k} must be a boolean when present` };
        }
        out[k] = o[k];
        keysTouched.push(k);
    }

    if (keysTouched.length === 0) {
        return { ok: false, error: "at least one visibility flag must be set" };
    }

    return { ok: true, value: out, keysTouched };
}

/** Merge strict patch into current flags (missing keys in patch keep current). */
export function mergeFieldVisibilityFlags(
    current: FieldVisibilityFlagsV0,
    patch: Record<string, unknown>
): FieldVisibilityFlagsV0 {
    const next = { ...current };
    for (const k of VIS_KEYS) {
        if (patch[k] !== undefined) {
            next[k] = Boolean(patch[k]);
        }
    }
    return next;
}

export function rowToVisibilityFlags(row: Record<string, unknown>): FieldVisibilityFlagsV0 {
    return {
        is_visible_in_form: Boolean(row.is_visible_in_form),
        is_visible_in_drawer: Boolean(row.is_visible_in_drawer),
        is_visible_in_table: Boolean(row.is_visible_in_table),
        is_visible_in_public_booking: Boolean(row.is_visible_in_public_booking),
    };
}

/** Optimistic lock timestamp: prefer updated_at, else created_at (matches SQL RPC). */
export function getFieldDefinitionLockTimestamp(row: Record<string, unknown>): string | null {
    const u = row.updated_at;
    const c = row.created_at;
    const t = typeof u === "string" && u.trim() ? u : typeof c === "string" && c.trim() ? c : null;
    return t;
}

export const fieldVisibilityConfigV0Schema = {
    parseStrict: parseFieldVisibilityPatchStrict,
    merge: mergeFieldVisibilityFlags,
} as const;
