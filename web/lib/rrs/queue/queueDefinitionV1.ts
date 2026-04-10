/**
 * work_units.queue_definition — v1 subset (Track A Batch 1).
 * Empty object {} means "no interpreted queue" for *read* helpers (`parseQueueDefinitionV1`).
 * Writes use `parseQueueDefinitionV1Strict` + `queueDefinitionV1Schema` (AI slice v0 / admin PATCH).
 */

export type QueueDefinitionV1 = {
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
    sort: QueueDefinitionV1["sort"];
    limit: number;
};

const SORT_BY = new Set(["updated_at", "created_at", "scheduled_at"] as const);
const SORT_DIR = new Set(["asc", "desc"] as const);

const TOP_LEVEL_KEYS = new Set(["version", "entity_type", "filters", "sort", "limit"]);
const FILTER_KEYS = new Set(["status_keys", "job_status_ids"]);

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
    if (raw.entity_type !== "job") return { ok: false, error: "entity_type must be job" };

    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return { ok: false, error: "sort must be an object" };
    const badSort = extraKeys(sortRaw, new Set(["by", "direction"]));
    if (badSort) return { ok: false, error: `sort: unknown key: ${badSort}` };

    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !SORT_BY.has(by as QueueDefinitionV1["sort"]["by"])) {
        return { ok: false, error: "sort.by is invalid" };
    }
    if (typeof direction !== "string" || !SORT_DIR.has(direction as QueueDefinitionV1["sort"]["direction"])) {
        return { ok: false, error: "sort.direction is invalid" };
    }

    const limitRaw = raw.limit;
    if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
        return { ok: false, error: "limit must be a number" };
    }
    let limit = Math.floor(limitRaw);
    if (limit < 1) return { ok: false, error: "limit must be >= 1" };
    if (limit > 500) return { ok: false, error: "limit must be <= 500" };

    let filters: QueueDefinitionV1["filters"] | undefined;
    if (raw.filters !== undefined) {
        if (!isPlainObject(raw.filters)) return { ok: false, error: "filters must be an object" };
        const fr = raw.filters;
        const badF = extraKeys(fr, FILTER_KEYS);
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
            sort: { by: by as QueueDefinitionV1["sort"]["by"], direction: direction as QueueDefinitionV1["sort"]["direction"] },
            limit,
        },
    };
}

/** Canonical JSON object for persisting a strict v1 document (shared with PATCH / agent apply). */
export function serializeQueueDefinitionV1(v: QueueDefinitionV1): Record<string, unknown> {
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

/** Returns null when raw is empty or not a valid v1 document. */
export function parseQueueDefinitionV1(raw: unknown): QueueDefinitionV1 | null {
    if (raw == null) return null;
    if (isPlainObject(raw) && Object.keys(raw).length === 0) return null;
    if (!isPlainObject(raw)) return null;

    const version = raw.version;
    if (version !== 1) return null;

    const entity_type = raw.entity_type;
    if (entity_type !== "job") return null;

    const sortRaw = raw.sort;
    if (!isPlainObject(sortRaw)) return null;
    const by = sortRaw.by;
    const direction = sortRaw.direction;
    if (typeof by !== "string" || !SORT_BY.has(by as QueueDefinitionV1["sort"]["by"])) return null;
    if (typeof direction !== "string" || !SORT_DIR.has(direction as QueueDefinitionV1["sort"]["direction"])) return null;

    const limitRaw = raw.limit;
    let limit = typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50;
    if (limit < 1) limit = 1;
    if (limit > 500) limit = 500;

    let filters: QueueDefinitionV1["filters"] | undefined;
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
        sort: { by: by as QueueDefinitionV1["sort"]["by"], direction: direction as QueueDefinitionV1["sort"]["direction"] },
        limit,
    };
}

/** Build neutral intent for job queues from a parsed v1 definition. */
export function buildJobQueueIntent(orgId: string, def: QueueDefinitionV1): JobQueueIntent {
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
