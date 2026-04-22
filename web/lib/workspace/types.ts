/**
 * V2 Workspace Block System — typed layout config (slice 2).
 *
 * Config location (this slice): code registry in `./registry.ts`, keyed by `departments.key`.
 * Future: mirror shape in DB (e.g. `department_workspace_layouts` JSONB) and hydrate the same types.
 */

import type { NeedsAttentionExceptionType } from "./exceptionTypes";
import type { OpportunityLifecycleKpiSnapshot } from "./computeOpportunityLifecycleKpis";

/** Canonical block kinds rendered by WorkspaceRenderer. */
export type WorkspaceBlockType =
    | "signals"
    | "queue"
    | "attention"
    | "kpi"
    | "actions"
    | "context"
    | "config_snapshot"
    | "opportunity_attention_lane";

export type WorkspaceOpportunityAttentionLaneBlock = {
    id: string;
    type: "opportunity_attention_lane";
    title?: string;
    subtitle?: string;
};

/** Keys for attention lane category rows — registry ids must match `WorkspaceRuntimeData.attention`. */
export type WorkspaceAttentionCategoryKey = NeedsAttentionExceptionType;

/** Metric keys the client can resolve today; extend as new signal providers ship. */
export type WorkspaceSignalMetricKey =
    | "jobs.unassigned_count"
    | "schedules.scheduled_today_count"
    | "jobs.needs_attention_count"
    | "jobs.high_value_attention_count"
    | "growth.new_leads_count"
    | "growth.unbooked_quotes_count"
    | "enrollment.pipeline_overview_count"
    | "enrollment.early_inquiries_count"
    | "enrollment.quoting_count"
    | "enrollment.priced_followup_count"
    | "enrollment.needs_attention_count";

export type WorkspaceSignalItem = {
    /** Stable id for React keys / future analytics. */
    id: string;
    label: string;
    metric: WorkspaceSignalMetricKey;
    /** Small uppercase line above the label in bridge signals (e.g. "Volume", "Today"). */
    eyebrow?: string;
};

export type WorkspaceSignalsBlock = {
    id: string;
    type: "signals";
    title?: string;
    subtitle?: string;
    signals: WorkspaceSignalItem[];
};

/**
 * Queue entry kinds:
 * - `unassigned_jobs_triage` → GET /api/admin/jobs?assigned_vendor_unassigned=true (Operations: no vendor yet; interpreter later).
 * - `work_unit_key` → bind to a row from GET /api/admin/work-units; navigation when no route is deferred-only.
 */
export type WorkspaceQueueEntry =
    | {
          kind: "unassigned_jobs_triage";
          label: string;
          description?: string;
      }
    | {
          /** Deep link under `…/dept/:departmentId/:segment` (same base as `workspaceBasePath`). */
          kind: "department_workspace_route";
          segment: "scheduled-today" | "needs-attention";
          label: string;
          description?: string;
      }
    | {
          kind: "work_unit_key";
          work_unit_key: string;
          label?: string;
          description?: string;
      };

export type WorkspaceQueueBlock = {
    id: string;
    type: "queue";
    title?: string;
    subtitle?: string;
    entries: WorkspaceQueueEntry[];
    /**
     * After explicit entries, list other work units on the department as non-actionable rows
     * (until per–work-unit queue routes exist).
     */
    list_remaining_work_units?: boolean;
};

export type WorkspaceKpiBlock =
    | {
          id: string;
          type: "kpi";
          title?: string;
          state: "placeholder";
          message: string;
      }
    | {
          id: string;
          type: "kpi";
          state: "opportunity_lifecycle_pipeline";
          title?: string;
          /** Explains what the strip measures (department responsibility). */
          subtitle?: string;
          /** Primary countable noun, e.g. "Family inquiry" — not a platform internal name. */
          recordLabel?: string;
      };

/** Static admin link, or a department-scoped workspace path resolved at render time. */
export type WorkspaceActionItem =
    | {
          id: string;
          label: string;
          href: string;
          variant?: "primary" | "secondary";
      }
    | {
          id: string;
          label: string;
          variant?: "primary" | "secondary";
          deptRoute: "unassigned" | "scheduled-today" | "needs-attention";
      };

export type WorkspaceActionsBlock = {
    id: string;
    type: "actions";
    title?: string;
    actions: WorkspaceActionItem[];
};

/**
 * Growth department: lane-aware command rail (registry + `growthWorkUnitActionManifest`).
 * Renders native shell actions (e.g. create opportunity) and links; row-scoped actions stay on queue rows.
 */
export type WorkspaceGrowthWorkspaceActionsBlock = {
    id: string;
    type: "growth_workspace_actions";
    title?: string;
};

export type WorkspaceContextBlock = {
    id: string;
    type: "context";
    title?: string;
    paragraphs: string[];
};

export type WorkspaceConfigSnapshotBlock = {
    id: string;
    type: "config_snapshot";
    title?: string;
    subtitle?: string;
};

export type WorkspaceAttentionCategory = {
    /** Must match `WorkspaceAttentionCategoryKey` for runtime lookup. */
    id: WorkspaceAttentionCategoryKey;
    label: string;
    description?: string;
    /**
     * Needs Attention routes through the `needs_attention` exception work unit.
     * Use `needs-attention?exception=<id>` so the queue can filter without new surfaces.
     */
    target:
        | { deptRoute: "needs-attention"; exception: WorkspaceAttentionCategoryKey }
        | { deptRoute: "unassigned" | "scheduled-today" };
};

export type WorkspaceAttentionBlock = {
    id: string;
    type: "attention";
    title?: string;
    subtitle?: string;
    categories: WorkspaceAttentionCategory[];
};

export type WorkspaceBlock =
    | WorkspaceSignalsBlock
    | WorkspaceQueueBlock
    | WorkspaceAttentionBlock
    | WorkspaceKpiBlock
    | WorkspaceActionsBlock
    | WorkspaceGrowthWorkspaceActionsBlock
    | WorkspaceContextBlock
    | WorkspaceConfigSnapshotBlock
    | WorkspaceOpportunityAttentionLaneBlock;

export type DepartmentWorkspaceLayout = {
    /** Matches `departments.key`; null layout id = generic fallback. */
    department_key: string | null;
    /** Ordered blocks; renderer walks this list only (no hardcoded department UI). */
    blocks: WorkspaceBlock[];
};

/**
 * Future interpreter intent (not executed in slice 2). Documented so `work_units.queue_definition`
 * can converge here without another type churn.
 */
export type WorkspaceQueueFilterIntent = {
    field: string;
    operator: "is_null" | "eq" | "in" | "neq";
    value?: string | string[] | null;
};

export type WorkspaceQueueDefinitionIntentV0 = {
    version: 0;
    entity: "jobs";
    filters: WorkspaceQueueFilterIntent[];
    sort?: { by: "updated_at" | "created_at" | "scheduled_at"; direction: "asc" | "desc" };
    limit?: number;
};

/** Per-category counts + short previews for the attention lane (merged job sample). */
export type WorkspaceAttentionCategoryRuntime = {
    count: number;
    previews: { id: string; label: string }[];
};

/** Lifecycle KPI banner for Growth-slice departments (Enrollment, Growth). */
export type OpportunityLifecycleKpisRuntime =
    | { status: "loading" }
    | { status: "error"; message: string }
    | ({ status: "ready" } & OpportunityLifecycleKpiSnapshot);

/** Server-built opportunity queue preview for Growth (keyed by `work_units.key`). */
export type WorkspaceOpportunityQueueRuntime = {
    total: number;
    error: string | null;
    items: Array<{
        id: string;
        name: string | null;
        status_key: string | null;
        source?: string | null;
        _status_display?: string | null;
        quote_total: number | null;
        customer_id?: string | null;
        primary_person_id?: string | null;
        location_id?: string | null;
        job_date?: string | null;
        job_time_window?: string | null;
        customer_notes?: string | null;
        metadata?: unknown;
        created_at?: string | null;
        updated_at?: string | null;
        _customer_name?: string | null;
        _effective_lifecycle_stage?: string | null;
        _lifecycle_stage_title?: string | null;
        _lifecycle_stage_meaning?: string | null;
        _lifecycle_next_step?: { title: string; lines: string[] };
        _attention_reason?: string | null;
        _attention_reason_label?: string | null;
        _primary_email?: string | null;
        _primary_phone?: string | null;
        _primary_contact_line?: string | null;
        _room_label?: string | null;
        _tour_timing?: string | null;
        _notes_preview?: string | null;
        _requested_program?: string | null;
        _age_band?: string | null;
        /** Optional seed / extension: child display name for CRM row (not a DB join). */
        _child_display_name?: string | null;
    }>;
};

/** Runtime values fetched by the page and passed into blocks (keeps blocks mostly presentational). */
export type WorkspaceRuntimeData = {
    metrics: Partial<Record<WorkspaceSignalMetricKey, number | null>>;
    workUnits: Array<{ id: string; name: string | null; key?: string | null; department_id: string }>;
    /** Populated when layout includes an `attention` block — keyed by `WorkspaceAttentionCategoryKey`. */
    attention?: Partial<Record<WorkspaceAttentionCategoryKey, WorkspaceAttentionCategoryRuntime>>;
    /** Growth: opportunity rows from GET `/api/admin/work-units/:id/opportunity-queue` (projections, not truth). */
    opportunityQueues?: Partial<Record<string, WorkspaceOpportunityQueueRuntime>>;
    /** When true, queue rows may show minimal opportunity system actions (same execution path as record chrome). */
    opportunityQueueQuickActions?: boolean;
    /** When layout includes lifecycle KPI block — GET `/api/admin/departments/:id/opportunity-lifecycle-kpis`. */
    opportunityLifecycleKpis?: OpportunityLifecycleKpisRuntime;
};
