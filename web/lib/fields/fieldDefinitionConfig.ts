/**
 * Validation for field_definitions.config (select / multiselect options, catalog refs, placement sources).
 */

export const ALLOWED_CATALOG_KEYS = ["home_types", "pricing_sqft_tiers"] as const;
export type CatalogKey = (typeof ALLOWED_CATALOG_KEYS)[number];

export const PLACEMENT_OPTION_SOURCES = [
    "locations",
    "programs_for_location",
    "rooms_for_location_program",
    "option_set",
] as const;

export type PlacementOptionSource = (typeof PLACEMENT_OPTION_SOURCES)[number];

export const ENTITY_REFERENCE_STORAGE_CLASSES = ["native_column", "field_values", "computed"] as const;
export type EntityReferenceStorageClass = (typeof ENTITY_REFERENCE_STORAGE_CLASSES)[number];

export type FieldOption = { value: string; label: string };

export function isCatalogKey(s: string): s is CatalogKey {
    return (ALLOWED_CATALOG_KEYS as readonly string[]).includes(s);
}

export function isPlacementOptionSource(s: string): s is PlacementOptionSource {
    return (PLACEMENT_OPTION_SOURCES as readonly string[]).includes(s as PlacementOptionSource);
}

function isOptionRow(x: unknown): x is FieldOption {
    if (x == null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.value === "string" && o.value.trim() !== "" && typeof o.label === "string";
}

function readConfigObject(config: unknown | null | undefined): Record<string, unknown> | null {
    if (config == null) return {};
    if (Array.isArray(config)) return null;
    if (typeof config !== "object") return null;
    return config as Record<string, unknown>;
}

/** Validate entity_reference metadata when config.field_kind = entity_reference. */
export function validateEntityReferenceConfig(
    config: unknown | null | undefined
): { ok: true } | { ok: false; error: string } {
    const obj = readConfigObject(config);
    if (obj == null) {
        return { ok: false, error: "entity_reference requires an object config" };
    }

    const fieldKind = typeof obj.field_kind === "string" ? obj.field_kind.trim() : "";
    if (fieldKind !== "entity_reference") return { ok: true };

    const targetEntityType = typeof obj.target_entity_type === "string" ? obj.target_entity_type.trim() : "";
    if (!targetEntityType) {
        return { ok: false, error: "entity_reference requires config.target_entity_type" };
    }

    const storageClass = typeof obj.storage_class === "string" ? obj.storage_class.trim() : "";
    if (!storageClass) {
        return { ok: false, error: "entity_reference requires config.storage_class" };
    }
    if (!(ENTITY_REFERENCE_STORAGE_CLASSES as readonly string[]).includes(storageClass)) {
        return {
            ok: false,
            error: `entity_reference storage_class must be one of: ${ENTITY_REFERENCE_STORAGE_CLASSES.join(", ")}`,
        };
    }

    if (storageClass === "native_column") {
        const storageTable = typeof obj.storage_table === "string" ? obj.storage_table.trim() : "";
        const storageColumn = typeof obj.storage_column === "string" ? obj.storage_column.trim() : "";
        if (!storageTable || !storageColumn) {
            return {
                ok: false,
                error: "native_column entity_reference requires config.storage_table and config.storage_column",
            };
        }
    }

    return { ok: true };
}

/** Validate config for select / multiselect: options, catalog_key, option_set_key, or placement option_source. */
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
                error:
                    "select/multiselect requires a non-empty options array, config.option_set_key, config.catalog_key, or config.option_source",
            };
        }
        for (const row of c) {
            if (!isOptionRow(row)) {
                return { ok: false, error: "Each options entry must be { value: string, label: string }" };
            }
        }
        return { ok: true };
    }

    const obj = readConfigObject(c);
    if (obj == null) {
        return { ok: false, error: "select/multiselect requires an object or array config" };
    }

    const entityRefCheck = validateEntityReferenceConfig(obj);
    if (!entityRefCheck.ok) return entityRefCheck;

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

    const optionSource = typeof obj.option_source === "string" ? obj.option_source.trim() : "";
    if (optionSource) {
        if (!isPlacementOptionSource(optionSource)) {
            return {
                ok: false,
                error: `config.option_source must be one of: ${PLACEMENT_OPTION_SOURCES.join(", ")}`,
            };
        }
        return { ok: true };
    }

    const raw = obj.options;
    if (!Array.isArray(raw) || raw.length === 0) {
        return {
            ok: false,
            error:
                "select/multiselect requires config.options, config.option_set_key, config.catalog_key, or config.option_source",
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
