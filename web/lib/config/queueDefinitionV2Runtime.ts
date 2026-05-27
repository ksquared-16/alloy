/**
 * Queue definition v2 runtime — read/normalize/alias layer only.
 * Execution still uses v1 {@link QueueDefinitionV1} filters via {@link coerceQueueDefinitionForExecution}.
 * Config surface: `work_units.queue_definition` JSONB (no separate queue_definitions table).
 */

import {
    queueFilterSchema,
    validateQueueDefinition,
    type QueueConfig,
    type QueueDefinitionV1,
    type QueueFilter,
} from "@/lib/config/queueDefinitionSchema";

export type QueueGrain = "case" | "child" | "candidate";

const VALID_GRAINS = new Set<QueueGrain>(["case", "child", "candidate"]);

export type QueueFilterField =
    | "case_status"
    | "child_lifecycle_status"
    | "candidate_status"
    | "tour_booking"
    | "attention_reason"
    | "created_at"
    | "follow_up_due_at"
    | "status"
    | "field"
    | "date"
    | "assignment"
    | "exception";

const V2_FILTER_FIELDS = new Set<QueueFilterField>([
    "case_status",
    "child_lifecycle_status",
    "candidate_status",
    "tour_booking",
    "attention_reason",
    "created_at",
    "follow_up_due_at",
]);

const V1_EXECUTABLE_FILTER_TYPES = new Set(["status", "field", "date", "assignment", "exception"]);

export type ParsedQueueFilterStub = {
    type: string;
    field?: QueueFilterField;
    recognized: boolean;
    /** When false, filter is parsed but not applied by QueueService yet (Card 4+). */
    executable: boolean;
    raw: unknown;
};

export type NormalizedQueueEntry = {
    key: string;
    label: string;
    domain?: string;
    grain: QueueGrain;
    overlay: boolean;
    aliases: string[];
    filters: unknown[];
    /** True when entry carries no v2-only metadata (pure v1 shape). */
    legacy: boolean;
    raw: unknown;
};

export type NormalizedQueueDefinitionDocument = {
    version: number;
    entity_type: "job" | "schedule" | "opportunity";
    queues: NormalizedQueueEntry[];
    isV2: boolean;
    raw: unknown;
};

export type QueueKeyResolution = {
    requestedKey: string;
    resolvedKey: string;
    matchedBy: "exact" | "alias" | "fallback";
    queue: NormalizedQueueEntry | null;
};

export type QueueDefinitionLoadBundle = {
    def: QueueDefinitionV1;
    normalized: NormalizedQueueDefinitionDocument;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function readStoredVersion(raw: unknown): number {
    if (!isPlainObject(raw)) return 1;
    const v = raw.version;
    return typeof v === "number" && Number.isFinite(v) ? v : 1;
}

function readStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

/** Invalid grain → `case` (never throws). */
export function normalizeQueueGrain(raw: unknown): QueueGrain {
    if (typeof raw === "string" && VALID_GRAINS.has(raw as QueueGrain)) {
        return raw as QueueGrain;
    }
    return "case";
}

export function normalizeQueueEntry(raw: unknown): NormalizedQueueEntry | null {
    if (!isPlainObject(raw)) return null;
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!key || !label) return null;

    const domain = typeof raw.domain === "string" && raw.domain.trim() ? raw.domain.trim() : undefined;
    const grain = normalizeQueueGrain(raw.grain);
    const overlay = raw.overlay === true;
    const aliases = readStringArray(raw.aliases);
    const filters = Array.isArray(raw.filters) ? [...raw.filters] : [];

    const legacy = !domain && grain === "case" && !overlay && aliases.length === 0;

    return {
        key,
        label,
        domain,
        grain,
        overlay,
        aliases,
        filters,
        legacy,
        raw,
    };
}

/**
 * Lenient read of `work_units.queue_definition` — v1 and v2 shapes.
 * Returns null when document cannot be interpreted (missing queues / entity_type).
 */
export function normalizeQueueDefinitionDocument(raw: unknown): NormalizedQueueDefinitionDocument | null {
    if (raw == null || !isPlainObject(raw)) return null;
    if (Object.keys(raw).length === 0) return null;

    const queuesRaw = raw.queues;
    if (!Array.isArray(queuesRaw) || queuesRaw.length === 0) return null;

    const entityType = raw.entity_type;
    if (entityType !== "job" && entityType !== "schedule" && entityType !== "opportunity") {
        return null;
    }

    const version = readStoredVersion(raw);
    const isV2 = version >= 2;

    const queues: NormalizedQueueEntry[] = [];
    for (const q of queuesRaw) {
        const normalized = normalizeQueueEntry(q);
        if (normalized) queues.push(normalized);
    }
    if (queues.length === 0) return null;

    return {
        version,
        entity_type: entityType,
        queues,
        isV2,
        raw,
    };
}

export function resolveQueueKeyFromDefinition(
    requestedQueueKey: string,
    normalizedQueues: NormalizedQueueEntry[]
): QueueKeyResolution {
    const requestedKey = requestedQueueKey.trim();
    if (!requestedKey) {
        return { requestedKey: "", resolvedKey: "", matchedBy: "fallback", queue: null };
    }

    const exact = normalizedQueues.find((q) => q.key === requestedKey);
    if (exact) {
        return { requestedKey, resolvedKey: exact.key, matchedBy: "exact", queue: exact };
    }

    for (const q of normalizedQueues) {
        if (q.aliases.includes(requestedKey)) {
            return { requestedKey, resolvedKey: q.key, matchedBy: "alias", queue: q };
        }
    }

    return { requestedKey, resolvedKey: requestedKey, matchedBy: "fallback", queue: null };
}

/** Safe parse/validate for v2 filter objects — does not execute SQL. */
export function parseQueueFilterStub(raw: unknown): ParsedQueueFilterStub {
    if (!isPlainObject(raw)) {
        return { type: "unknown", recognized: false, executable: false, raw };
    }

    const type = typeof raw.type === "string" ? raw.type.trim() : "";
    if (!type) {
        return { type: "unknown", recognized: false, executable: false, raw };
    }

    if (V1_EXECUTABLE_FILTER_TYPES.has(type)) {
        const parsed = queueFilterSchema.safeParse(raw);
        return {
            type,
            field: type as QueueFilterField,
            recognized: parsed.success,
            executable: parsed.success,
            raw,
        };
    }

    if (V2_FILTER_FIELDS.has(type as QueueFilterField)) {
        const operator = raw.operator;
        const hasOperator = typeof operator === "string" && operator.trim() !== "";
        const valuesOk =
            type === "created_at" || type === "follow_up_due_at"
                ? hasOperator
                : hasOperator && (Array.isArray(raw.values) || raw.value !== undefined);
        return {
            type,
            field: type as QueueFilterField,
            recognized: valuesOk || type === "attention_reason",
            executable: false,
            raw,
        };
    }

    return { type, recognized: false, executable: false, raw };
}

function coerceFilterToV1Executable(filter: unknown): QueueFilter | null {
    if (!isPlainObject(filter)) return null;

    const type = filter.type;
    if (type === "case_status" && filter.operator === "in" && Array.isArray(filter.values)) {
        const values = filter.values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
        if (values.length === 0) return null;
        return { type: "status", operator: "in", values };
    }

    const parsed = queueFilterSchema.safeParse(filter);
    if (parsed.success) return parsed.data;
    return null;
}

function executionFiltersForQueueEntry(entry: NormalizedQueueEntry): QueueFilter[] {
    const raw = entry.raw;
    const compat =
        isPlainObject(raw) && Array.isArray(raw.filters_compat_v1) ? raw.filters_compat_v1 : null;
    const source = compat ?? entry.filters;

    const out: QueueFilter[] = [];
    for (const f of source) {
        const coerced = coerceFilterToV1Executable(f);
        if (coerced) out.push(coerced);
    }
    return out;
}

function coerceUiForV1Execution(raw: unknown): QueueDefinitionV1["ui"] | undefined {
    if (!isPlainObject(raw)) return undefined;
    const ui = raw.ui;
    if (!isPlainObject(ui)) return undefined;

    const layoutRaw = ui.layout;
    let layout: "pipeline_with_attention" | "single_section" = "pipeline_with_attention";
    if (layoutRaw === "single_section") layout = "single_section";
    else if (layoutRaw === "pipeline_with_attention" || layoutRaw === "domain_with_attention") {
        layout = "pipeline_with_attention";
    }

    const sectionsRaw = ui.sections;
    const sections =
        Array.isArray(sectionsRaw) && sectionsRaw.length > 0
            ? sectionsRaw
                  .map((s) => {
                      if (!isPlainObject(s)) return null;
                      const key = typeof s.key === "string" ? s.key.trim() : "";
                      const label = typeof s.label === "string" ? s.label.trim() : "";
                      const queue_keys = readStringArray(s.queue_keys);
                      if (!key || !label || queue_keys.length === 0) return null;
                      const toneRaw = s.tone;
                      const tone =
                          toneRaw === "attention" || toneRaw === "critical" || toneRaw === "standard"
                              ? toneRaw
                              : undefined;
                      return tone ? { key, label, tone, queue_keys } : { key, label, queue_keys };
                  })
                  .filter((x): x is NonNullable<typeof x> => x != null)
            : undefined;

    type QueueUiV1 = NonNullable<QueueDefinitionV1["ui"]>;

    const primary_total_label =
        typeof ui.primary_total_label === "string" && ui.primary_total_label.trim()
            ? ui.primary_total_label.trim()
            : undefined;
    const primary_total_queue =
        typeof ui.primary_total_queue === "string" && ui.primary_total_queue.trim()
            ? ui.primary_total_queue.trim()
            : undefined;

    const row_preview = isPlainObject(ui.row_preview) ? ui.row_preview : undefined;

    if (!sections && !primary_total_label && !primary_total_queue && !row_preview) {
        return layout === "single_section" ? { layout } : { layout: "pipeline_with_attention" };
    }

    const out: QueueUiV1 = {
        layout,
        ...(primary_total_label ? { primary_total_label } : {}),
        ...(primary_total_queue ? { primary_total_queue } : {}),
        ...(sections?.length ? { sections: sections as NonNullable<QueueUiV1["sections"]> } : {}),
        ...(row_preview ? { row_preview: row_preview as NonNullable<QueueUiV1["row_preview"]> } : {}),
    };
    return out;
}

function buildV1QueueConfig(entry: NormalizedQueueEntry): QueueConfig {
    const raw = entry.raw;
    const filters = executionFiltersForQueueEntry(entry);
    const sort =
        isPlainObject(raw) && Array.isArray(raw.sort)
            ? raw.sort
                  .map((s) => {
                      if (!isPlainObject(s)) return null;
                      const field = typeof s.field === "string" ? s.field.trim() : "";
                      const direction = s.direction;
                      if (!field || (direction !== "asc" && direction !== "desc")) return null;
                      return { field, direction };
                  })
                  .filter((x): x is { field: string; direction: "asc" | "desc" } => x != null)
            : undefined;

    const limit =
        isPlainObject(raw) && typeof raw.limit === "number" && Number.isFinite(raw.limit)
            ? Math.floor(raw.limit)
            : undefined;
    const priority =
        isPlainObject(raw) &&
        (raw.priority === "standard" || raw.priority === "attention" || raw.priority === "critical")
            ? raw.priority
            : undefined;
    const display =
        isPlainObject(raw) && (raw.display === "list" || raw.display === "cards") ? raw.display : undefined;
    const description =
        isPlainObject(raw) && typeof raw.description === "string" ? raw.description : undefined;
    const icon = isPlainObject(raw) && typeof raw.icon === "string" ? raw.icon : undefined;

    return {
        key: entry.key,
        label: entry.label,
        filters,
        ...(icon ? { icon } : {}),
        ...(description ? { description } : {}),
        ...(sort?.length ? { sort } : {}),
        ...(limit != null ? { limit } : {}),
        ...(priority ? { priority } : {}),
        ...(display ? { display } : {}),
    };
}

/**
 * Build v1 execution document from stored JSON — strips v2-only metadata and non-executable filters.
 * v1 documents pass through strict {@link validateQueueDefinition}.
 */
export function coerceQueueDefinitionForExecution(
    raw: unknown,
    normalized?: NormalizedQueueDefinitionDocument | null
): QueueDefinitionV1 {
    const doc = normalized ?? normalizeQueueDefinitionDocument(raw);
    if (!doc) {
        throw new Error("queue_definition is not a valid workspace queue document");
    }

    if (!doc.isV2) {
        return validateQueueDefinition(raw);
    }

    const coerced: Record<string, unknown> = {
        version: 1,
        entity_type: doc.entity_type,
        queues: doc.queues.map((entry) => buildV1QueueConfig(entry)),
    };

    const ui = coerceUiForV1Execution(raw);
    if (ui) coerced.ui = ui;

    return validateQueueDefinition(coerced);
}

/** Load bundle for runtime — v1 execution def + normalized v2 metadata. */
export function loadQueueDefinitionBundle(raw: unknown): QueueDefinitionLoadBundle {
    const normalized = normalizeQueueDefinitionDocument(raw);
    if (!normalized) {
        throw new Error("queue_definition is not a valid workspace queue document");
    }
    const def = coerceQueueDefinitionForExecution(raw, normalized);
    return { def, normalized };
}

/** Lenient loader for UI surfaces — returns null instead of throwing. */
export function tryLoadWorkUnitQueueDefinitionBundle(raw: unknown): QueueDefinitionLoadBundle | null {
    try {
        return loadQueueDefinitionBundle(raw);
    } catch {
        return null;
    }
}

export function queueSummaryRuntimeMetadata(
    entry: NormalizedQueueEntry | null | undefined,
    resolution?: QueueKeyResolution | null
): {
    domain?: string;
    grain?: QueueGrain;
    overlay?: boolean;
    requested_queue_key?: string;
    resolved_queue_key?: string;
} {
    if (!entry) return {};
    const base = {
        ...(entry.domain ? { domain: entry.domain } : {}),
        grain: entry.grain,
        ...(entry.overlay ? { overlay: true } : {}),
    };
    if (resolution?.matchedBy === "alias") {
        return {
            ...base,
            requested_queue_key: resolution.requestedKey,
            resolved_queue_key: resolution.resolvedKey,
        };
    }
    return base;
}

export function withQueueSummaryRuntimeMetadata(
    summary: { key: string },
    normalized: NormalizedQueueDefinitionDocument | null | undefined
): Record<string, unknown> {
    if (!normalized) return {};
    const entry = normalized.queues.find((q) => q.key === summary.key) ?? null;
    return queueSummaryRuntimeMetadata(entry);
}

export function resolveExecutableQueueKey(
    queueKey: string,
    normalized: NormalizedQueueDefinitionDocument | null | undefined
): QueueKeyResolution {
    if (!normalized) {
        const requestedKey = queueKey.trim();
        return {
            requestedKey,
            resolvedKey: requestedKey,
            matchedBy: "fallback",
            queue: null,
        };
    }
    return resolveQueueKeyFromDefinition(queueKey, normalized.queues);
}
