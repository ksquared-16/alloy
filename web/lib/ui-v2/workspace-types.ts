/**
 * Stable UI-facing view models for UI V2 workspaces.
 * Blocks consume only these shapes — never raw DB/API rows.
 */

export type SignalSeverity = "info" | "warning" | "critical";

/** Every signal exposes at least one direct action (spec UX rule). */
export type SignalActionVm = {
  id: string;
  label: string;
};

export type SignalVm = {
  id: string;
  severity: SignalSeverity;
  title: string;
  description?: string;
  aiExplanation?: string;
  actions: SignalActionVm[];
  meta?: { timestamp?: string; source?: string };
};

export type KPIVm = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  trend?: "up" | "down" | "flat";
  aiSummary?: string;
  /** Department top band: dual rail with AdminV2 KPIBand (default: business) */
  lane?: "business" | "ai";
};

/** Queue row quick actions without requiring drill-down */
export type QueueItemQuickActionVm = {
  id: string;
  label: string;
};

export type QueueItemVm = {
  id: string;
  title: string;
  subtitle?: string;
  aiPrioritization?: string;
  quickActions: QueueItemQuickActionVm[];
};

/** Department throughput / attention lanes — grouped counts (not work-unit rows). */
export type QueueRollupGroupVm = {
  id: string;
  label: string;
  count: number;
  /** Short line: what kinds of work objects sit in this bucket */
  descriptor?: string;
};

/** At most 1–2 subtle cues; not interactive work-unit rows. */
export type QueueRollupExampleVm = {
  id: string;
  label: string;
};

export type QueueVm = {
  id: string;
  title: string;
  countBadge?: number;
  items: QueueItemVm[];
  viewAllActionId?: string;
  viewAllLabel?: string;
  /**
   * Department surface: when present, lane renders as rollup groups (counts + descriptors),
   * not as item rows. Drill to work-unit list via `viewAllActionId`.
   */
  rollupGroups?: QueueRollupGroupVm[];
  /** Optional one-line summary under the lane title */
  rollupSummary?: string;
  rollupExamples?: QueueRollupExampleVm[];
};

export type WorkStepVm = {
  id: string;
  label: string;
  done?: boolean;
};

/** Department “Active workflows” strip — live automation health (optional fields). */
export type WorkflowActivityMetricsVm = {
  avgRunTimeLabel?: string;
  successRateLabel?: string;
  runsTodayLabel?: string;
  failuresTodayLabel?: string;
};

export type WorkflowRunStatusVm = "running" | "completed" | "failed";

/** Telemetry row under workflow metrics (name, status, last run, success). */
export type WorkflowRunVm = {
  id: string;
  name: string;
  status: WorkflowRunStatusVm;
  /** e.g. "09:14 · 3m 20s" or "Queued" */
  lastRunLabel?: string;
};

export type WorkVm = {
  id: string;
  title: string;
  progressLabel?: string;
  steps?: WorkStepVm[];
  assignees?: string[];
  aiSuggestion?: string;
  workflowMetrics?: WorkflowActivityMetricsVm;
  workflowRuns?: WorkflowRunVm[];
};

export type PrimaryActionVm = {
  id: string;
  label: string;
  variant?: "primary" | "secondary";
  emphasized?: boolean;
};

export type ActionsVm = {
  primaries: PrimaryActionVm[];
  overflow?: PrimaryActionVm[];
  /**
   * Department command rail — structured control panel. When any of these are set,
   * the department surface renders System / Quick / Smart sections instead of a single primaries list.
   */
  systemActions?: PrimaryActionVm[];
  quickOperations?: PrimaryActionVm[];
  smartSuggestions?: PrimaryActionVm[];
  /** Console-style status (e.g. automation / queue load). Not a narrative feed. */
  systemStatusLines?: string[];
};

/** Normalized relationship group for ContextBlock (after adapter). */
export type ContextRelationshipItemVm = {
  id: string;
  previewLine: string;
  fields: Record<string, string>;
  quickActions: QueueItemQuickActionVm[];
};

export type ContextRelationshipGroupVm = {
  key: string;
  label: string;
  order: number;
  expanded: boolean;
  items: ContextRelationshipItemVm[];
};

export type ContextBlockVm = {
  title?: string;
  groups: ContextRelationshipGroupVm[];
};

export type AISummaryBandVm = {
  headline?: string;
  /** Optional short visible line under headline (compact deck) */
  subline?: string;
  /** One subtle system line (e.g. AI monitoring scope) — not a section, not dominant */
  aiAwarenessLine?: string;
  /** Single block (legacy); prefer `bodyParagraphs` for hover / tooltip briefing */
  body?: string;
  /** Multi-paragraph operational summary — typically shown via tooltip, not inline */
  bodyParagraphs?: string[];
  /** Substrings in paragraphs wrapped in strong when rendered in tooltip (plain text join loses bold) */
  emphasisPhrases?: string[];
};

export type DepartmentWorkspaceModel = {
  workspaceLevel: "department";
  departmentId: string;
  departmentLabel: string;
  aiSummary?: AISummaryBandVm;
  signals: SignalVm[];
  kpis: KPIVm[];
  /** Dominant — spec: department is queue-dominant */
  primaryQueue: QueueVm;
  /** Attention / review lane — shown beside throughput; keep populated for the 2+command layout */
  secondaryQueue?: QueueVm | null;
  /**
   * Additional work-object categories for this department (not rendered as lanes yet).
   * Models the full catalog per industry; UI still shows primary + secondary only until lane rotation exists.
   */
  latentWorkObjectQueues?: QueueVm[];
  workSummary?: WorkVm | null;
  actionsRail: ActionsVm;
  contextRail: ContextBlockVm;
};

export type WorkUnitWorkspaceModel = {
  workspaceLevel: "work_unit";
  workUnitId: string;
  title: string;
  stateLabel?: string;
  signals: SignalVm[];
  work: WorkVm;
  contextPanel: ContextBlockVm;
  actionsNearWork: ActionsVm;
  aiAssistantPlaceholder?: string;
};

export type RecordWorkspaceModel = {
  workspaceLevel: "record";
  recordId: string;
  entityType: string;
  title: string;
  signals: SignalVm[];
  context: ContextBlockVm;
  actions: ActionsVm;
  linkedRecordsHint?: string;
};

/** Generic backend-ish payload adapters may accept (extensible). */
export type DepartmentWorkspaceSourcePayload = {
  departmentId: string;
  departmentLabel: string;
  signals?: unknown[];
  kpis?: unknown[];
  primaryQueue?: unknown;
  secondaryQueue?: unknown;
  latentWorkObjectQueues?: unknown[];
  workSummary?: unknown;
  actions?: unknown;
  context?: unknown;
  aiSummary?: unknown;
};

export type WorkUnitWorkspaceSourcePayload = {
  workUnitId: string;
  title: string;
  signals?: unknown[];
  work?: unknown;
  context?: unknown;
  actions?: unknown;
};

export type RecordWorkspaceSourcePayload = {
  recordId: string;
  entityType: string;
  title: string;
  signals?: unknown[];
  context?: unknown;
  actions?: unknown;
};

export type { WorkspaceLevel } from "./context-config";
