/**
 * Option set config — static and reference-backed selectable vocabulary.
 * @see docs/system/option-sets-system.md
 */

export const OPTION_SET_CONFIG_VERSION = 1 as const;

export const OPTION_SET_MODES = ["static", "reference"] as const;
export type OptionSetMode = (typeof OPTION_SET_MODES)[number];

/** Allowlisted reference entities for Phase 1. No arbitrary SQL. */
export const ALLOWED_REFERENCE_ENTITIES = [
    "locations",
    "location_program_categories",
    "persons",
] as const;
export type ReferenceEntity = (typeof ALLOWED_REFERENCE_ENTITIES)[number];

export const ALLOWED_FILTER_OPERATORS = ["eq", "in"] as const;
export type ReferenceFilterOperator = (typeof ALLOWED_FILTER_OPERATORS)[number];

export type OptionSetReferenceFilter = {
    field: string;
    operator: ReferenceFilterOperator;
    value: string | string[];
};

export type OptionSetReferenceConfig = {
    entity: ReferenceEntity;
    value_field: string;
    label_field: string;
    filters?: OptionSetReferenceFilter[];
};

export type OptionSetCascadeBinding = {
    /** Filter param or column name on the reference entity query */
    bind_to_filter?: string;
    /** Optional metadata path for secondary cascade (e.g. program category on rooms) */
    bind_to_metadata?: string;
    optional?: boolean;
};

export type OptionSetCascadeConfig = {
    depends_on: OptionSetCascadeBinding[];
};

export type OptionSetConfig = {
    version: typeof OPTION_SET_CONFIG_VERSION;
    mode: OptionSetMode;
    reference?: OptionSetReferenceConfig;
    cascade?: OptionSetCascadeConfig;
};

export type OptionSetConfigInput = Partial<OptionSetConfig> & {
    mode?: OptionSetMode;
};

const DEFAULT_STATIC_CONFIG: OptionSetConfig = {
    version: OPTION_SET_CONFIG_VERSION,
    mode: "static",
};

function readObject(value: unknown): Record<string, unknown> | null {
    if (value == null) return {};
    if (Array.isArray(value) || typeof value !== "object") return null;
    return value as Record<string, unknown>;
}

export function isReferenceEntity(value: string): value is ReferenceEntity {
    return (ALLOWED_REFERENCE_ENTITIES as readonly string[]).includes(value);
}

export function isOptionSetMode(value: string): value is OptionSetMode {
    return (OPTION_SET_MODES as readonly string[]).includes(value);
}

function isFilterOperator(value: string): value is ReferenceFilterOperator {
    return (ALLOWED_FILTER_OPERATORS as readonly string[]).includes(value);
}

function validateReferenceFilter(
    raw: unknown,
    index: number
): { ok: true; filter: OptionSetReferenceFilter } | { ok: false; error: string } {
    const obj = readObject(raw);
    if (obj == null) return { ok: false, error: `reference.filters[${index}] must be an object` };
    const field = typeof obj.field === "string" ? obj.field.trim() : "";
    if (!field) return { ok: false, error: `reference.filters[${index}].field is required` };
    const operator = typeof obj.operator === "string" ? obj.operator.trim() : "";
    if (!isFilterOperator(operator)) {
        return {
            ok: false,
            error: `reference.filters[${index}].operator must be one of: ${ALLOWED_FILTER_OPERATORS.join(", ")}`,
        };
    }
    const value = obj.value;
    if (operator === "eq") {
        if (typeof value !== "string" || !value.trim()) {
            return { ok: false, error: `reference.filters[${index}].value must be a non-empty string for eq` };
        }
        return { ok: true, filter: { field, operator, value: value.trim() } };
    }
    if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== "string" || !String(v).trim())) {
        return { ok: false, error: `reference.filters[${index}].value must be a non-empty string array for in` };
    }
    return { ok: true, filter: { field, operator, value: value.map((v) => String(v).trim()) } };
}

function validateCascadeBinding(
    raw: unknown,
    index: number
): { ok: true; binding: OptionSetCascadeBinding } | { ok: false; error: string } {
    const obj = readObject(raw);
    if (obj == null) return { ok: false, error: `cascade.depends_on[${index}] must be an object` };
    const bind_to_filter = typeof obj.bind_to_filter === "string" ? obj.bind_to_filter.trim() : "";
    const bind_to_metadata = typeof obj.bind_to_metadata === "string" ? obj.bind_to_metadata.trim() : "";
    if (!bind_to_filter && !bind_to_metadata) {
        return {
            ok: false,
            error: `cascade.depends_on[${index}] requires bind_to_filter and/or bind_to_metadata`,
        };
    }
    const binding: OptionSetCascadeBinding = {};
    if (bind_to_filter) binding.bind_to_filter = bind_to_filter;
    if (bind_to_metadata) binding.bind_to_metadata = bind_to_metadata;
    if (obj.optional !== undefined) {
        binding.optional = obj.optional === true;
    }
    return { ok: true, binding };
}

/** Normalize stored config; empty/null/invalid → static default. */
export function normalizeOptionSetConfig(raw: unknown | null | undefined): OptionSetConfig {
    const obj = readObject(raw);
    if (!obj || Object.keys(obj).length === 0) return { ...DEFAULT_STATIC_CONFIG };
    const validated = validateOptionSetConfig(obj);
    if (!validated.ok) return { ...DEFAULT_STATIC_CONFIG };
    return validated.config;
}

/** Validate and normalize option set config for API write. */
export function validateOptionSetConfig(
    raw: unknown | null | undefined
): { ok: true; config: OptionSetConfig } | { ok: false; error: string } {
    const obj = readObject(raw);
    if (obj == null) return { ok: false, error: "config must be a JSON object" };

    const mode = typeof obj.mode === "string" && isOptionSetMode(obj.mode) ? obj.mode : "static";
    const version = obj.version;
    if (version !== undefined && version !== OPTION_SET_CONFIG_VERSION) {
        return { ok: false, error: `config.version must be ${OPTION_SET_CONFIG_VERSION}` };
    }

    if (mode === "static") {
        if (obj.reference !== undefined || obj.cascade !== undefined) {
            return { ok: false, error: "static mode cannot include reference or cascade" };
        }
        return { ok: true, config: { version: OPTION_SET_CONFIG_VERSION, mode: "static" } };
    }

    const refObj = readObject(obj.reference);
    if (!refObj) return { ok: false, error: "reference mode requires config.reference" };

    const entity = typeof refObj.entity === "string" ? refObj.entity.trim() : "";
    if (!isReferenceEntity(entity)) {
        return {
            ok: false,
            error: `reference.entity must be one of: ${ALLOWED_REFERENCE_ENTITIES.join(", ")}`,
        };
    }

    const value_field = typeof refObj.value_field === "string" ? refObj.value_field.trim() : "";
    const label_field = typeof refObj.label_field === "string" ? refObj.label_field.trim() : "";
    if (!value_field) return { ok: false, error: "reference.value_field is required" };
    if (!label_field) return { ok: false, error: "reference.label_field is required" };

    const filters: OptionSetReferenceFilter[] = [];
    if (refObj.filters !== undefined) {
        if (!Array.isArray(refObj.filters)) {
            return { ok: false, error: "reference.filters must be an array" };
        }
        for (let i = 0; i < refObj.filters.length; i++) {
            const res = validateReferenceFilter(refObj.filters[i], i);
            if (!res.ok) return res;
            filters.push(res.filter);
        }
    }

    const reference: OptionSetReferenceConfig = {
        entity,
        value_field,
        label_field,
        ...(filters.length > 0 ? { filters } : {}),
    };

    let cascade: OptionSetCascadeConfig | undefined;
    if (obj.cascade !== undefined) {
        const cascadeObj = readObject(obj.cascade);
        if (!cascadeObj) return { ok: false, error: "cascade must be an object" };
        if (!Array.isArray(cascadeObj.depends_on) || cascadeObj.depends_on.length === 0) {
            return { ok: false, error: "cascade.depends_on must be a non-empty array" };
        }
        const depends_on: OptionSetCascadeBinding[] = [];
        for (let i = 0; i < cascadeObj.depends_on.length; i++) {
            const res = validateCascadeBinding(cascadeObj.depends_on[i], i);
            if (!res.ok) return res;
            depends_on.push(res.binding);
        }
        cascade = { depends_on };
    }

    return {
        ok: true,
        config: {
            version: OPTION_SET_CONFIG_VERSION,
            mode: "reference",
            reference,
            ...(cascade ? { cascade } : {}),
        },
    };
}

export function getOptionSetMode(config: unknown | null | undefined): OptionSetMode {
    return normalizeOptionSetConfig(config).mode;
}

export function optionSetModeLabel(mode: OptionSetMode): string {
    return mode === "reference" ? "Reference-backed" : "Static list";
}

export function referenceEntityLabel(entity: ReferenceEntity): string {
    switch (entity) {
        case "locations":
            return "Locations";
        case "location_program_categories":
            return "Location program categories";
        case "persons":
            return "Persons (staff)";
        default:
            return entity;
    }
}

/** Merge incoming config patch onto existing stored config (shallow top-level). */
export function mergeOptionSetConfigForWrite(
    existing: unknown | null | undefined,
    incoming: unknown | null | undefined
): OptionSetConfig {
    const base = normalizeOptionSetConfig(existing);
    if (incoming === undefined) return base;
    const inc = readObject(incoming);
    if (!inc) return base;
    const merged = validateOptionSetConfig({ ...base, ...inc });
    return merged.ok ? merged.config : base;
}
