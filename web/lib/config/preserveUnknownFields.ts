/**
 * Law 7 — Deterministic Serialization / Law 1 — Lossless Persistence.
 *
 * Alloy's configuration parsers are allowlist reconstructors: they rebuild typed records field by
 * field. That is good for trust (a parser never surfaces unvalidated data as typed) but it makes
 * every read-modify-write cycle LOSSY — an older writer silently destroys fields authored by a
 * newer one. That is how Firefly's `row_grain_v1` was wiped four times.
 *
 * This module keeps the allowlist discipline and makes it lossless: the residue of unowned keys
 * rides along with the parsed record and is spliced back at serialization.
 *
 * The carrier is an ENUMERABLE SYMBOL, chosen deliberately:
 *   - object spread copies own enumerable symbols, so the many `{...process, name}` style mutators
 *     across the codebase preserve the residue with no call-site changes;
 *   - `JSON.stringify` ignores symbols, so the carrier can never be persisted as real config.
 *
 * See docs/platform/governance/configuration-integrity-laws.md
 */

/** `Symbol.for` so the carrier survives duplicate module instances (test/bundler realms). */
export const UNKNOWN_FIELDS = Symbol.for("alloy.config.unknownFields");

export type WithUnknownFields = { [UNKNOWN_FIELDS]?: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Everything in `raw` that the parser does not own. Returns undefined when there is no residue,
 * so records authored entirely by this branch carry no extra weight.
 */
export function captureUnknownFields(
    raw: unknown,
    ownedKeys: readonly string[],
): Record<string, unknown> | undefined {
    if (!isRecord(raw)) return undefined;
    const owned = new Set(ownedKeys);
    let residue: Record<string, unknown> | undefined;
    for (const key of Object.keys(raw)) {
        if (owned.has(key)) continue;
        (residue ??= {})[key] = raw[key];
    }
    return residue;
}

/**
 * Attach residue to a parsed record. Returns the same object for ergonomic use inside a parser:
 * `return withUnknownFields(parsed, captureUnknownFields(raw, OWNED));`
 */
export function withUnknownFields<T extends object>(
    parsed: T,
    residue: Record<string, unknown> | undefined,
): T {
    if (residue && Object.keys(residue).length) {
        (parsed as T & WithUnknownFields)[UNKNOWN_FIELDS] = residue;
    }
    return parsed;
}

/** The residue carried by a parsed record, if any. */
export function unknownFieldsOf(value: unknown): Record<string, unknown> | undefined {
    if (value == null || typeof value !== "object") return undefined;
    return (value as WithUnknownFields)[UNKNOWN_FIELDS];
}

/**
 * Serialize one parsed record back to storable JSON: residue first, owned fields second, so a field
 * this branch understands always wins over a stale copy in the residue.
 *
 * `owned` is passed explicitly rather than derived from the object, because a parsed record may
 * legitimately omit optional keys and we must not resurrect them from residue.
 */
export function serializeWithUnknownFields<T extends object>(parsed: T): Record<string, unknown> {
    const residue = unknownFieldsOf(parsed);
    const owned: Record<string, unknown> = {};
    for (const key of Object.keys(parsed)) {
        owned[key] = (parsed as Record<string, unknown>)[key];
    }
    return residue ? { ...residue, ...owned } : owned;
}
