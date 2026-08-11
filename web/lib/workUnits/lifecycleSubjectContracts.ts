/**
 * Lifecycle subject + work-unit surface context contracts.
 *
 * @see docs/sprints/archive/06_2026/status_ownership_and_lifecycle_grain_expansion.md
 * @see docs/sprints/archive/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md
 * @see docs/system/work-unit-surface-context-contract.md
 *
 * Frozen architecture contracts for Layout Configuration and queue/drawer runtime.
 * Partial adapters may omit fields until later implementation phases.
 */

import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

/**
 * Frozen partial contract — bump when breaking shape changes.
 * `1.1-partial`: optional grouped same-stage row fields (backward compatible).
 */
export const QUEUE_ROW_CONTEXT_CONTRACT_VERSION = "1.1-partial" as const;

export type QueueRowContextContractVersion = typeof QUEUE_ROW_CONTEXT_CONTRACT_VERSION;

/**
 * Entity whose lifecycle stage/status creates queue membership for a work unit queue view.
 * Superset of {@link QueueGrain} (`case` | `child` | `candidate`) for cross-vertical reuse.
 */
export type LifecycleSubjectType =
    | "case"
    | "child"
    | "candidate"
    | "customer"
    | "vendor"
    | "associate"
    | "agent";

/** Queue membership grains implemented today in queue_definition v2. */
export type QueueMembershipGrain = "case" | "child" | "candidate";

export function isQueueMembershipGrain(value: string): value is QueueMembershipGrain {
    return value === "case" || value === "child" || value === "candidate";
}

export type LifecycleSubjectCaseAnchor = {
    entity_type: "opportunities";
    entity_id: string;
};

export type LifecycleSubjectRef = {
    subject_type: LifecycleSubjectType;
    subject_id: string;
    /** Process scope — e.g. enrollment department lifecycle. */
    lifecycle_key: string;
    /** Builder stage key or queue domain stage key. */
    stage_key: string;
    /** Authoritative status key for this subject. */
    status_key: string;
    /** When subject_type !== case — links to household/case shell. */
    case_anchor?: LifecycleSubjectCaseAnchor;
};

export type QueueRowSubjectPresentation = {
    subject_type: LifecycleSubjectType;
    subject_id: string;
    display_name: string;
    /** Effective process stage key when known (variant matching / Focus Panel). */
    stage_key?: string | null;
    /** ISO date-of-birth when known from inquiry / household child payload. */
    date_of_birth?: string | null;
    /** Compact age label (e.g. `2y2m`, `6m`) derived from DOB or inquiry age. */
    age_label?: string | null;
    /** Gender label when hydrated on queue row inquiry child payload. */
    gender_label?: string | null;
};

export type QueueRowCaseContext = {
    case_id: string;
    display_name: string;
    case_type_label: string;
    case_status_key: string;
    case_status_label: string;
};

export type QueueRowPrimaryContact = {
    display_name: string;
    phone?: string | null;
    email?: string | null;
};

/** Sibling visibility under site/department access scope — see entity status + location contract §5.3. */
export type RelatedSubjectVisibility = "full" | "redacted" | "hidden";

/** Child inquiry placement — authoritative on OCM; optional on queue row context. */
export type SubjectPlacementContext = {
    location_id: string | null;
    location_label?: string | null;
    program_key?: string | null;
    program_label?: string | null;
    room_id?: string | null;
    room_label?: string | null;
    schedule_key?: string | null;
    schedule_label?: string | null;
};

export type RelatedSubjectSummary = {
    subject_type: LifecycleSubjectType;
    subject_id: string;
    display_name: string;
    /** Enrollment disposition / stage label for this child's OCM track. */
    status_label: string;
    /** TODO(phase-7): set by access-scope resolver — default `full` when omitted. */
    visibility?: RelatedSubjectVisibility;
    location_id?: string | null;
    location_label?: string | null;
    program_label?: string | null;
    room_label?: string | null;
    schedule_label?: string | null;
    /** ISO date-of-birth when known from inquiry / household child payload. */
    date_of_birth?: string | null;
    /** Compact age label (e.g. `2y2m`, `6m`) derived from DOB or inquiry age. */
    age_label?: string | null;
    /** Gender label when hydrated on queue row inquiry child payload. */
    gender_label?: string | null;
};

export type QueueRowAttentionSummary = {
    needs_attention: boolean;
    primary_reason_label: string | null;
};

export type QueueRowWorkSummary = {
    open_count: number;
    primary_open_label: string | null;
};

export type QueueRowCurrentWorkSummary = {
    label: string;
    state: "open" | "completed" | "planned" | "none";
    due_label: string | null;
    /** e.g. "2 of 3 complete" — work language, not stage/status. */
    progress_hint: string | null;
    /** Primary blocker or attention reason for the queue hint line. */
    blocker_hint: string | null;
};

export type QueueRowNextBestAction = {
    label: string;
    action_key?: string;
    source: "recommendation" | "action_placement" | "none";
};

export type QueueRowPresentationMode = "single_subject" | "grouped_subjects";

/** Lane / row count unit — `enrollment_track` preferred for child OCM lanes. */
export type QueueRowCountUnit = "enrollment_track" | "cases" | "children" | "candidates";

export type QueueRowDrawerOpen = {
    entity_type: "opportunities";
    entity_id: string;
    /** Single-child focus — row click or child line click inside grouped card. */
    active_subject?: LifecycleSubjectRef;
    /** Same-case + same-stage group open — highlights multiple OCM tracks. */
    active_subject_group?: LifecycleSubjectRef[];
    /** Builder stage_key when opening from grouped card (e.g. `tour`). */
    stage_focus_key?: string;
};

/**
 * Normalized queue row context for layout blocks and drawer navigation.
 * Phase 1 partial adapter populates case-grain rows honestly as subject_type `case`.
 */
export type QueueRowContext = {
    contract_version: QueueRowContextContractVersion;

    /**
     * Presentation mode — default `single_subject` when omitted.
     * Grouped rows: same case + same enrollment stage (§ entity status contract §3.3–§3.4).
     */
    row_presentation_mode?: QueueRowPresentationMode;

    row_subject: QueueRowSubjectPresentation;
    /**
     * All enrollment tracks in a grouped row. Omitted for single-subject rows.
     * Count truth = length of this array (not deduped to one household).
     */
    row_subjects?: QueueRowSubjectPresentation[];
    /** Stable group id, e.g. `{case_id}:{stage_key}` + optional location/program scope. */
    row_grouping_key?: string;
    /** Enrollment tracks represented by this presentation row (grouped card). */
    row_count?: number;
    row_count_unit?: QueueRowCountUnit;

    /** Operator stage label for the queue lane (e.g. "Tours", "New Leads"). */
    row_stage: string;
    /**
     * Effective process stage KEY for this row (e.g. `waitlist`). Distinct from `row_stage`
     * (operator label). Required for Queue Row variant `appliesWhen.stage_key` matching.
     */
    row_stage_key?: string | null;
    /**
     * Configured stage key → the tenant's authored label. Additive and optional: configured stages
     * are the only runtime stage vocabulary, so a per-row stage can render in the operator's own
     * words ("Tours") rather than a humanized key ("Tour"). Absent when no stage list is in scope,
     * in which case the key is humanized.
     */
    stage_labels_by_key?: Record<string, string>;
    lifecycle_key: string;
    row_status_key: string;
    row_status_label: string;

    case_context: QueueRowCaseContext;
    primary_contact: QueueRowPrimaryContact | null;
    related_subjects_summary: RelatedSubjectSummary[];

    /**
     * Case-scoped attention today.
     * TODO(phase-4): subject-scoped attention for child/candidate rows.
     */
    attention_summary: QueueRowAttentionSummary | null;

    /**
     * Case-scoped open work rollup.
     * TODO(phase-5): subject-scoped work summary when per-child work ships.
     */
    work_summary: QueueRowWorkSummary | null;

    /** Primary stage operating-plan work item for queue row preview. */
    current_work_summary: QueueRowCurrentWorkSummary | null;

    /**
     * BOS / placement recommendation hint.
     * TODO(phase-6): grain-aware next-best-action selection.
     */
    next_best_action: QueueRowNextBestAction | null;

    drawer_open: QueueRowDrawerOpen;

    /**
     * Placement on the row lifecycle subject (OCM / candidate).
     * TODO(phase-1): populate from OCM columns in partial adapter.
     */
    placement_context?: SubjectPlacementContext | null;

    /**
     * Waitlist ranking context for candidate-grain rows (Variants Phase 5). Populated from the
     * placement waitlist projection; absent for non-candidate rows. Presentation-only — the compact
     * row's Subject Focus (`placement_candidate_child`) surfaces the position as supporting context.
     * Optional + additive → the frozen contract version does not change.
     */
    waitlist_context?: {
        position_label?: string | null;
        wait_since?: string | null;
        /** Placement priority score when projected (optional display). */
        priority?: number | null;
        /** Placement System candidate id — required for manual-position adjustment. */
        placement_candidate_id?: string | null;
        /** True when published Waitlist variant exposes placement adjustment and a candidate is attached. */
        can_adjust_placement?: boolean | null;
    } | null;

    /**
     * Time in current operational stage / cohort membership (not Work View age, not updated_at).
     * Additive — CondensedQueueRow shows compact age at the right edge when present.
     */
    operational_state?: {
        /** Authoritative stage key for this row subject. */
        stage_key: string | null;
        /** ISO entry time for the current stage membership occurrence. */
        entered_at: string | null;
        /** Resolver provenance. */
        source: "persisted_stage_entered_at" | "intake_created_at" | "unknown";
        /** Compact label (`12m`, `3h`, `2d`) — null when unknown. */
        age_compact: string | null;
        /** Accessible full label — null when unknown. */
        age_accessible: string | null;
    } | null;

    /**
     * Personal seen/unseen for the current operator on this stage membership occurrence.
     * Absent when the viewer is anonymous or acknowledgement is not hydrated.
     */
    personal_seen?: {
        unseen: boolean;
        occurrence_key: string | null;
    } | null;
};

export type DrawerSubjectFocusMode =
    | "case_default"
    | "subject_highlight"
    | "subject_group_highlight";

export type DrawerSubjectContext = {
    active_subject?: LifecycleSubjectRef;
    /** Multiple children same enrollment stage — shared lifecycle visual. */
    active_subject_group?: LifecycleSubjectRef[];
    focus_mode: DrawerSubjectFocusMode;
    /** Stage key for lifecycle visual block — from active subject or group stage_focus. */
    lifecycle_visual_stage_key: string;
    /** Operator stage label from queue row (e.g. "Tours") — display only. */
    stage_focus_label?: string;
    related_subjects: RelatedSubjectSummary[];
};

/**
 * Count unit for queue lane totals — labels what a row/count represents so N is never ambiguous
 * (households vs children vs candidates). Wired from the lane's queue_membership_v1.count_unit via
 * laneRouting.countUnit (see queueMembershipRuntimeResolver / QueueService / attachQueueRowContextToItems).
 * The workspace work-view TOTAL label is the one remaining surface not yet carrying it.
 */
export type WorkUnitQueueCountUnit = "cases" | "children" | "candidates";

export type WorkUnitSurfaceContextRow = {
    id: string;
    queue_row_context: QueueRowContext;
};

export type WorkUnitSurfaceDrawerContext = DrawerSubjectContext & {
    case_record: unknown;
    readiness?: ReadinessResult | null;
    attention?: OpportunityAttentionResult | null;
    work_instances?: unknown[] | null;
};

/**
 * Runtime payload Layout Configuration system blocks should consume.
 * Platform resolvers populate this shape — layout JSON must not re-derive grain logic.
 */
export type WorkUnitSurfaceContext = {
    contract_version: QueueRowContextContractVersion;
    work_unit_id: string;
    queue_key: string;
    queue_grain: LifecycleSubjectType;
    lifecycle_key: string;
  /** Populated from the lane's count_unit (laneRouting.countUnit) — households/children/candidates. */
    count_unit?: WorkUnitQueueCountUnit;
    rows: WorkUnitSurfaceContextRow[];
    drawer?: WorkUnitSurfaceDrawerContext;
};

/** Enriched opportunity queue row may carry normalized context (optional until wired). */
export type OpportunityQueueRowWithContext = Record<string, unknown> & {
    _queue_row_context?: QueueRowContext;
};
