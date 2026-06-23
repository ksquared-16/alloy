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

/** Queue row quick actions — labels/presentation only; execution hosts use entity id + action key. */
export type QueueItemQuickActionVm = {
  id: string;
  label: string;
  /** Host dispatch id when distinct from `id` (e.g. queue row preview config actions). */
  actionId?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Host may open mailto:/tel: or pass through to record actions. */
  payload?: Record<string, unknown>;
};

/** Work-unit queue: wait row coloring (dot + text). */
export type QueueItemWaitStatusVm = "safe" | "approaching" | "breached";

/**
 * Placement priority preview from QueueService `_placement_priority` (projection only — not global waitlist order).
 */
export type QueueRowPlacementPriorityVm = {
  /** Human-readable priority rule / bucket label from evaluator (not program grouping). */
  priorityRuleLabel: string;
  /** Section title for program / room / age grouping — loaded page only; use with queue row `groupLabel`. */
  programGroupSectionTitle: string;
  /**
   * 1-based position within this row's program/room group — **non-shadow** placement only; page-local scope (lane hint).
   */
  scopedWaitlistPosition?: number;
  /** e.g. `Toddler waitlist` — paired with {@link scopedWaitlistPosition}. */
  scopedWaitlistPositionLabel?: string;
  /** One short supporting line from evaluator reasons (optional). */
  priorityReasonShort?: string;
  /** e.g. `Toddler waitlist` — compact row subtitle next to position. */
  waitlistProgramShortLabel: string;
  /** Up to two `reasons[].label` strings from the evaluator. */
  reasonLines: string[];
  /** Up to two warning messages (unknown facts, etc.). */
  warningLines: string[];
  /** Server shadow mode — list order may not match placement ordering. */
  shadowMode: boolean;
  evaluateError?: boolean;
  errorMessage?: string;
};

/**
 * Stable semantic slots for CRM-compact queue rows — config can target these keys
 * without reshaping the whole `QueueItemVm`.
 */
/**
 * Work-unit CRM compact queue row — one labeled fact group (doctrine: muted label above, value below).
 * @see docs/architecture/workspace-work-unit-scope-doctrine.md § Work-unit queue record row (CRM compact — fact groups)
 */
export type WorkUnitQueueCrmFactGroupKind = "contact" | "children_programs" | "timing" | "meta";

export type WorkUnitQueueCrmTimingSegmentVm = {
  /** Field label (no trailing colon — column headers use this text as-is). */
  label: string;
  value: string;
};

/** One chunk in a fact value row: plain string or labeled field (timing). */
export type WorkUnitQueueCrmFactPartVm =
  | string
  | {
      label: string;
      value: string;
    };

/**
 * One value row under a fact group: legacy single string, or separated chunks (flex + gap).
 */
export type WorkUnitQueueCrmFactLineVm = string | { parts: WorkUnitQueueCrmFactPartVm[] };

/**
 * Field-column layout for CRM compact middle zone: each column has a muted header and one or more value rows.
 * Used for contact, timing, and children/program; avoids middot sentence fragments.
 */
export type WorkUnitQueueCrmFactColumnGridVm = {
  headers: string[];
  /** One array per row; each row length must match `headers.length` */
  rows: string[][];
  /** Stable keys for column width CSS (`data-fact-col-key`), parallel to `headers`. */
  columnKeys?: string[];
};

export type WorkUnitQueueCrmFactGroupVm = {
  kind: WorkUnitQueueCrmFactGroupKind;
  /** Muted section title (from `field_labels` + defaults). Empty when `columnGrid` carries all headings. */
  label: string;
  /**
   * Compact field columns (preferred for contact / timing / children when built by current presenter).
   * When set, UI ignores `lines` / `timingSegments` unless renderer falls back.
   */
  columnGrid?: WorkUnitQueueCrmFactColumnGridVm;
  /** Value rows: string and/or `{ parts }` (legacy / meta / flat contact snippet). */
  lines?: WorkUnitQueueCrmFactLineVm[];
  /**
   * Legacy timing payload when `lines` omitted (older `crmFactGroups`). Prefer `columnGrid` or `lines` with `{ parts }`.
   */
  timingSegments?: WorkUnitQueueCrmTimingSegmentVm[];
};

export type CrmCompactChildLineVm = {
  /** Name; may include age suffix from backend (e.g. "Alex (5y)"). */
  primary: string;
  /** Program slice / age-band when distinct from primary (inquiry metadata). */
  secondary?: string | null;
  /** Deduped program / age text for doctrine line (`Name · program`). */
  programInline?: string | null;
  /** Child person id when enriched on queue rows — opens child drawer inline icon. */
  personId?: string | null;
  /** Customer member id when present on structured queue child lines. */
  customerMemberId?: string | null;
  /** OCM row id when present on structured queue child lines. */
  ocmId?: string | null;
};

export type CrmCompactRowSemanticSlots = {
  primaryIdentity: string;
  /** One child name or multiple joined with ` · ` when enrichment flattens fields (single-child / legacy). */
  childName: string | null;
  /**
   * Structured display for **two or more** children (enrolled OCM or inquiry rows).
   * When set with length ≥ 2, CRM compact shows a Children group; single-child uses `childName`.
   */
  childrenLines?: CrmCompactChildLineVm[] | null;
  stageLabel: string | null;
  statusLabel: string | null;
  nextStep: string | null;
  /** Primary stage work line — label · state · due. */
  currentWorkLine?: string | null;
  lastActivity: string | null;
  /** Quote / offer total when present. */
  commercialValue: string | null;
  contactSnippet: string | null;
  /**
   * CRM compact: structured contact when `row_preview` gates supply name/phone/email separately.
   * `contactSnippet` is used for legacy / fallback one-line contact.
   */
  contactDisplayName?: string | null;
  /** Primary contact person id when enriched — inline person drawer icon target. */
  contactPersonId?: string | null;
  contactPhoneDisplay?: string | null;
  contactEmail?: string | null;
  /** Single-child fallback person id when `childName` is set without `childrenLines`. */
  childPersonId?: string | null;
  /** Desired start date, date-only MM-DD-YYYY (UTC), or `—` when the field is in row preview but missing. */
  desiredStartDateDisplay?: string | null;
  /**
   * Tour / timing (normalized). `—` when `tour_date` is in row preview but missing.
   * Prefer `crmCompactTimingValueLine` for work-unit CRM layout.
   */
  tourContext?: string | null;
  /** One line: labeled desired start + labeled tour (spaced), when either is configured in row preview. */
  crmCompactTimingValueLine?: string | null;
  /** Section label above timing value line (`field_labels.timing`). */
  rowPreviewLabelTimingGroup?: string | null;
  /** Section label above children + program rows (`field_labels.children_programs`). */
  crmChildrenProgramsGroupLabel?: string | null;
  /** Per-child inline label before program (`field_labels.program_inline`). */
  rowPreviewLabelProgramInline?: string | null;
  /** `_age_band` when present (contrasts with legacy combined `ageContext`). */
  ageBandContext?: string | null;
  /** Captions for CRM compact row groups — from queue `row_preview.field_labels` + defaults. */
  rowPreviewLabelPrimaryContact?: string | null;
  rowPreviewLabelPhone?: string | null;
  rowPreviewLabelEmail?: string | null;
  rowPreviewLabelDesiredStartDate?: string | null;
  rowPreviewLabelTourDate?: string | null;
  rowPreviewLabelAgeBand?: string | null;
  programContext: string | null;
  roomContext: string | null;
  /** Site / campus label from opportunity `location_id` when enriched on queue rows. */
  locationContext?: string | null;
  ageContext: string | null;
  attentionReason: string | null;
  /**
   * Needs-attention lane only: compact deterministic “why this row” line (resolver labels + SLA), not AI.
   */
  queuePriorityExplanation?: string | null;
  /**
   * Queue-only preview of deterministic recommendation.
   * Read-order: `_operational_recommendation_preview` → `_attention_suggestion_preview`.
   * @deprecated Prefer `operationalReadPreview` (Card 2.3 single-line L0).
   */
  attentionSuggestionPreview?: { nextLabel: string; whyLine: string } | null;
  /**
   * L0 operational read — normalized queue preview slot (Card 2.7).
   * @see QueueOperationalReadPreviewSlot
   */
  operationalReadPreview?: import("@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels").QueueOperationalReadPreviewSlot | null;
  /**
   * One-line derived operational narrative (`_operational_summary_preview` on enriched rows when attention resolution runs).
   * Preview-only — full bullets live on entity GET (`_operational_summary`).
   */
  operationalSummaryPreview?: { headline: string; risk_urgency_hint: "low" | "medium" | "high" } | null;
  /** Deterministic resolver-backed next-step hint (enrollment operational attention). */
  operationalNextHint?: string | null;
  /** Read-only OCM lifecycle rollup (Card 11) — secondary to case `statusLabel`. */
  childLifecycleSummary?: string | null;
  familyNote: string | null;
  /**
   * CRM queue footer: latest note only, split for typography (`timestamp` may be semibold; `body` regular).
   * When omitted, `familyNote` string is shown as a single run (legacy).
   */
  familyNotePreview?: { timestamp: string | null; body: string } | null;
  /** Activity Signals V1 — config-driven stale hint (workflow_events + metadata). */
  activityStale?: { label: string; severity: "low" | "medium" | "high" } | null;
  /** Card 4.6 — household / parent context under child primary identity on waitlist candidate rows. */
  waitlistHouseholdContext?: string | null;
  /**
   * Work-unit queue row doctrine: ordered fact groups for CRM compact middle zone.
   * When non-empty, `QueueBlock` renders these via the shared fact-group renderer.
   */
  crmFactGroups?: WorkUnitQueueCrmFactGroupVm[] | null;
};

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
  /** `inline`: wrap meta as dense CRM strip (work unit compact rows). */
  metaDensity?: "stack" | "inline";
  /** Visual emphasis for SLA / risk (queue card rail + badge tone) */
  urgencyTier?: "critical" | "warning" | "standard";
  /** Resolver: inquiry matches operational needs-attention — subtle accent ({@link QueueBlock} + `.adminv2-ws-wu-queue-card--attention-accent`). */
  needsOperationalAttention?: boolean;
  /**
   * When set, `QueueBlock` renders the CRM-compact preview from these slots,
   * instead of inferring layout from title/subtitle/meta alone.
   */
  semanticCrmCompact?: CrmCompactRowSemanticSlots;
  /** Optional placement preview — never a global rank (Card 7). */
  placementPriority?: QueueRowPlacementPriorityVm;
  /** Child-first placement preview from `_placement_priority_v2` (legacy family_row parse — API). */
  placementPriorityV2?: QueueRowPlacementPriorityV2Vm;
    /** Card 4.6 — one waitlist list row per placement candidate. */
    placementWaitlistCandidate?: QueueRowPlacementWaitlistCandidateVm;
    /** Lifecycle entity for drawer/actions when `id` is a candidate-row composite key. */
    opportunityId?: string;
    /** Primary contact person id when enriched on queue runtime rows — secondary drawer icon target. */
    relatedPersonId?: string | null;
    /** First inquiry/OCM child person id when available — secondary drawer icon target. */
    relatedChildPersonId?: string | null;
    /** Card 9 — grain context for drawer/action intent. */
    rowGrain?: "case" | "child" | "candidate";
    placementCandidateId?: string;
    opportunityCustomerMemberId?: string;
    childLifecycleStatus?: string | null;
    /**
     * Un-gated queue row enrichment for layout runtime record binding.
     * Populated from QueueService fields regardless of row_preview gates.
     */
    layoutRuntimeEnrichment?: import("@/lib/layout/runtime/queueRowLayoutRuntimeEnrichment").QueueRowLayoutRuntimeEnrichment;
    /** Normalized queue row context from QueueService — optional until layout runtime consumes it. */
    _queue_row_context?: import("@/lib/workUnits/lifecycleSubjectContracts").QueueRowContext;
};

/** Candidate-row waitlist queue presentation (`_placement_waitlist_row`). */
export type QueueRowPlacementWaitlistCandidateVm = {
  placementCandidateId: string;
  opportunityId: string;
  childDisplayName: string;
  familyDisplayName: string;
  parentDisplayName: string | null;
  cohortKey: string;
  cohortLabel: string;
  siteId?: string | null;
  desiredProgramType?: string | null;
  desiredProgramCategoryId?: string | null;
  cohortSectionTitle: string;
  bucketLabel: string;
  waitSinceLabel: string | null;
  linkModeLabel: string | null;
  isSyntheticFallback: boolean;
  hasActiveOverride: boolean;
  activeOverrideKinds: string[];
  activeOverrides: Array<{
    id: string;
    overrideKind: string;
    reason: string;
  }>;
  /** Card 5.1 — active pin override for manual waitlist position. */
  hasManualPositionAdjustment: boolean;
  manualAdjustmentReason: string | null;
  pinOverrideId: string | null;
  shadowMode: boolean;
  /** Runtime position within org category section (loaded/filter scope). */
  runtimePosition?: number;
  runtimePositionTotal?: number;
  runtimePositionLabel?: string;
  runtimePositionMode?: "preview" | "live";
  runtimePositionSectionKey?: string;
  runtimePositionHelp?: string;
  runtimePositionPrecedenceNote?: string;
  /** Card 6 — optional forecast hint labels (informational only). */
  forecastHints: string[];
  siblingLabel: string | null;
  siblingCohorts: Array<{
    placementCandidateId: string;
    childDisplayName: string;
    cohortLabel: string;
    linkModeLabel: string | null;
  }>;
  siblingContextLines: string[];
  siblingContextDiagnostics: string | null;
};

/** One child placement line under a family row (read-only). */
export type QueueRowPlacementCandidateLineVm = {
  placementCandidateId: string;
  childDisplayName: string;
  cohortLabel: string;
  cohortKey: string;
  bucketLabel: string;
  waitSinceLabel: string | null;
  linkMode: "independent" | "preferred_together" | "strictly_together";
  linkModeLabel: string | null;
  hasActiveOverride: boolean;
  activeOverrideKinds: string[];
  isSyntheticFallback: boolean;
  /** Preformatted line for list UI. */
  detailLine: string;
};

/** Family-row placement V2 preview (`_placement_priority_v2`). */
export type QueueRowPlacementPriorityV2Vm = {
  evaluated: boolean;
  shadowMode: boolean;
  fallbackToV1: boolean;
  primaryCohortLabel: string;
  primaryCohortSectionTitle: string;
  waitlistProgramShortLabel: string;
  familyBucketLabel: string;
  childCountLabel: string;
  candidateCount: number;
  candidates: QueueRowPlacementCandidateLineVm[];
  blockedByStrictLink: boolean;
  strictLinkCrossOpportunityIncomplete: boolean;
  showPlacementV2Badge: boolean;
};

/**
 * Semantic alias for queue list rows — preview projections only.
 * Business logic must use `entityType` + `entityId` (and entity GET / resolvers), not this shape.
 */
export type QueuePreviewItemVm = QueueItemVm;

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
  /** Work-unit drill list: server queue label (empty states, captions). */
  laneQueueLabel?: string;
  countBadge?: number;
  /** Grain-aware count unit beside badge (Card 7), e.g. "children". */
  countBadgeUnit?: string;
  /** Accessible count phrase for lane header badge. */
  countBadgeAriaLabel?: string;
  /** Primary drill list — preview projections only; authoritative fields live on entity GET / resolvers. */
  items: QueuePreviewItemVm[];
  viewAllActionId?: string;
  viewAllLabel?: string;
  /**
   * Work-unit drill list: work unit key used for queue layout assignment (stage derivation).
   */
  drillWorkUnitKey?: string;
  /** Active business process key for BP/stage layout assignment in this lane. */
  businessProcessKey?: string;
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
   * When placement projection is active for this lane (`placement_projection_diagnostics` on queue items response).
   * Explains preview vs sort — not interactive.
   */
  placementProjectionHint?: string;
  /** Merged `placement_priority_v1.display` when placement is enabled — gates chip / lane hint (Card 8). */
  placementDisplay?: {
    show_bucket_chip?: boolean;
    show_sort_hint?: boolean;
  } | null;
  /**
   * Work-unit lane: `groupKey` → header label (emoji optional). UI appends “ (count)”.
   */
  workUnitGroupHeaders?: Record<string, { emoji?: string; label: string }>;
  /**
   * Work-unit lane: column headers for the two-cell midline (defaults: Window / Route).
   * Use industry-native labels (e.g. Expiry · Binder for renewals).
   */
  workUnitMidlineKeys?: { left?: string; right?: string };
  /**
   * Entity kind for rows in this lane — echoed on `queue.item.action` payloads (`entityType`).
   * Host must open drawers / execute actions by id; never infer entity kind from preview fields alone.
   */
  queueEntityType?: "job" | "schedule" | "opportunity";
  /**
   * Work-unit lane: while true, suppress empty-state copy ("No records") — rows are still loading or tab switched.
   */
  rowsLoading?: boolean;
  /** Lane body held — no row skeleton; coordinated gate until settled rows/empty/error. */
  rowsHeld?: boolean;
  /**
   * Work-unit lane: prior rows visible while newer rows load — dimmed / non-interactive, not emptied.
   * (Separate from rowsLoading skeleton when there was no prior list.)
   */
  rowsRefreshing?: boolean;
  /** Reserved action chips while queue-row registry actions hydrate (avoids pop-in). */
  rowActionsPending?: boolean;
  /** Location-owned program categories for waitlist section sort/labels when site filter is active. */
  waitlistProgramCategoryContext?: import("@/lib/orchestration/placement/waitlistProgramCategoryResolution").WaitlistProgramCategoryContext;
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
  /** Compact type pill before text (e.g. Invoice, Work order) — document / artifact rows */
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
