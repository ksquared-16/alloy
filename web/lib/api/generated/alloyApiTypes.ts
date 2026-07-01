/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Source : docs/api/openapi/alloy-api.v0.yaml (OpenAPI 3.1.0, internal-v0)
 * Regen  : node scripts/generate-openapi-types.mjs
 *
 * Internal v0 types for Alloy's normalized API surface. Partial by design — only
 * gate-passing route families are represented. See docs/api/internal-typescript-client.md.
 */

/* eslint-disable */

/** Request/response correlation id. Always present on normalized routes, in the body (`correlation_id`) and the `x-correlation-id` response header. */
export type CorrelationId = string;

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiSuccess = {
  ok: true;
  data: Record<string, unknown>;
  correlation_id: CorrelationId;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
  correlation_id: CorrelationId;
};

/** Declared freshness expectation for a read route family. */
export type FreshnessClass = "real-time" | "near-real-time" | "batch-tolerant" | "archived";

/** Standard pagination block for list endpoints (cursor-preferred). Current v0 list/ reference routes are bounded archived/static catalogs and do not yet emit this; new or large list families adopt it. */
export type PageInfo = {
  next_cursor?: string;
  has_more: boolean;
  limit: number;
};

/** Incremental-sync resume metadata (forward-looking). */
export type SyncMetadata = {
  cursor: string;
  high_watermark: string;
};

/** One action definition paired with a placement. */
export type ActionInventoryRow = {
  definition?: Record<string, unknown>;
  placement?: Record<string, unknown>;
};

export type ActionPreflightRequest = {
  action_key: string;
  entity_type: string;
  entity_id: string;
  context?: {
    department_id?: string | null;
    work_unit_id?: string | null;
  };
  payload?: Record<string, unknown>;
};

export type ActionPreflightResult = {
  executable: boolean;
  effective_requirements?: Record<string, unknown>;
  completion_requirements?: Record<string, unknown>;
  bos_preflight?: Record<string, unknown>;
};

/** `entity_id` is required except for `create_lead` (which supplies a sentinel id). */
export type ActionExecuteRequest = {
  action_key: string;
  entity_type: string;
  entity_id?: string;
  context?: {
    surface?: string;
    department_id?: string | null;
    work_unit_id?: string | null;
    section_key?: string | null;
  };
  payload?: Record<string, unknown>;
};

export type ActionExecuteResponse = {
  execution_result: unknown;
  affected_id?: string;
};

/** A metric definition row (shape governed by the metric platform schema). */
export type MetricDefinition = {
  id?: string;
  org_id?: string | null;
  key?: string;
  label?: string;
  category?: string;
  source_type?: string;
  source_key?: string;
  aggregation?: string;
  unit?: string;
  status?: string;
  is_kpi?: boolean;
  version?: number;
  [key: string]: unknown;
};

export type MetricDefinitionCreate = {
  key: string;
  label: string;
  description?: string;
  category?: string;
  entity_scope?: string;
  source_type: string;
  source_key: string;
  aggregation: string;
  unit?: string;
  is_kpi?: boolean;
  status?: "draft" | "published";
  [key: string]: unknown;
};

/** Partial update; only provided fields are changed. */
export type MetricDefinitionUpdate = Record<string, unknown>;

export type MetricItemResponse = ApiSuccess & {
  data?: {
    item: MetricDefinition;
  };
};

/** Evaluated metric result (server-computed values, labels, sparkline). */
export type MetricEvaluation = Record<string, unknown>;

export type EntityType = "jobs" | "opportunities" | "contacts" | "customers" | "customer_members" | "persons" | "schedules" | "discount_redemptions" | "workflows" | "vendors" | "subscriptions" | "locations" | "payments" | "service_offerings" | "service_plan_templates" | "addons" | "documents";

/** Composed entity record. Shape varies by type and is preserved verbatim from the underlying resolver, including `_`-prefixed display fields (`_status_display`, `_counts`, `_linked_*`, `_rrs`, …). For the new-record sentinel (`id = "new"`), this is `{ "_create": true }`. */
export type EntityRecord = Record<string, unknown>;

/** A configurable person-model reference-data row. */
export type ReferenceDataItem = {
  id: string;
  org_id?: string;
  key: string;
  label?: string | null;
  description?: string | null;
  sort_order?: number;
  is_system?: boolean;
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
  industry_id?: string | null;
  vertical_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

export type ReferenceDataCreate = {
  key: string;
  label: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
};

/** Partial update; `key` is not editable. */
export type ReferenceDataUpdate = {
  label?: string | null;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
};
