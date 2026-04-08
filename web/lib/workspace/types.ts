/**
 * V2 Workspace Block System — typed layout config (slice 2).
 *
 * Config location (this slice): code registry in `./registry.ts`, keyed by `departments.key`.
 * Future: mirror shape in DB (e.g. `department_workspace_layouts` JSONB) and hydrate the same types.
 */

/** Canonical block kinds rendered by WorkspaceRenderer. */
export type WorkspaceBlockType = "signals" | "queue" | "kpi" | "actions" | "context";

/** Metric keys the client can resolve today; extend as new signal providers ship. */
export type WorkspaceSignalMetricKey =
    | "jobs.unassigned_count"
    | "jobs.scheduled_today_count"
    | "jobs.needs_attention_count"
    | "jobs.high_value_attention_count";

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
 * - `unassigned_jobs_triage` → bridge route + existing GET /api/admin/jobs?unassigned_work_unit=true (interpreter later).
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

export type WorkspaceKpiBlock = {
    id: string;
    type: "kpi";
    title?: string;
    state: "placeholder";
    message: string;
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

export type WorkspaceContextBlock = {
    id: string;
    type: "context";
    title?: string;
    paragraphs: string[];
};

export type WorkspaceBlock =
    | WorkspaceSignalsBlock
    | WorkspaceQueueBlock
    | WorkspaceKpiBlock
    | WorkspaceActionsBlock
    | WorkspaceContextBlock;

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

/** Runtime values fetched by the page and passed into blocks (keeps blocks mostly presentational). */
export type WorkspaceRuntimeData = {
    metrics: Partial<Record<WorkspaceSignalMetricKey, number | null>>;
    workUnits: Array<{ id: string; name: string | null; key?: string | null; department_id: string }>;
};
