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
    config: Record<string, unknown> | null | undefined
): { ok: true } | { ok: false; error: string } {
    const t = (fieldType || "").toLowerCase();
    if (t !== "select" && t !== "multiselect") return { ok: true };

    const c = config ?? {};
    const catalogKey = typeof c.catalog_key === "string" ? c.catalog_key.trim() : "";
    if (catalogKey) {
        if (!isCatalogKey(catalogKey)) {
            return {
                ok: false,
                error: `config.catalog_key must be one of: ${ALLOWED_CATALOG_KEYS.join(", ")}`,
            };
        }
        return { ok: true };
    }

    const raw = c.options;
    if (!Array.isArray(raw) || raw.length === 0) {
        return {
            ok: false,
            error: "select/multiselect requires config.options (non-empty array of { value, label }) or config.catalog_key",
        };
    }
    for (const row of raw) {
        if (!isOptionRow(row)) {
            return { ok: false, error: "Each config.options entry must be { value: string, label: string }" };
        }
    }
    return { ok: true };
}

export function normalizeOptionsFromConfig(config: Record<string, unknown> | null | undefined): FieldOption[] {
    const raw = config?.options;
    if (!Array.isArray(raw)) return [];
    const out: FieldOption[] = [];
    for (const row of raw) {
        if (!isOptionRow(row)) continue;
        out.push({ value: row.value.trim(), label: row.label.trim() || row.value.trim() });
    }
    return out;
}
