/**
 * work_units.queue_definition — v1 (Track A + Growth opportunity slice).
 * Empty object {} means "no interpreted queue" for *read* helpers (`parseQueueDefinitionV1`).
 * Writes use `parseQueueDefinitionV1Strict` + `queueDefinitionV1Schema` (AI slice v0 / admin PATCH).
 */

// ——— Job (original v1) ———

export type QueueDefinitionV1Job = {
    version: 1;
    entity_type: "job";
    filters?: {
        status_keys?: string[];
        job_status_ids?: string[];
    };
    sort: {
        by: "updated_at" | "created_at" | "scheduled_at";
        direction: "asc" | "desc";
    };
    limit: number;
};

export type JobQueueIntent = {
    entity: "job";
    org_id: string;
    filters: {
        status_keys?: string[];
        job_status_ids?: string[];
    };
    sort: QueueDefinitionV1Job["sort"];
    limit: number;
};

// ——— Opportunity (Growth) ———

/** Narrow product semantics — interpreted only on the server. */
export type OpportunityQuoteStateFilter = "no_positive_quote" | "has_positive_quote" | "quoted_not_booked";

export type QueueDefinitionV1Opportunity = {
    version: 1;
    entity_type: "opportunity";
    filters?: {
        status_keys?: string[];
        pipeline_stage_ids?: string[];
        source_keys?: string[];
        /** Match `opportunities.assigned_to` (exact strings; IN list). */
        assigned_to?: string[];
        quote_state?: OpportunityQuoteStateFilter;
    };
    sort: {
        by: "updated_at" | "created_at" | "job_date";
        direction: "asc" | "desc";
    };
    limit: number;
};

export type OpportunityQueueIntent = {
    entity: "opportunity";
    org_id: string;
    filters: NonNullable<QueueDefinitionV1Opportunity["filters"]>;
    sort: QueueDefinitionV1Opportunity["sort"];
    limit: number;
};

export type QueueDefinitionV1 = QueueDefinitionV1Job | QueueDefinitionV1Opportunity;

const JOB_SORT_BY = new Set(["updated_at", "created_at", "scheduled_at"] as const);
const OPP_SORT_BY = new Set(["updated_at", "created_at", "job_date"] as const);
const SORT_DIR = new Set(["asc", "desc"] as const);

const TOP_LEVEL_KEYS = new Set(["version", "entity_type", "filters", "sort", "limit"]);
const JOB_FILTER_KEYS = new Set(["status_keys", "job_status_ids"]);
const OPP_FILTER_KEYS = new Set([
    "status_keys",
    "pipeline_stage_ids",
    "source_keys",
    "assigned_to",
    "quote_state",
]);

const QUOTE_STATE = new Set<OpportunityQuoteStateFilter>([
    "no_positive_quote",
    "has_positive_quote",
    "quoted_not_booked",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function extraKeys(obj: Record<string, unknown>, allowed: Set<string>): string | undefined {
    for (const k of Object.keys(obj)) {
        if (!allowed.has(k)) return k;
    }
    return undefined;
}

/** Stored `queue_definition` JSON: missing or non-number `version` → 0 (AI slice v0 / optimistic concurrency). */
export function getQueueDefinitionStoredVersion(raw: unknown): number {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return 0;
    const v = (raw as Record<string, unknown>).version;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export type QueueDefinitionV1StrictResult =
    | { ok: true; value: QueueDefinitionV1 }
    | { ok: false; error: string };

function parseJobDefinitionStrict(raw: Record<string, unknown>): QueueDefinitionV1StrictResult {
    if (raw.entity_type !== "job") return { ok: false, error: "entity_type must be job" };

    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return { ok: false, error: "sort must be an object" };
    const badSort = extraKeys(sortRaw, new Set(["by", "direction"]));
    if (badSort) return { ok: false, error: `sort: unknown key: ${badSort}` };

    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !JOB_SORT_BY.has(by as QueueDefinitionV1Job["sort"]["by"])) {
        return { ok: false, error: "sort.by is invalid for job" };
    }
    if (typeof direction !== "string" || !SORT_DIR.has(direction as QueueDefinitionV1Job["sort"]["direction"])) {
        return { ok: false, error: "sort.direction is invalid" };
    }

    const limitRaw = raw.limit;
    if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
        return { ok: false, error: "limit must be a number" };
    }
    let limit = Math.floor(limitRaw);
    if (limit < 1) return { ok: false, error: "limit must be >= 1" };
    if (limit > 500) return { ok: false, error: "limit must be <= 500" };

    let filters: QueueDefinitionV1Job["filters"] | undefined;
    if (raw.filters !== undefined) {
        if (!isPlainObject(raw.filters)) return { ok: false, error: "filters must be an object" };
        const fr = raw.filters;
        const badF = extraKeys(fr, JOB_FILTER_KEYS);
        if (badF) return { ok: false, error: `filters: unknown key: ${badF}` };
        const status_keys = Array.isArray(fr.status_keys)
            ? fr.status_keys.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const job_status_ids = Array.isArray(fr.job_status_ids)
            ? fr.job_status_ids.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        if (status_keys?.length || job_status_ids?.length) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (job_status_ids?.length) filters.job_status_ids = job_status_ids;
        }
    }

    return {
        ok: true,
        value: {
            version: 1,
            entity_type: "job",
            filters,
            sort: { by: by as QueueDefinitionV1Job["sort"]["by"], direction: direction as QueueDefinitionV1Job["sort"]["direction"] },
            limit,
        },
    };
}

function parseOpportunityDefinitionStrict(raw: Record<string, unknown>): QueueDefinitionV1StrictResult {
    if (raw.entity_type !== "opportunity") return { ok: false, error: "entity_type must be opportunity" };

    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return { ok: false, error: "sort must be an object" };
    const badSort = extraKeys(sortRaw, new Set(["by", "direction"]));
    if (badSort) return { ok: false, error: `sort: unknown key: ${badSort}` };

    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !OPP_SORT_BY.has(by as QueueDefinitionV1Opportunity["sort"]["by"])) {
        return { ok: false, error: "sort.by is invalid for opportunity" };
    }
    if (typeof direction !== "string" || !SORT_DIR.has(direction as QueueDefinitionV1Opportunity["sort"]["direction"])) {
        return { ok: false, error: "sort.direction is invalid" };
    }

    const limitRaw = raw.limit;
    if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
        return { ok: false, error: "limit must be a number" };
    }
    let limit = Math.floor(limitRaw);
    if (limit < 1) return { ok: false, error: "limit must be >= 1" };
    if (limit > 500) return { ok: false, error: "limit must be <= 500" };

    let filters: QueueDefinitionV1Opportunity["filters"] | undefined;
    if (raw.filters !== undefined) {
        if (!isPlainObject(raw.filters)) return { ok: false, error: "filters must be an object" };
        const fr = raw.filters;
        const badF = extraKeys(fr, OPP_FILTER_KEYS);
        if (badF) return { ok: false, error: `filters: unknown key: ${badF}` };

        const status_keys = Array.isArray(fr.status_keys)
            ? fr.status_keys.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const pipeline_stage_ids = Array.isArray(fr.pipeline_stage_ids)
            ? fr.pipeline_stage_ids.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const source_keys = Array.isArray(fr.source_keys)
            ? fr.source_keys.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const assigned_to = Array.isArray(fr.assigned_to)
            ? fr.assigned_to.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;

        let quote_state: OpportunityQuoteStateFilter | undefined;
        if (fr.quote_state !== undefined) {
            if (typeof fr.quote_state !== "string" || !QUOTE_STATE.has(fr.quote_state as OpportunityQuoteStateFilter)) {
                return { ok: false, error: "filters.quote_state is invalid" };
            }
            quote_state = fr.quote_state as OpportunityQuoteStateFilter;
        }

        if (
            status_keys?.length ||
            pipeline_stage_ids?.length ||
            source_keys?.length ||
            assigned_to?.length ||
            quote_state !== undefined
        ) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (pipeline_stage_ids?.length) filters.pipeline_stage_ids = pipeline_stage_ids;
            if (source_keys?.length) filters.source_keys = source_keys;
            if (assigned_to?.length) filters.assigned_to = assigned_to;
            if (quote_state !== undefined) filters.quote_state = quote_state;
        }
    }

    return {
        ok: true,
        value: {
            version: 1,
            entity_type: "opportunity",
            filters,
            sort: {
                by: by as QueueDefinitionV1Opportunity["sort"]["by"],
                direction: direction as QueueDefinitionV1Opportunity["sort"]["direction"],
            },
            limit,
        },
    };
}

/**
 * Strict validation for config writes: rejects unknown keys at every level; requires a complete v1 document.
 * Does not accept `{}` (use `null` at the route layer to clear `queue_definition` to `{}`).
 */
export function parseQueueDefinitionV1Strict(raw: unknown): QueueDefinitionV1StrictResult {
    if (raw == null) {
        return { ok: false, error: "queue_definition must be an object or null to clear" };
    }
    if (!isPlainObject(raw)) {
        return { ok: false, error: "queue_definition must be a JSON object" };
    }
    if (Object.keys(raw).length === 0) {
        return { ok: false, error: "empty object is not valid v1; omit field or pass null to clear" };
    }

    const badTop = extraKeys(raw, TOP_LEVEL_KEYS);
    if (badTop) return { ok: false, error: `unknown key: ${badTop}` };

    if (raw.version !== 1) return { ok: false, error: "version must be 1" };

    const et = raw.entity_type;
    if (et === "job") return parseJobDefinitionStrict(raw);
    if (et === "opportunity") return parseOpportunityDefinitionStrict(raw);
    return { ok: false, error: "entity_type must be job or opportunity" };
}

/** Canonical JSON object for persisting a strict v1 document (shared with PATCH / agent apply). */
export function serializeQueueDefinitionV1(v: QueueDefinitionV1): Record<string, unknown> {
    if (v.entity_type === "job") {
        const o: Record<string, unknown> = {
            version: v.version,
            entity_type: v.entity_type,
            sort: v.sort,
            limit: v.limit,
        };
        if (v.filters && Object.keys(v.filters).length > 0) {
            o.filters = v.filters;
        }
        return o;
    }
    const o: Record<string, unknown> = {
        version: v.version,
        entity_type: v.entity_type,
        sort: v.sort,
        limit: v.limit,
    };
    if (v.filters && Object.keys(v.filters).length > 0) {
        o.filters = v.filters;
    }
    return o;
}

/**
 * POST create: `{}` / null / missing → `{}`. Non-empty objects must be strict v1 (same as PATCH).
 */
export function normalizeQueueDefinitionForCreate(raw: unknown):
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string } {
    if (raw === undefined || raw === null) {
        return { ok: true, value: {} };
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) return { ok: true, value: {} };
        try {
            const p = JSON.parse(t) as unknown;
            return normalizeQueueDefinitionForCreate(p);
        } catch {
            return { ok: false, error: "queue_definition must be valid JSON" };
        }
    }
    if (typeof raw !== "object" || Array.isArray(raw) || raw === null) {
        return { ok: false, error: "queue_definition must be a JSON object" };
    }
    const o = raw as Record<string, unknown>;
    if (Object.keys(o).length === 0) {
        return { ok: true, value: {} };
    }
    const parsed = parseQueueDefinitionV1Strict(o);
    if (!parsed.ok) {
        return { ok: false, error: parsed.error };
    }
    return { ok: true, value: serializeQueueDefinitionV1(parsed.value) };
}

/** Shared entry point for PATCH + agent orchestration (strict parse + stored version helper). */
export const queueDefinitionV1Schema = {
    parseStrict: parseQueueDefinitionV1Strict,
    getStoredVersion: getQueueDefinitionStoredVersion,
} as const;

function parseJobLenient(raw: Record<string, unknown>): QueueDefinitionV1Job | null {
    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return null;
    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !JOB_SORT_BY.has(by as QueueDefinitionV1Job["sort"]["by"])) return null;
    if (typeof direction !== "string" || !SORT_DIR.has(direction as QueueDefinitionV1Job["sort"]["direction"])) return null;

    const limitRaw = raw.limit;
    let limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50;
    if (limit < 1) limit = 1;
    if (limit > 500) limit = 500;

    let filters: QueueDefinitionV1Job["filters"] | undefined;
    const filtersRaw = raw.filters;
    if (filtersRaw !== undefined) {
        if (!isPlainObject(filtersRaw)) return null;
        const status_keys = Array.isArray(filtersRaw.status_keys)
            ? filtersRaw.status_keys.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const job_status_ids = Array.isArray(filtersRaw.job_status_ids)
            ? filtersRaw.job_status_ids.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        if (status_keys?.length || job_status_ids?.length) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (job_status_ids?.length) filters.job_status_ids = job_status_ids;
        }
    }

    return {
        version: 1,
        entity_type: "job",
        filters,
        sort: { by: by as QueueDefinitionV1Job["sort"]["by"], direction: direction as QueueDefinitionV1Job["sort"]["direction"] },
        limit,
    };
}

function parseOpportunityLenient(raw: Record<string, unknown>): QueueDefinitionV1Opportunity | null {
    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return null;
    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !OPP_SORT_BY.has(by as QueueDefinitionV1Opportunity["sort"]["by"])) return null;
    if (typeof direction !== "string" || !SORT_DIR.has(direction as QueueDefinitionV1Opportunity["sort"]["direction"])) return null;

    const limitRaw = raw.limit;
    let limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50;
    if (limit < 1) limit = 1;
    if (limit > 500) limit = 500;

    let filters: QueueDefinitionV1Opportunity["filters"] | undefined;
    const filtersRaw = raw.filters;
    if (filtersRaw !== undefined && isPlainObject(filtersRaw)) {
        const status_keys = Array.isArray(filtersRaw.status_keys)
            ? filtersRaw.status_keys.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const pipeline_stage_ids = Array.isArray(filtersRaw.pipeline_stage_ids)
            ? filtersRaw.pipeline_stage_ids.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const source_keys = Array.isArray(filtersRaw.source_keys)
            ? filtersRaw.source_keys.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        const assigned_to = Array.isArray(filtersRaw.assigned_to)
            ? filtersRaw.assigned_to.filter((x): x is string => typeof x === "string" && x.trim() !== "")
            : undefined;
        let quote_state: OpportunityQuoteStateFilter | undefined;
        if (
            typeof filtersRaw.quote_state === "string" &&
            QUOTE_STATE.has(filtersRaw.quote_state as OpportunityQuoteStateFilter)
        ) {
            quote_state = filtersRaw.quote_state as OpportunityQuoteStateFilter;
        }
        if (
            status_keys?.length ||
            pipeline_stage_ids?.length ||
            source_keys?.length ||
            assigned_to?.length ||
            quote_state !== undefined
        ) {
            filters = {};
            if (status_keys?.length) filters.status_keys = status_keys;
            if (pipeline_stage_ids?.length) filters.pipeline_stage_ids = pipeline_stage_ids;
            if (source_keys?.length) filters.source_keys = source_keys;
            if (assigned_to?.length) filters.assigned_to = assigned_to;
            if (quote_state !== undefined) filters.quote_state = quote_state;
        }
    }

    return {
        version: 1,
        entity_type: "opportunity",
        filters,
        sort: {
            by: by as QueueDefinitionV1Opportunity["sort"]["by"],
            direction: direction as QueueDefinitionV1Opportunity["sort"]["direction"],
        },
        limit,
    };
}

/** Returns null when raw is empty or not a valid v1 document. */
export function parseQueueDefinitionV1(raw: unknown): QueueDefinitionV1 | null {
    if (raw == null) return null;
    if (isPlainObject(raw) && Object.keys(raw).length === 0) return null;
    if (!isPlainObject(raw)) return null;

    const version = raw.version;
    if (version !== 1) return null;

    const entity_type = raw.entity_type;
    if (entity_type === "job") return parseJobLenient(raw);
    if (entity_type === "opportunity") return parseOpportunityLenient(raw);
    return null;
}

/** Build neutral intent for job queues from a parsed v1 definition. */
export function buildJobQueueIntent(orgId: string, def: QueueDefinitionV1Job): JobQueueIntent {
    return {
        entity: "job",
        org_id: orgId,
        filters: {
            status_keys: def.filters?.status_keys,
            job_status_ids: def.filters?.job_status_ids,
        },
        sort: def.sort,
        limit: def.limit,
    };
}

export function buildOpportunityQueueIntent(orgId: string, def: QueueDefinitionV1Opportunity): OpportunityQueueIntent {
    return {
        entity: "opportunity",
        org_id: orgId,
        filters: def.filters ?? {},
        sort: def.sort,
        limit: def.limit,
    };
}

export function isQueueDefinitionV1Job(d: QueueDefinitionV1): d is QueueDefinitionV1Job {
    return d.entity_type === "job";
}

export function isQueueDefinitionV1Opportunity(d: QueueDefinitionV1): d is QueueDefinitionV1Opportunity {
    return d.entity_type === "opportunity";
}
