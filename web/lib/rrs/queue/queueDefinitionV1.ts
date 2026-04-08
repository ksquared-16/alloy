/**
 * work_units.queue_definition — v1 subset (Track A Batch 1).
 * Empty object {} means "no interpreted queue".
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

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
