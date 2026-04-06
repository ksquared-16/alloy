/**
 * Validation for field_definitions.config (select / multiselect options and catalog refs).
 */

export const ALLOWED_CATALOG_KEYS = ["home_types", "pricing_sqft_tiers"] as const;
export type CatalogKey = (typeof ALLOWED_CATALOG_KEYS)[number];

export type FieldOption = { value: string; label: string };

export function isCatalogKey(s: string): s is CatalogKey {
    return (ALLOWED_CATALOG_KEYS as readonly string[]).includes(s);
}

function isOptionRow(x: unknown): x is FieldOption {
    if (x == null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.value === "string" && o.value.trim() !== "" && typeof o.label === "string";
}

/** Validate config for select / multiselect: require options array or catalog_key. */
export function validateSelectLikeConfig(
    fieldType: string,
    config: unknown | null | undefined
): { ok: true } | { ok: false; error: string } {
    const t = (fieldType || "").toLowerCase();
    if (t !== "select" && t !== "multiselect") return { ok: true };

    const c = config ?? {};

    // Production may store options as a raw JSON array on `config` instead of `{ options: [...] }`.
    if (Array.isArray(c)) {
        if (c.length === 0) {
            return {
                ok: false,
                error: "select/multiselect requires a non-empty options array or config.catalog_key",
            };
        }
        for (const row of c) {
            if (!isOptionRow(row)) {
                return { ok: false, error: "Each options entry must be { value: string, label: string }" };
            }
        }
        return { ok: true };
    }

    if (typeof c !== "object" || c === null) {
        return { ok: false, error: "select/multiselect requires an object or array config" };
    }

    const obj = c as Record<string, unknown>;
    const optionSetKey = typeof obj.option_set_key === "string" ? obj.option_set_key.trim() : "";
    if (optionSetKey) {
        return { ok: true };
    }

    const catalogKey = typeof obj.catalog_key === "string" ? obj.catalog_key.trim() : "";
    if (catalogKey) {
        if (!isCatalogKey(catalogKey)) {
            return {
                ok: false,
                error: `config.catalog_key must be one of: ${ALLOWED_CATALOG_KEYS.join(", ")}`,
            };
        }
        return { ok: true };
    }

    const raw = obj.options;
    if (!Array.isArray(raw) || raw.length === 0) {
        return {
            ok: false,
            error: "select/multiselect requires config.options, config.option_set_key, or config.catalog_key",
        };
    }
    for (const row of raw) {
        if (!isOptionRow(row)) {
            return { ok: false, error: "Each config.options entry must be { value: string, label: string }" };
        }
    }
    return { ok: true };
}

/**
 * Normalize stored `field_definitions.config` into select options.
 * Supports `{ options: [...] }` (canonical) and a raw top-level `[...]` array (legacy / prod).
 */
export function normalizeOptionsFromConfig(config: unknown | null | undefined): FieldOption[] {
    const raw = Array.isArray(config) ? config : config && typeof config === "object" ? (config as Record<string, unknown>).options : undefined;
    if (!Array.isArray(raw)) return [];
    const out: FieldOption[] = [];
    for (const row of raw) {
        if (!isOptionRow(row)) continue;
        out.push({ value: row.value.trim(), label: row.label.trim() || row.value.trim() });
    }
    return out;
}
