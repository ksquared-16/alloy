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
  /** Optional emphasis for compact record metrics (risk / positive) */
  tone?: "neutral" | "risk" | "positive";
};

/** Queue row quick actions without requiring drill-down */
export type QueueItemQuickActionVm = {
  id: string;
  label: string;
};

/** Work-unit queue: wait row coloring (dot + text). */
export type QueueItemWaitStatusVm = "safe" | "approaching" | "breached";

export type QueueItemVm = {
  id: string;
  title: string;
  subtitle?: string;
  aiPrioritization?: string;
  quickActions: QueueItemQuickActionVm[];
  /**
   * Work-unit lane: optional section heading — consecutive items with the same `groupLabel`
   * render under one subheading (e.g. urgency bucket).
   */
  groupLabel?: string;
  /**
   * Work-unit lane: stable bucket id for grouping + counted headers (`queue.workUnitGroupHeaders`).
   * Falls back to `groupLabel` when not set.
   */
  groupKey?: string;
  /** Work-unit lane: revenue / job value (top-right, muted). Omit or empty → UI may show placeholder. */
  valueLabel?: string;
  /** Work-unit lane: complexity / requirement chips (bottom of row). */
  tags?: string[];
  /** Work-unit lane: wait row tone; defaults from `urgencyTier` when omitted. */
  waitStatus?: QueueItemWaitStatusVm;
  /** Work-unit lane: service window line */
  windowLabel?: string;
  /** Work-unit lane: route / cluster line */
  routeLabel?: string;
  /** Work-unit lane: duration fragment only — UI renders “{waitCompact} waiting”. */
  waitCompact?: string;
  /** Compact label chips / key-value rows for structured queue cards */
  metaLines?: { label: string; value: string }[];
  /** Visual emphasis for SLA / risk (queue card rail + badge tone) */
  urgencyTier?: "critical" | "warning" | "standard";
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
   * Department rollup drill: passed in `queue.item.action` payload as `workUnitKey` when the lane opens a work-unit view.
   */
  drillWorkUnitKey?: string;
  /**
   * Department surface: when present, lane renders as rollup groups (counts + descriptors),
   * not as item rows. Drill to work-unit list via `viewAllActionId`.
   */
  rollupGroups?: QueueRollupGroupVm[];
  /** Optional one-line summary under the lane title */
  rollupSummary?: string;
  rollupExamples?: QueueRollupExampleVm[];
  /** Work-unit lane: subtle sort / priority caption shown above the item list */
  sortCaption?: string;
  /**
   * Work-unit lane: `groupKey` → header label (emoji optional). UI appends “ (count)”.
   */
  workUnitGroupHeaders?: Record<string, { emoji?: string; label: string }>;
  /**
   * Work-unit lane: column headers for the two-cell midline (defaults: Window / Route).
   * Use industry-native labels (e.g. Expiry · Binder for renewals).
   */
  workUnitMidlineKeys?: { left?: string; right?: string };
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
  /** Lower-priority actions; rendered in the collapsed “More actions” section (below AI suggestions). */
  overflow?: PrimaryActionVm[];
  /**
   * Department command rail — structured control panel. When any of these are set,
   * the surface renders primary card + operational card + AI + more (instead of a flat primaries list).
   */
  systemActions?: PrimaryActionVm[];
  /** Operational actions card — row-style actions below primary solids (with any demoted systemActions[2+]). */
  quickOperations?: PrimaryActionVm[];
  /** AI suggestions — separate light section below the operational card (not merged into one list). */
  smartSuggestions?: PrimaryActionVm[];
  /** Console-style status (e.g. automation / queue load). Not a narrative feed. */
  systemStatusLines?: string[];
  /**
   * Record command rail — compact decision anchor above primary actions (status / risk / next step).
   * Rendered only when `surface === "record"` in ActionsBlock.
   */
  recordDecisionAnchor?: {
    status?: string;
    risk?: string;
    nextAction?: string;
  };
  /**
   * Record command rail — operational card rows (user-driven actions).
   * When set on `surface === "record"`, replaces flat `quickOperations` for that tier.
   */
  recordSecondaryActions?: PrimaryActionVm[];
  /**
   * Record command rail — lower-priority actions in the collapsed “More actions” section
   * (below AI suggestions), not inside the operational card.
   */
  recordTertiaryActions?: PrimaryActionVm[];
};

/** Normalized relationship group for ContextBlock (after adapter). */
export type ContextRelationshipItemVm = {
  id: string;
  previewLine: string;
  fields: Record<string, string>;
  quickActions: QueueItemQuickActionVm[];
  /** When true, record surface shows this row as a primary drillable system entity */
  linkedEntity?: boolean;
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
  /** Stable key (`departments.key`) — fallback for default operational context in resolver. */
  departmentKey?: string;
  /** When API provides `departments.default_visual_context_key`, wire here (resolver priority 4). */
  departmentDefaultVisualContextKey?: string;
  /** Optional explicit shell override (resolver priority 1). */
  visualContextKey?: string;
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
  /**
   * Relationship groups — **not rendered** in the department workspace shell for now (keeps work surface clear).
   * Adapters may still populate for future use; see docs/implementation/WORKSPACE_SYSTEM_V1.md.
   */
  contextRail: ContextBlockVm;
};

/** Company / org surface — departments are the primary drillable work objects (rollup counts). */
export type CompanyDepartmentCardVm = {
  id: string;
  /** Stable key for navigation / analytics (e.g. operations) */
  departmentKey: string;
  label: string;
  summaryLine?: string;
  countBadge?: number;
  rollupGroups: QueueRollupGroupVm[];
};

export type CompanyWorkspaceModel = {
  workspaceLevel: "company";
  organizationId: string;
  organizationLabel: string;
  /** Top deck label above headline (default UI: "Company focus") */
  focusLabel?: string;
  aiSummary?: AISummaryBandVm;
  signals: SignalVm[];
  kpis: KPIVm[];
  /** Dominant operational departments (e.g. Operations, Revenue, Growth) */
  primaryDepartments: CompanyDepartmentCardVm[];
  /** Supporting departments — same drill pattern, lighter visual weight */
  secondaryDepartments: CompanyDepartmentCardVm[];
  workSummary?: WorkVm | null;
  actionsRail: ActionsVm;
  /**
   * Relationship groups — **not rendered** in the company workspace shell for now.
   * Adapters may still populate for future use; see docs/implementation/WORKSPACE_SYSTEM_V1.md.
   */
  contextRail: ContextBlockVm;
};

/** Compact operator strip above the work-unit queue — one status line + one recommended action line. */
export type WorkUnitLaneInterpretationVm = {
  laneStatusLine: string;
  recommendedActionLine: string;
};

export type WorkUnitWorkspaceModel = {
  workspaceLevel: "work_unit";
  workUnitId: string;
  /** Matches `departments.key` when known — resolver fallback chain. */
  departmentKey?: string;
  /** When API provides department default context key (resolver priority 4). */
  departmentDefaultVisualContextKey?: string;
  /** Work unit operational context (`work_units.visual_context_key`) — resolver priority 3 (after explicit + lane). */
  visualContextKey?: string;
  /** Short breadcrumb / kicker above headline (e.g. department path into this lane) */
  focusLabel?: string;
  /** Stable lane key for analytics / routing */
  laneKey?: string;
  aiSummary?: AISummaryBandVm;
  /**
   * Light decision layer above the queue — why the lane matters and what to do next.
   * Optional for backward compatibility; demo and rich lanes should populate.
   */
  laneInterpretation?: WorkUnitLaneInterpretationVm | null;
  signals: SignalVm[];
  kpis: KPIVm[];
  /** Dominant surface — structured queue of drillable records in this lane */
  primaryQueue: QueueVm;
  workSummary?: WorkVm | null;
  actionsRail: ActionsVm;
  /**
   * Relationship groups — **not rendered** in the work unit workspace shell for now.
   * Adapters may still populate for future use; see docs/implementation/WORKSPACE_SYSTEM_V1.md.
   */
  contextRail: ContextBlockVm;
};

/**
 * One line in the record body. With `fieldLabel`, renders as a compact label/value row (object-control scan).
 */
export type RecordSectionLineVm = {
  text: string;
  /** When set, row renders as a definition-style field (label + value) instead of a prose line */
  fieldLabel?: string;
  /** Visual weight: primary = ids, times, routes, names; muted = secondary context */
  tone?: "default" | "primary" | "muted";
  /** When set, entire line is a drillable link (`record.body.link`) */
  linkId?: string;
  /** Compact uppercase pill before text (e.g. INVOICE, WORK ORDER) — document / artifact rows */
  typeBadge?: string;
  /**
   * Subtle row semantics for record body typography (scheduling vs financial vs document vs tags).
   * Does not change layout — CSS only.
   */
  rowKind?: "default" | "schedule" | "financial" | "document" | "tag";
};

/** Record body band — groups sections under State / Connections / History in the record shell. */
export type RecordBodyBandId = "state" | "connections" | "history";

export type RecordSectionVm = {
  id: string;
  title: string;
  lines: RecordSectionLineVm[];
  /** Notes / activity / events — compact bullets under the section */
  bullets?: string[];
  /** When set, section renders under the matching body band (default: state). */
  bodyBand?: RecordBodyBandId;
};

/** Small contextual action in record body side column (not command rail). */
export type RecordInteractionChipVm = {
  id: string;
  label: string;
};

/** Customer / contact context — right column of record body (communication, not primary actions). */
export type RecordContactContextVm = {
  name: string;
  address?: string;
  preferredContact?: string;
  lastContactAt?: string;
  contactActions: RecordInteractionChipVm[];
};

/** Linked or adjacent system objects — right column, compact rows. */
export type RecordRelatedObjectVm = {
  id: string;
  /** e.g. "Route cluster", "Invoice", "Account" */
  kind: string;
  preview: string;
  linkId?: string;
};

export type RecordRelatedPanelVm = {
  items: RecordRelatedObjectVm[];
};

/** Recent events — right column, compact timeline (newest first). */
export type RecordActivityPanelVm = {
  events: string[];
};

/** Assignment / people context — right column of record body. */
export type RecordAssignmentContextVm = {
  /** Shown when assigned; omit or empty for unassigned */
  assignedLabel?: string;
  /** e.g. "No cleaner assigned" when `assignedLabel` is empty */
  emptyAssignedHint?: string;
  suggestedLabel?: string;
  assignmentActions: RecordInteractionChipVm[];
};

export type RecordWorkspaceModel = {
  workspaceLevel: "record";
  recordId: string;
  /** e.g. "Job" — short entity label */
  entityType: string;
  /** Legacy display title; headline usually comes from `aiSummary` */
  title: string;
  /** Breadcrumb into this record (e.g. lane / queue path) */
  focusLabel?: string;
  aiSummary?: AISummaryBandVm;
  signals: SignalVm[];
  /** Optional compact metrics — keep sparse at record level */
  kpis?: KPIVm[];
  /** Record body left column — core ops sections + compact inline lines. */
  recordSections: RecordSectionVm[];
  /** Optional right column — customer / contact */
  recordContactContext?: RecordContactContextVm | null;
  /**
   * Optional quick related list. Prefer normalizing into `contextRail` for the single **Related entities**
   * aside card (Record workspace) to avoid duplicate “Related” + “Related entities” UI.
   */
  recordRelatedContext?: RecordRelatedPanelVm | null;
  /**
   * Recent activity lines — rendered at the **top of the workflows panel** on Record (not in the body aside).
   */
  recordActivityContext?: RecordActivityPanelVm | null;
  /**
   * Optional assignment / people context (e.g. for adapters or alternate layouts).
   * Default record UI merges assignment into the scheduling section in the left column.
   */
  recordAssignmentContext?: RecordAssignmentContextVm | null;
  workSummary?: WorkVm | null;
  actionsRail: ActionsVm;
  /**
   * Relationship / linked-entity groups for **main column** context on Record (embedded next to contact / related / activity).
   * Not shown in the right command rail — see docs/implementation/WORKSPACE_SYSTEM_V1.md.
   */
  contextRail: ContextBlockVm;
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

export type CompanyWorkspaceSourcePayload = {
  organizationId: string;
  organizationLabel: string;
  signals?: unknown[];
  kpis?: unknown[];
  primaryDepartments?: unknown[];
  secondaryDepartments?: unknown[];
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
