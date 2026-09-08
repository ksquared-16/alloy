import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { TourBookingStatusKey } from "@/lib/tours/bookings/types";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { RecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import type { FamilyCommunicationWorkspacePreviewVM } from "@/lib/communications/v2/familyWorkspace/types";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

/**
 * Operational Context — the forward-facing runtime boundary for cards.
 *
 * Canonical spine (doctrine): Queue → Operational Context → Focus Panel → Cards.
 * Cards observe an `OperationalContext`; they do NOT consume drawer terminology
 * (`drawerId`, `displayVm`, `DrawerTabKey`) or LayoutDoc/drawer-body abstractions.
 *
 * This type is intentionally small. The composed subject ViewModel remains the
 * internal implementation of `truth` during migration — see
 * `buildOperationalContext.ts` (the adapter) — but the shape cards depend on is
 * this contract.
 *
 * @see docs/platform/operator/operational-context-boundary.md
 * @see docs/platform/operator/household-reference-card.md
 */

export type OperationalSubjectRef = {
    /** Entity type of the subject (e.g. "opportunity", "person"). */
    type: string;
    id: string;
    /** Operator-facing label (household / person / record title). */
    label: string;
};

export type OperationalBusinessProcess = {
    key: string | null;
    label: string | null;
    /**
     * THE PROCESS'S NAME, distinct from `label` — which is the current STAGE's label.
     *
     * Two different questions that read alike: "what process is this record in" (Enrollment) versus
     * "where in it is the record" (Waitlist). Conflating them titled the Business Process card with
     * its own current stage.
     */
    name?: string | null;
    /** Current builder stage key, when known. */
    stageKey: string | null;
    /**
     * THE CONFIGURED STAGE SET, in configured order — the department lifecycle's own answer to
     * "what are the stages of this process", carried so a card can render the rail without
     * re-deriving an order from somewhere else.
     *
     * Each entry may declare up to TWO annotation slots. The cap lives with the platform, not with
     * configuration: configuration chooses WHICH canonical fact fills a slot, never how many slots
     * there are. Empty when the department declares no lifecycle — an unstaged process is a real
     * answer, and the rail is simply absent.
     */
    stages?: Array<{
        key: string;
        label: string;
        /** Configured annotation slots, capped at two by the platform. */
        support?: readonly string[];
    }>;
};

/**
 * THE PARTICIPANT SCOPE — contextual, never a change of grain.
 *
 * The Focus Panel subject stays the CASE. This says only "of the participants on that case, one is
 * the operator's current concern", which several cards legitimately consume: the Process rail
 * emphasises them, Attendance resolves its child, Health and Financials filter by subject.
 *
 * ── WHY A SHARED CARRIER AND NOT A FIELD PER CARD ──
 *
 * Without it every card re-resolves the same child from whatever it can reach, and they drift: one
 * reads a display name, another the first row, a third a card-local selection. One carrier means one
 * answer, and the identity is STABLE — ids, never labels.
 *
 * ── THE RULES ARE THE POINT ──
 *
 * Optional. Explicit. Never inferred from a display label. Never a silent fall back to the first
 * child of a multi-child family — a wrong child is worse than no child, because the operator cannot
 * see that the card answered about someone else. Absent means absent, and a card that needs a
 * participant must say so rather than guess one.
 */
export type OperationalParticipantScope = {
    /** The participation row — `opportunity_customer_members.id`. The stable identity of record. */
    participationId: string;
    /** The durable child — `customer_members.id`, when the participation names one. */
    customerMemberId: string | null;
    /** The person behind the child, when one exists. A child may have no `persons` row. */
    personId: string | null;
    /** Operator-facing name, for presentation only. Never used to resolve or match. */
    displayName: string | null;
    /** Canonical avatar reference, already authorized. Null renders initials. */
    imageUrl: string | null;
    /** The participant's own stage identity, when already composed. Placement is by this, not by a label. */
    stageKey: string | null;
    /** Presentation label for that stage. */
    stageLabel: string | null;
};

export type OperationalContextPerspective = {
    /** Mission line for the active operational view, when known. */
    missionLabel: string | null;
} | null;

export type OperationalContextCapabilities = {
    /** Whether the operator may mutate this subject (server-resolved). */
    canMutate: boolean;
    /** Whether contact channels / sensitive fields must be masked for this operator. */
    maskedChannels: boolean;
};

export type OperationalContextStatus =
    | "ready"
    | "composing"
    | "error"
    | "permission_limited";

/**
 * Operational signals — the composed-but-not-flat operational truth cards observe.
 *
 * `truth` is the subject's field bag (the above-fold record). Some operational
 * facts are not flat record fields — open work, attention, scheduled tour — they
 * are composed upstream. The adapter (`buildOperationalContext`) projects them
 * here so Work / Intelligence cards observe the Operational Context, never the
 * drawer VM. These are read-once derivations; cards never fetch or recompute.
 */
export type OperationalWorkItemState = "open" | "completed" | "planned";
export type OperationalWorkUrgency = "overdue" | "today" | "upcoming" | null;
export type OperationalWorkItemKind = "stage_work" | "task";

export type OperationalWorkItem = {
    id: string;
    label: string;
    state: OperationalWorkItemState;
    /** Human due label ("Due today", "Overdue 2 days", "Due Jun 30"), null when none. */
    dueLabel: string | null;
    /** Raw due timestamp/date, null when none. */
    dueAt: string | null;
    urgency: OperationalWorkUrgency;
    /** Origin ("BOS Assist", "workflow", "manual"), null when unknown. */
    source: string | null;
    kind: OperationalWorkItemKind;
};

export type OperationalWorkSignal = {
    /** Most-urgent open item — the single answer for Current Work overview. */
    primary: OperationalWorkItem | null;
    /** All open/active work items (stage work + operational tasks). */
    items: OperationalWorkItem[];
    openCount: number;
    overdueCount: number;
    /** Configured next action label (header action), null when none. */
    nextActionLabel: string | null;
};

export type OperationalAttentionSignal = {
    needsAttention: boolean;
    primaryReason: string | null;
    reasonCount: number;
};

export type OperationalTourSignal = {
    /**
     * An ACTIVE booking exists — one of `requested`, `pending_approval`, `confirmed`,
     * `rescheduled`. Terminal bookings (`canceled`, `completed`, `no_show`) are filtered out
     * upstream by `loadOpportunityActiveTourBookingsForViewModel`, so this is false for them.
     */
    scheduled: boolean;
    startAt: string | null;
    /**
     * MISNAMED, AND LOAD-BEARING. This has always carried the raw `tour_bookings.status_key`,
     * not an operator-facing label — see the note where it is projected. Kept under this name
     * because existing readers (What's Next context facts) match on it; `statusKey` below is the
     * same value under a name that says what it is, and is what new command/presentation seams
     * should read.
     */
    statusLabel: string | null;
    /**
     * The canonical durable `tour_bookings.status_key` of the booking the Tour concept speaks
     * for — `canceled`, `completed` and `no_show` included, so a concluded tour never reads as
     * a tour that never happened.
     *
     * Presentation and eligibility branch on THIS, never on `statusLabel` and never on a
     * rendered string: identifying state by display text is the same class of defect as
     * identifying an executable action by its label.
     */
    statusKey: TourBookingStatusKey | null;
    /** ID of the active tour_bookings row — present when scheduled=true, null otherwise. */
    bookingId: string | null;
    /** Operator-facing parent attendance confirmation label when composed. */
    parentConfirmationLabel?: string | null;
};

export type OperationalCommunicationsSignal = {
    /** Number of outgoing messages scheduled for future delivery. */
    scheduledSendCount: number;
    /** ISO timestamp of the next configured follow-up, null when none. */
    nextFollowUpAt: string | null;
    /** True when there is any scheduled send or pending follow-up. */
    hasOutreach: boolean;
    /** ID of the next pending scheduled send, null when none. Used for cancel action. */
    nextScheduledSendId: string | null;
};

/**
 * Billing signal — projected billing configuration facts for the subject case.
 * Deferred (read-only) until the billing assignment write path exists.
 * @see docs/platform/operator/operational-grain-doctrine.md §7
 */
export type OperationalBillingSignal = {
    /** True when the billing_configured flag is set on the composed record. */
    billingConfigured: boolean;
    billingContactName: string | null;
    billingContactEmail: string | null;
    tuitionRateLabel: string | null;
    /** Fee balance in cents, null when not present or not applicable. */
    feeBalanceCents: number | null;
};

/** Null-state billing signal for fixtures and contexts without billing data. */
export const NULL_BILLING_SIGNAL: OperationalBillingSignal = {
    billingConfigured: false,
    billingContactName: null,
    billingContactEmail: null,
    tuitionRateLabel: null,
    feeBalanceCents: null,
};

/**
 * Employment signal — the employment held by the case's linked contacts.
 *
 * PERSON-OWNED TRUTH, PROJECTED. `PersonEmploymentComposition` is produced by
 * `lib/employment` and carried here verbatim; the case contributes only "which of my
 * people" and their order. Nothing about employment is decided at case grain, and no
 * employment fact is persisted on the opportunity.
 *
 * It lives on the context because a Person attention gesture resolves through the
 * household to its case (`resolveOperatorFocusTarget` types the host as the literal
 * `"opportunities"`), so the case panel is the only surface that composes for that
 * person. @see lib/employment/buildCaseEmploymentProjection.ts
 */
export type OperationalEmploymentPerson = {
    personId: string;
    personLabel: string | null;
    /** Verbatim person-owned composition. */
    employment: PersonEmploymentComposition;
};

export type OperationalEmploymentSignal = {
    /** The case's primary person when they hold employment here, else null. */
    primary: OperationalEmploymentPerson | null;
    /** Every linked contact with an employment period, primary first. */
    people: OperationalEmploymentPerson[];
    /**
     * True when at least one linked contact works (or worked) here. False is a real
     * answer — "nobody linked to this case is staff" — never a loading state.
     */
    hasEmployment: boolean;
};

/** Null-state employment signal for fixtures and cases with no projection. */
export const NULL_EMPLOYMENT_SIGNAL: OperationalEmploymentSignal = {
    primary: null,
    people: [],
    hasEmployment: false,
};

export type OperationalContextSignals = {
    work: OperationalWorkSignal;
    attention: OperationalAttentionSignal;
    tour: OperationalTourSignal;
    communications: OperationalCommunicationsSignal;
    /** Billing configuration signal (read-only projection; deferred mutation). */
    billing: OperationalBillingSignal;
};

/**
 * The operational grain of this context.
 *
 * - `"case"` — subject is an Opportunity (household/family). Every QUEUE-hosted Focus
 *   Panel context is case-grain.
 * - `"child"` — subject is an OCM (child within a case). Not yet used in the
 *   Focus Panel; reserved for child-grain queue row contexts.
 * - `"candidate"` — subject is a PlacementCandidate. Reserved for candidate-
 *   grain queue row contexts (Waitlist queue).
 * - `"person"` — subject is a durable `persons` row, attended SUBJECT-FIRST with no queue
 *   and possibly no case at all. A staff member is the canonical example: `staff.add`
 *   writes `persons` + `employments` and nothing else. This grain never arrives from a
 *   lens — `subjectGrain.ts` explains why `resolveSubjectGrain` still refuses a
 *   person-grain LENS, which is a different question.
 *
 * @see docs/platform/operator/operational-grain-doctrine.md §1
 * @see docs/runtime/DURABLE-RECORD-ATTENTION.md
 */
export type OperationalGrain = "case" | "child" | "candidate" | "person";

/**
 * The case-shaped signals, in their not-applicable state.
 *
 * ⚠ READ THIS BEFORE USING IT. These are NOT zeroes meaning "this subject has no work / no
 * attention / no tour". They mean **the question does not apply to this grain**: work, attention,
 * tours, outreach and billing are all case concepts, and a durable Person is not a case.
 *
 * The distinction matters because `signals` is structurally required on every `OperationalContext`,
 * so a non-case producer must supply *something*. Supplying this is safe only because no card
 * declared for a non-case grain reads these fields — enforced by the grain concern
 * (`focusPanelCardGrainConcern.ts`) and asserted directly in `durablePersonFocusPanel.test.ts`.
 * If a future non-case card genuinely needs one of these answers, it must get a real projection
 * for its own grain; widening this constant's meaning would be the lie.
 *
 * Follows the established `NULL_BILLING_SIGNAL` / `NULL_EMPLOYMENT_SIGNAL` pattern above.
 */
export const NOT_APPLICABLE_CASE_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
    communications: {
        scheduledSendCount: 0,
        nextFollowUpAt: null,
        hasOutreach: false,
        nextScheduledSendId: null,
    },
    billing: NULL_BILLING_SIGNAL,
};

export type OperationalContext = {
    /** Grain of this context — `case` for every queue-hosted panel, `person` for a durable record. */
    grain: OperationalGrain;
    subject: OperationalSubjectRef;
    businessProcess: OperationalBusinessProcess;
    perspective: OperationalContextPerspective;
    /**
     * Composed subject truth — observed by cards. Read once at the context level;
     * cards never re-fetch it. (Implementation: the composed subject ViewModel's
     * above-fold record during migration.)
     */
    truth: Record<string, unknown>;
    /**
     * Projected operational signals (work / attention / tour) for cards whose
     * answer is not a flat record field. @see OperationalContextSignals.
     */
    signals: OperationalContextSignals;
    /**
     * The scoped participant, when the runtime has explicitly selected one. ABSENT IS THE ORDINARY
     * CASE and is a real answer: it means no participant is scoped, never "resolve one yourself".
     * @see OperationalParticipantScope
     */
    participantScope?: OperationalParticipantScope | null;
    /**
     * Stage operating-plan runtime projection — read-only source for Current Work.
     * Populated by `buildOperationalContext`; cards never fetch this separately.
     */
    stageWorkRuntime?: StageWorkRuntimeProjection | null;
    /**
     * True while the deferred stage-work projection is still resolving (Tier-2). The Current Work
     * region must render a neutral pending treatment in its final geometry, NOT the empty state —
     * a null `stageWorkRuntime` during pending is "not loaded yet", not "no active work".
     */
    stageWorkPending?: boolean;
    /**
     * Registry-backed record_header action slots — supporting actions for Current Work.
     * Populated by `buildOperationalContext`; cards never fetch separately.
     */
    recordHeaderActions?: ResolvedActionsBySlot | null;
    /**
     * Published process/stage configuration from lifecycle builder — drives Current Work overlay.
     * Same source as /processes stage bootstrap (operating plan + action catalog + field rules).
     */
    publishedStageInputs?: PublishedStageInputsForCurrentWork | null;
    /**
     * SETTLEMENT-only projections. These feed drill/enrichment cards (the `workflow_steps` lifecycle
     * rail, the activity-mode communications workspace) that are RESERVED at commit and filled by the
     * drawer VM. They exist here so those cards read the context — never the drawer VM directly — which
     * is what lets `compat.subjectVm` be removed. The commit-critical producer leaves them null (the
     * cards reserve geometry); the enriched producer (`buildOperationalContext`) fills them. They are
     * NOT commit-critical — no first operator action depends on them.
     */
    lifecycleRail?: RecordLifecycleRailModel | null;
    communicationsPreview?: FamilyCommunicationWorkspacePreviewVM | null;
    /**
     * Employment of the case's linked contacts. A SETTLEMENT projection in the same class as
     * the two above: the opportunity payload composes it during enrichment, so the
     * commit-critical producer leaves it null and the card reserves geometry until it fills.
     *
     * Null therefore means "not composed yet", which is why the card must read
     * {@link NULL_EMPLOYMENT_SIGNAL} for it rather than concluding "nobody is staff" — an
     * absent projection and an empty one are different facts, and only the latter is an answer.
     */
    employment?: OperationalEmploymentSignal | null;
    /**
     * The operational case this subject is ALSO being worked in, when one exists. Durable panels only.
     *
     * ── ENRICHMENT, NEVER AUTHORITY ──
     *
     * A durable record exists because the record exists. This field says "a family case for this
     * subject is currently on an active Work Unit" — it may add an affordance (go to where this is
     * being worked) and it may never decide whether the subject exists, change its identity, or
     * supply its `businessProcess`. Borrowing the family's stage would put household process state
     * onto a staff member's or a child's own record.
     *
     * Null on every queue-hosted panel, because those panels ARE the host. Null on a durable panel
     * means no active unit pages this subject's case — the ordinary state after an enrollment ends.
     *
     * @see docs/runtime/DURABLE-RECORD-ATTENTION.md
     */
    operationalHost?: OperationalHostContext | null;
    capabilities: OperationalContextCapabilities;
    status: OperationalContextStatus;
};

/**
 * Where a durable subject is additionally being worked.
 *
 * Deliberately a NARROW shape rather than the whole `AttentionResolution`: a durable panel must be
 * able to note that a case exists without being able to reach into that case's composition. Widening
 * this is how the case would creep back into being the durable record's authority.
 */
export type OperationalHostContext = {
    /** The case (`opportunities.id`) hosting this subject's family work. */
    opportunityId: string;
    /** Active Work Unit key paging that case, or null when no active unit does. */
    workUnitKey: string | null;
};
