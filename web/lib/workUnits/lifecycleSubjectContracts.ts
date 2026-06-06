/**
 * Lifecycle subject + work-unit surface context contracts.
 *
 * @see docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md
 * @see docs/system/work-unit-surface-context-contract.md
 *
 * Frozen architecture contracts for Layout Configuration and queue/drawer runtime.
 * Partial adapters may omit fields until later implementation phases.
 */

import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

/** Frozen partial contract — bump when breaking shape changes. */
export const QUEUE_ROW_CONTEXT_CONTRACT_VERSION = "1.0-partial" as const;

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

export type RelatedSubjectSummary = {
    subject_type: LifecycleSubjectType;
    subject_id: string;
    display_name: string;
    status_label: string;
};

export type QueueRowAttentionSummary = {
    needs_attention: boolean;
    primary_reason_label: string | null;
};

export type QueueRowWorkSummary = {
    open_count: number;
    primary_open_label: string | null;
};

export type QueueRowNextBestAction = {
    label: string;
    action_key?: string;
    source: "recommendation" | "action_placement" | "none";
};

export type QueueRowDrawerOpen = {
    entity_type: "opportunities";
    entity_id: string;
    active_subject: LifecycleSubjectRef;
};

/**
 * Normalized queue row context for layout blocks and drawer navigation.
 * Phase 1 partial adapter populates case-grain rows honestly as subject_type `case`.
 */
export type QueueRowContext = {
    contract_version: QueueRowContextContractVersion;

    row_subject: QueueRowSubjectPresentation;
    /** Operator stage label for the queue lane (e.g. "Tours", "New Leads"). */
    row_stage: string;
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

    /**
     * BOS / placement recommendation hint.
     * TODO(phase-6): grain-aware next-best-action selection.
     */
    next_best_action: QueueRowNextBestAction | null;

    drawer_open: QueueRowDrawerOpen;
};

export type DrawerSubjectContext = {
    active_subject: LifecycleSubjectRef;
    focus_mode: "case_default" | "subject_highlight";
    /** Stage key for lifecycle visual block — from active_subject. */
    lifecycle_visual_stage_key: string;
    related_subjects: RelatedSubjectSummary[];
};

/**
 * Count unit for queue lane totals — mirrors queue_definition v2 `count_unit` when present.
 * TODO(phase-6): wire count_unit from normalized queue entry in summaries API.
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
  /** TODO(phase-6): populate from NormalizedQueueEntry.count_unit. */
    count_unit?: WorkUnitQueueCountUnit;
    rows: WorkUnitSurfaceContextRow[];
    drawer?: WorkUnitSurfaceDrawerContext;
};

/** Enriched opportunity queue row may carry normalized context (optional until wired). */
export type OpportunityQueueRowWithContext = Record<string, unknown> & {
    _queue_row_context?: QueueRowContext;
};
