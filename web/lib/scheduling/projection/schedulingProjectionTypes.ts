/**
 * The canonical Scheduling projection — subject-scoped, assignment-based.
 *
 * Implements `docs/platform/planning/scheduling-projection-contract.md`:
 * one projection powers the Focus Panel, the Scheduling workspace, the Roster
 * drill-down, the Command Surface, print, and BOS. The **Assignment** is the
 * shared atom; every surface is an index over it. `children[]` has N for a
 * household and 1 for a child — the same shape.
 *
 * This module is the READ MODEL only. It derives from canonical entities
 * (`child_enrollment_agreements` → `child_placements` → `schedule_assignments`
 * + `schedule_patterns`) and registered calculations; it authors nothing and
 * duplicates no source row. Rate / projected tuition are `pending` here and
 * enriched from the Billing projection (Billing owns money).
 */

/**
 * V2 REQUIREMENT (not V1 — do not expand the V1 storage/editor for this):
 * **Rotating schedules** — Week A / Week B and other multi-week rotations. V1 stores a
 * single weekly pattern per schedule (weekdays + daily hours). A rotation needs a
 * multi-week cycle model (an ordered set of week-patterns with a cycle length + anchor
 * date) on the assignment/participation store, plus editor affordances to author each
 * week. Deferred to V2; V1 authors one week only.
 */

/** Lifecycle bucket an assignment resolves into for a given `asOf` date. */
export type SchedulingLifecycleBucket = "current" | "upcoming" | "temporary";

/** Money shape displayed by Scheduling (never computed here). */
export type SchedulingMoney = { amount: number; unit: string };

/** Room reference on an assignment. */
export type AssignmentRoom = {
    id: string | null;
    name: string | null;
    program: string | null;
};

/** Presentation vocabulary from `operational_assignment_types` (config-owned). */
export type AssignmentTypePresentation = {
    id: string | null;
    key: string | null;
    label: string | null;
    iconKey: string | null;
    visualTone: "neutral" | "info" | "success" | "warning" | "accent" | null;
    billingParticipation: "none" | "eligible" | null;
    attendanceParticipation: "none" | "expected" | null;
    staffingParticipation: "none" | "supply" | "demand" | null;
};

/**
 * Optional billing consequence display — relationships only. Billing owns
 * amounts; Assignments never generate charges from this field.
 */
export type AssignmentBillingRelationship = {
    participation: "none" | "eligible";
    /** Operator-facing consequence label (e.g. "Tuition", "Recurring billing eligible"). */
    label: string | null;
};

/**
 * The atomic, effective-dated unit of scheduled reality — maps to a
 * `schedule_assignment` row. Scheduling (pattern / hours / days) is one
 * attribute of the assignment; primary / type / billing participation are peers.
 */
export type Assignment = {
    id: string;
    /** Subject identity: child customer_member_id or staff person id. */
    subjectId: string;
    subjectType: "child" | "staff";
    /** @deprecated Prefer subjectId; retained for child compact consumers. */
    childId: string;
    room: AssignmentRoom;
    weekdays: number[]; // 0=Sun .. 6=Sat
    arriveTime: string | null;
    departTime: string | null;
    effectiveFrom: string; // YYYY-MM-DD
    effectiveTo: string | null; // null => open-ended
    openEnded: boolean;
    kind: "base" | "temporary";
    status: string;
    isPrimary: boolean;
    /** proposed = planning (no agreement); committed = agreement-backed operational truth */
    commitmentKind?: "proposed" | "committed";
    assignmentType: AssignmentTypePresentation;
    patternId: string | null;
    patternLabel: string | null;
    billing: AssignmentBillingRelationship;
    supersedes?: string;
};

/**
 * A lifecycle grouping of a child's assignments plus its consequences — the
 * operator-facing "schedule". Resolved from atoms, not stored.
 */
export type ScheduleView = {
    bucket: SchedulingLifecycleBucket;
    effectiveFrom: string;
    effectiveTo: string | null;
    openEnded: boolean;
    temporary: boolean;
    assignments: Assignment[]; // 1+ (split-week = several)
    /** The schedule type (e.g. `full_day`) resolved for the pattern; drives re-save. */
    scheduleType?: string | null;
    /** Configured label for the schedule type (e.g. "Full Day") — never a raw key. */
    scheduleTypeLabel?: string | null;
    rate: SchedulingMoney | "pending";
    projectedTuition: SchedulingMoney | null;
    fundingApplies?: boolean;
};

/** A single point on the read-only effective-dated history chain. */
export type ScheduleHistoryEntry = {
    effectiveFrom: string;
    effectiveTo: string | null;
    summary: string;
};

export type ChildSchedulingStatus =
    | "scheduled"
    | "proposed"
    | "needs-placement"
    | "upcoming-only"
    | "ended";

/**
 * A configured command resolved from the Action Runtime (never hardcoded).
 * The pure read model leaves this empty; the API composition layer attaches
 * eligibility-/permission-filtered commands via `resolveActionsForContext`.
 */
export type ConfiguredCommandRef = {
    key: string;
    label: string;
    state: "Recommended" | "Ready" | "Warning" | "Blocked" | "Unavailable";
    reason?: string;
};

export type ChildSchedulingSubject = {
    id: string; // customer_member_id
    name: string;
    program: string | null;
    ageGroup: string | null;
    siteId: string | null;
    siteName: string | null;
};

/** Freshness / completeness carried so every consumer guards identically. */
export type SchedulingCalculationMeta = {
    computedAt: string; // ISO instant, injected (never Date.now in pure code)
    freshness: "fresh" | "stale";
    inputVersions: Record<string, string>;
    completeness: "complete" | "partial";
    partialReasons: string[];
};

export type ChildScheduling = {
    child: ChildSchedulingSubject;
    /**
     * Which kind of subject `child` above describes. Absent means `child`, so every existing
     * producer and consumer keeps its current meaning without a migration.
     *
     * The field name `child` records the first subject this carrier served, not a constraint:
     * `schedule_assignments` was extended in place so staff and children share one scheduling
     * engine, and the projection follows the table. Renaming the carrier across every consumer
     * would be churn unrelated to reading a staff commitment, so the discriminator is added instead
     * — and consumers that must tell the difference read THIS, never the shape of the id.
     */
    subjectType?: "child" | "staff";
    status: ChildSchedulingStatus;
    /** Present when an operational enrollment agreement exists for this child+site. */
    enrollmentAgreementId?: string | null;
    current: ScheduleView | null;
    /**
     * A pre-enrollment PROPOSED schedule drafted on the child's enrollment
     * participation (`process_instances.metadata`), when no committed `current`
     * exists. Planning-only until enrollment materializes it. Null when neither a
     * committed schedule nor a draft exists (true empty state).
     */
    proposed: ScheduleView | null;
    upcoming: ScheduleView[];
    temporary: ScheduleView[];
    history: ScheduleHistoryEntry[];
    availableCommands: ConfiguredCommandRef[];
};

export type SchedulingProjectionSubject = {
    type: "household" | "child" | "staff";
    id: string;
    name: string;
};

/** The canonical projection. `children[]` is N (household) or 1 (child). */
export type SchedulingProjection = {
    subject: SchedulingProjectionSubject;
    asOf: string; // resolution date, YYYY-MM-DD (default today)
    children: ChildScheduling[];
    calculationMeta: SchedulingCalculationMeta;
};
