/**
 * Alloy internal API client (v0).
 *
 * A thin, hand-written runtime wrapper over the normalized API surface described by
 * `docs/api/openapi/alloy-api.v0.yaml`. Types come from the generated module
 * `./generated/alloyApiTypes` (regenerate via `node scripts/generate-openapi-types.mjs`).
 *
 * This is **internal v0**: only gate-passing route families are exposed, it is not a public
 * SDK, and it intentionally does not support legacy/unnormalized endpoints. See
 * `docs/api/internal-typescript-client.md`.
 *
 * Behavior:
 * - Calls `fetch` (injectable for tests).
 * - Unwraps the standard success envelope (`{ ok: true, data, correlation_id }`) and returns
 *   the relevant `data` payload.
 * - Throws a typed {@link AlloyApiError} for `{ ok: false }` / non-2xx responses, preserving
 *   the stable `error.code`, HTTP `status`, sanitized `details`, and `correlation_id`.
 */

import type {
    ActionInventoryRow,
    ActionPreflightRequest,
    ActionPreflightResult,
    ActionExecuteRequest,
    ActionExecuteResponse,
    MetricDefinition,
    MetricDefinitionCreate,
    MetricDefinitionUpdate,
    MetricEvaluation,
    EntityType,
    EntityRecord,
    ReferenceDataItem,
    ReferenceDataCreate,
    ReferenceDataUpdate,
} from "./generated/alloyApiTypes";

export type {
    ActionInventoryRow,
    ActionPreflightRequest,
    ActionPreflightResult,
    ActionExecuteRequest,
    ActionExecuteResponse,
    MetricDefinition,
    MetricDefinitionCreate,
    MetricDefinitionUpdate,
    MetricEvaluation,
    EntityType,
    EntityRecord,
    ReferenceDataItem,
    ReferenceDataCreate,
    ReferenceDataUpdate,
} from "./generated/alloyApiTypes";

/** Standard success envelope (generic over the payload). */
type ApiSuccessEnvelope<T> = { ok: true; data: T; correlation_id?: string };
/** Standard failure envelope. */
type ApiFailureEnvelope = {
    ok: false;
    error: { code: string; message: string; details?: unknown };
    correlation_id?: string;
};

/** Minimal `fetch` signature the client depends on (so tests can inject a stub). */
export type FetchLike = (
    input: string,
    init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }
) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    json(): Promise<unknown>;
}>;

export interface AlloyApiClientOptions {
    /** Base URL prefix (default ""). Use e.g. an absolute origin for server-side calls. */
    baseUrl?: string;
    /** Injectable fetch implementation (defaults to global fetch). */
    fetch?: FetchLike;
    /** Optional default correlation id to send on every request. */
    correlationId?: string;
}

/** Typed error thrown for normalized API failures. */
export class AlloyApiError extends Error {
    /** Stable, machine-readable error code (e.g. `NOT_FOUND`, `ACTION_BLOCKED`). */
    readonly code: string;
    /** Preserved HTTP status (0 for network/parse failures). */
    readonly status: number;
    /** Sanitized structured context, when present. */
    readonly details?: unknown;
    /** Correlation id from the response (body or header), when available. */
    readonly correlationId: string | null;

    constructor(args: {
        code: string;
        message: string;
        status: number;
        details?: unknown;
        correlationId: string | null;
    }) {
        super(args.message);
        this.name = "AlloyApiError";
        this.code = args.code;
        this.status = args.status;
        this.details = args.details;
        this.correlationId = args.correlationId;
    }
}

function buildQuery(query?: Record<string, string | undefined | null>): string {
    if (!query) return "";
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== "") params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
}

function readCorrelationId(json: unknown, res: { headers: { get(n: string): string | null } }): string | null {
    if (json && typeof json === "object" && typeof (json as { correlation_id?: unknown }).correlation_id === "string") {
        return (json as { correlation_id: string }).correlation_id;
    }
    return res.headers?.get?.("x-correlation-id") ?? null;
}

export function createAlloyApiClient(options: AlloyApiClientOptions = {}) {
    const baseUrl = options.baseUrl ?? "";
    const fetchImpl: FetchLike = options.fetch ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
    if (typeof fetchImpl !== "function") {
        throw new Error("createAlloyApiClient: no fetch implementation available (pass options.fetch).");
    }

    /**
     * Core request: returns the raw `data` payload of the success envelope, or throws
     * {@link AlloyApiError}. Callers narrow/extract the specific field they need.
     */
    async function request<TData>(
        method: string,
        pathName: string,
        opts: { query?: Record<string, string | undefined | null>; body?: unknown } = {}
    ): Promise<TData> {
        const url = `${baseUrl}${pathName}${buildQuery(opts.query)}`;
        const headers: Record<string, string> = {};
        if (opts.body !== undefined) headers["content-type"] = "application/json";
        if (options.correlationId) headers["x-correlation-id"] = options.correlationId;

        let res: Awaited<ReturnType<FetchLike>>;
        try {
            res = await fetchImpl(url, {
                method,
                headers,
                body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            });
        } catch (err) {
            throw new AlloyApiError({
                code: "NETWORK_ERROR",
                message: err instanceof Error ? err.message : "Network request failed",
                status: 0,
                correlationId: null,
            });
        }

        let json: unknown = null;
        try {
            json = await res.json();
        } catch {
            json = null;
        }

        const correlationId = readCorrelationId(json, res);
        const envelope = json as Partial<ApiSuccessEnvelope<TData>> & Partial<ApiFailureEnvelope>;

        if (!res.ok || !envelope || envelope.ok === false || envelope.ok !== true) {
            const error = (envelope && (envelope as ApiFailureEnvelope).error) || undefined;
            throw new AlloyApiError({
                code: error?.code ?? `HTTP_${res.status}`,
                message: error?.message ?? "Request failed",
                status: res.status,
                details: error?.details,
                correlationId,
            });
        }

        return envelope.data as TData;
    }

    return {
        /** Raw envelope-aware request escape hatch (returns the `data` payload). */
        request,

        actions: {
            /** GET /api/admin/actions/inventory */
            async inventory(params?: { surface?: string; entity_type?: string }): Promise<ActionInventoryRow[]> {
                const data = await request<{ items: ActionInventoryRow[] }>("GET", "/api/admin/actions/inventory", {
                    query: params,
                });
                return data.items;
            },
            /** POST /api/admin/actions/preflight */
            async preflight(body: ActionPreflightRequest): Promise<ActionPreflightResult> {
                return request<ActionPreflightResult>("POST", "/api/admin/actions/preflight", { body });
            },
            /** POST /api/admin/actions/execute */
            async execute(body: ActionExecuteRequest): Promise<ActionExecuteResponse> {
                return request<ActionExecuteResponse>("POST", "/api/admin/actions/execute", { body });
            },
        },

        metrics: {
            /** GET /api/admin/analytics/metrics */
            async list(): Promise<{ items: MetricDefinition[]; adapters: unknown[] }> {
                return request<{ items: MetricDefinition[]; adapters: unknown[] }>("GET", "/api/admin/analytics/metrics");
            },
            /** GET /api/admin/analytics/metrics/{id} */
            async get(id: string): Promise<MetricDefinition> {
                const data = await request<{ item: MetricDefinition }>(
                    "GET",
                    `/api/admin/analytics/metrics/${encodeURIComponent(id)}`
                );
                return data.item;
            },
            /** POST /api/admin/analytics/metrics */
            async create(input: MetricDefinitionCreate): Promise<MetricDefinition> {
                const data = await request<{ item: MetricDefinition }>("POST", "/api/admin/analytics/metrics", {
                    body: input,
                });
                return data.item;
            },
            /** PATCH /api/admin/analytics/metrics/{id} */
            async update(id: string, input: MetricDefinitionUpdate): Promise<MetricDefinition> {
                const data = await request<{ item: MetricDefinition }>(
                    "PATCH",
                    `/api/admin/analytics/metrics/${encodeURIComponent(id)}`,
                    { body: input }
                );
                return data.item;
            },
            /** POST /api/admin/analytics/metrics/{id}/copy */
            async copy(id: string): Promise<{ item: MetricDefinition; copied: boolean }> {
                return request<{ item: MetricDefinition; copied: boolean }>(
                    "POST",
                    `/api/admin/analytics/metrics/${encodeURIComponent(id)}/copy`
                );
            },
            /** POST /api/admin/analytics/metrics/{id}/preview */
            async preview(id: string, body?: Record<string, unknown>): Promise<MetricEvaluation> {
                const data = await request<{ evaluation: MetricEvaluation }>(
                    "POST",
                    `/api/admin/analytics/metrics/${encodeURIComponent(id)}/preview`,
                    { body: body ?? {} }
                );
                return data.evaluation;
            },
            /** POST /api/admin/analytics/metrics/{id}/snapshot */
            async snapshot(
                id: string,
                body?: Record<string, unknown>
            ): Promise<{ evaluation: MetricEvaluation; snapshot_id: string }> {
                return request<{ evaluation: MetricEvaluation; snapshot_id: string }>(
                    "POST",
                    `/api/admin/analytics/metrics/${encodeURIComponent(id)}/snapshot`,
                    { body: body ?? {} }
                );
            },
            /** GET /api/admin/analytics/metrics/{id}/trend */
            async trend(id: string): Promise<{ series: unknown[]; comparison: unknown }> {
                return request<{ series: unknown[]; comparison: unknown }>(
                    "GET",
                    `/api/admin/analytics/metrics/${encodeURIComponent(id)}/trend`
                );
            },
        },

        entity: {
            /** GET /api/admin/entity/{type}/{id} */
            async get(type: EntityType, id: string, params?: { surface?: string }): Promise<EntityRecord> {
                const data = await request<{ entity: EntityRecord }>(
                    "GET",
                    `/api/admin/entity/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
                    { query: params }
                );
                return data.entity;
            },
        },

        referenceData: {
            customerPersonRoleTypes: makeReferenceDataResource(request, "/api/admin/customer-person-role-types"),
            personRelationshipTypeSettings: makeReferenceDataResource(
                request,
                "/api/admin/person-relationship-type-settings"
            ),
        },
    };
}

/** Build the CRUD surface shared by the two reference-data families. */
function makeReferenceDataResource(
    request: <TData>(
        method: string,
        pathName: string,
        opts?: { query?: Record<string, string | undefined | null>; body?: unknown }
    ) => Promise<TData>,
    basePath: string
) {
    return {
        /**
         * GET (list). The v0 contract type is `ReferenceDataItem` (loosely typed); a concrete
         * family may pass a narrower row type (e.g. `list<CustomerPersonRoleType>()`) since the
         * route returns the full row.
         */
        async list<T = ReferenceDataItem>(params?: {
            all?: "true" | "1";
            industry_id?: string;
            vertical_id?: string;
        }): Promise<T[]> {
            const data = await request<{ items: T[] }>("GET", basePath, { query: params });
            return data.items;
        },
        /** POST (create) */
        async create<T = ReferenceDataItem>(input: ReferenceDataCreate): Promise<T> {
            const data = await request<{ item: T }>("POST", basePath, { body: input });
            return data.item;
        },
        /** PATCH (update) */
        async update<T = ReferenceDataItem>(id: string, input: ReferenceDataUpdate): Promise<T> {
            const data = await request<{ item: T }>("PATCH", `${basePath}/${encodeURIComponent(id)}`, {
                body: input,
            });
            return data.item;
        },
        /**
         * DELETE — not supported by the API (always 405 `NOT_IMPLEMENTED`); deactivate via
         * `update(id, { is_active: false })`. Exposed for completeness; always throws.
         */
        async remove(id: string): Promise<never> {
            await request<never>("DELETE", `${basePath}/${encodeURIComponent(id)}`);
            throw new AlloyApiError({
                code: "NOT_IMPLEMENTED",
                message: "Delete not supported. Set is_active to false to deactivate.",
                status: 405,
                correlationId: null,
            });
        },
    };
}

export type AlloyApiClient = ReturnType<typeof createAlloyApiClient>;
