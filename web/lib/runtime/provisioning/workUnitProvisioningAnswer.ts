/**
 * D1 — THE BOUNDED PROVISIONING ANSWER (the Entry Resource).
 *
 * Governing (landed, in-branch):
 *   docs/platform/runtime/runtime-implementation-authorization.md
 *     Part 2.3 Operational Contract  U-O1…U-O7   (lines 120–126)
 *     Part 2.3 Preparation Contract  U-P1…U-P7   (lines 137–148)
 *     Part 8   ratified budgets — server composition ≤ 400 ms p75
 *   docs/platform/runtime/runtime-realization-engineering-specification.md  C-22 (default subject)
 *   docs/platform/runtime/stage-work-view-queue-canonical-model.md
 *     §1.4 one evaluator · §0.5.1 Row Grain is Stage-owned · §0.5.2 G9 · §6 D1 invariant
 *
 * ONE server answer. The dependent chain is in-process:
 *
 *   tenant/principal → authorization scope → Work Unit identity → Business Process
 *   → active Work View → Stage Membership → Operational Projection → bounded rows
 *   → Record of Attention → Record of Truth ids → Context Frame → current business state
 *   → truthful primary action → FocusPanelScopeState → terminal answer
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *   - It never calls QueueService. The lane predicate system is a status-only allowlist
 *     ({status_key, created_at, updated_at}); when status collapsed to {open, closed} it lost the
 *     vocabulary to express "lead" → LIFECYCLE_QUEUE_FILTERS_EMPTY, "the empty New Leads queue …
 *     it is the model". Because QueueService is not on this path, that error class is
 *     UNREACHABLE FROM HERE BY CONSTRUCTION — not by catching it.
 *   - It never reads `compat_queue_key` (a lane binding assigned by array position).
 *   - It returns NO Settlement: no counts, no KPI values, no activity, no communications, no
 *     related records, no history, no secondary cards, no secondary actions. The Preparation
 *     Contract is a hard boundary — "exactly this, nothing more".
 *
 * TERMINAL SEMANTICS (U-O6/U-O7): `operational` | `empty` | `error` are distinct outcomes.
 * `empty` is an authoritative, workable place. `error` is honest and is NEVER a false-empty.
 * Identity alone is not operational: without current business state AND a truthful primary
 * action the answer does not claim `operational`.
 */
import { canonicalLocationDisplay, resolveLocationById } from "@/lib/location/canonicalLocationProvider";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { resolveOpportunityLeadLocationFields } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    computeOperationalProjection,
    resolveFocusPanelScope,
    type OperationalProjectionRow,
} from "@/lib/lifecycle/operationalProjection";
import {
    savedWorkViewsFromDepartmentMetadata,
    findWorkViewById,
    firstVisibleWorkView,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { lensStageKeys } from "@/lib/lifecycle/lensStageKeys";
import { familyStageDestinationOperability } from "@/lib/runtime/provisioning/workViewDestinationOperability";
import { resolveTargetedWorkViewMember } from "@/lib/runtime/provisioning/targetedWorkViewMember";
// Type-only: erased at build time, so the reverse reference does NOT create an import cycle.
import type { ContextualFocusAnswer } from "@/lib/runtime/provisioning/contextualFocusAnswer";
import {
    loadSettlementLocators,
    resolveActiveWorkViewConfigLayer,
    resolveProvisioningPopulationWorkUnitId,
    SETTLEMENT_LOCATORS_UNAVAILABLE,
    type SettlementLocators,
} from "./settlementLocators";
import type { WorkViewCanonicalLocationWorkUnitRow } from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import {
    lifecycleBuilderFromDepartmentMetadata,
    activeLifecycleProcess,
    activeStagesForProcess,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";
import {
    resolveDefaultOperationalSubject,
    type DefaultOperationalSubjectStrategy,
    type OperationalSubjectQueueRow,
} from "@/lib/adminV2/runtime/operationalSubject/resolveDefaultOperationalSubject";
import { applyCanonicalWorkViewSort } from "./canonicalWorkViewSort";
import {
    resolveOperationalPresentation,
    resolveWorkUnitHeaderConfigFromRecords,
    operationalKpiSlotsFromHeaderConfig,
    listWorkUnitHeaderLayoutRecords,
    type OperationalPresentation,
} from "./operationalPresentation";
import { resolveQueueRowLayoutServer } from "@/lib/layout/runtime/queueRowLayoutServer";
import { attachEffectiveStagesFromMaintainedFacts } from "@/lib/process/definitions/enrollment/maintainedParticipantFacts";
import { attachActiveTourFactsFromMaintainedFacts } from "@/lib/tours/queue/attachActiveTourFactsToOpportunityRows";
import {
    effectiveParticipantStageKeysFromRow,
    resolveContextMissionStages,
} from "@/lib/process/engine/resolveContextMissionStages";
import { resolveQueueRowVariant } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import { applyQueueRowVariantGroupAndSortCriteria } from "@/lib/presentation/runtime/applyQueueRowVariantGroupAndSortCriteria";
import {
    normalizeGroupByCriteria,
    normalizeSortCriteria,
} from "@/lib/adminV2/settings/surfaces/queueRowVariantDisplayControls";
import { attachChildGrainWaitlistPlacement } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import type { ChildProvisioningRowWithPlacement } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import { attachChildGrainInquiryProgramFallback } from "@/lib/runtime/provisioning/attachChildGrainInquiryProgramFallback";
import type { DocumentActor } from "@/lib/documents/assertDocumentAccess";
import { attachChildGrainAvatar } from "@/lib/runtime/provisioning/attachChildGrainAvatar";
import {
    enrichOperationalProjectionRows,
    queueRowContextOf,
    type EnrichableProjectionRow,
} from "./operationalProjectionEnrichment";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import { queueRowSurfaceIdForDepartment } from "@/lib/presentation/runtime/workUnitSurfaceConfigFetch";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";
import { cachedConfigRead } from "./configReadCache";
import { loadRightRailActionsBundleServer } from "@/lib/workspace/loadRightRailActionsBundleServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { listOrgLayouts } from "@/lib/layout/entityLayoutsRepo";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import { isLayoutRuntimeReadPathEnabled } from "@/lib/layout/featureFlag";
import {
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import { resolvePublishedFocusPanelSummaryRecord } from "@/lib/adminV2/runtime/focusPanel/resolveFocusPanelSummaryVariant";
import {
    resolveSubjectGrain,
    type OperationalSubjectType,
} from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";
import {
    composeContextualFocusAnswer,
    contextualSubjectGrainFromEntityType,
} from "@/lib/runtime/provisioning/contextualFocusAnswer";
import type { ChildProvisioningRow } from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import { loadChildGrainMembersForLens } from "@/lib/runtime/provisioning/childGrainMembership";
import {
    loadWorkUnitProcessPopulation,
    PROCESS_POPULATION_CAP,
    PROCESS_POPULATION_SELECT,
} from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    resolveOpportunityStageWorkSlice,
    type OpportunityStageWorkSlice,
} from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import {
    childQueueRowContext,
    childSubjectIdentityTruthBindings,
    composeChildGrainSurface,
    type ChildPrimaryActionAbsence,
    type ChildSurfaceComposition,
} from "@/lib/runtime/provisioning/childGrainSurfaceComposition";
import { resolveChildGrainFocusPanelScope } from "@/lib/runtime/provisioning/childGrainScope";
import type { ChildParticipationIdentity } from "@/lib/lifecycle/childParticipationIdentity";
import { projectFocusPanelOperational } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection";
/*
 * The TYPE comes from the contract, never from the server-only implementation.
 *
 * `ProvisioningAnswer` is imported as a type by client components, and a type import from a
 * `server-only` module still pulls that module into the client graph — which took the whole Focus
 * Panel down with "Ecmascript file had an error" at `import "server-only"`. Neither typecheck graph
 * sees this; only a real render does.
 */
import type { FocusPanelOperationalProjection } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
import { attachOpportunityInquiryChildrenShell } from "@/lib/admin/opportunityEntityRecord";
/*
 * TYPE-ONLY, DELIBERATELY. The header KPI resolution runs the analytics authorization gate, which
 * reaches `next/headers`; this composer is reachable from a client component, so a VALUE import
 * here puts that module in the browser graph and the production build fails — which it did. The
 * implementation is injected by the route instead (`req.resolveHeaderKpis`), exactly as the drawer
 * route owns its producers for the same reason. A type import is erased at build.
 */
import type { WorkUnitHeaderKpiSeed } from "@/lib/runtime/provisioning/workUnitHeaderKpiResolution";

/** Mirrors WORK_UNIT_HEADER_KPI_JOIN_GRACE_MS; kept here so the composer imports no value from it. */
const WORK_UNIT_HEADER_KPI_JOIN_GRACE_MS = 150;
import { buildCommitCriticalOperationalContext } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";

/** U-P3: bounded to ONE page. The answer may never be unbounded. */
export const PROVISIONING_ROW_PAGE_CAP = 100;

export type ProvisioningTerminal = "operational" | "empty" | "error";

/**
 * Row Grain — Stage-owned (§0.5.1). NOT Record of Attention.
 * Bound to the Stage vocabulary itself, so a compatibility name (`case`, `candidate`) can never be
 * assigned here by accident: those live on the attention axis, not the grain axis.
 */
export type RowGrain = StageGrain;

export type ProvisioningRow = {
    /** Canonical identifier of the row's Record of Truth. */
    id: string;
    /** Stage Membership — the persisted durable process position this row holds. */
    stageKey: string | null;
    statusKey: string | null;
    updatedAt: string | null;
    /** Recognition fields — enough to recognise and select (U-O2). Nothing more. */
    title: string | null;
    /**
     * U-O2 — the resolved row context the canonical compact row renders from. Without it, U-P7's
     * rowSlots would describe geometry for data the answer never carried, and the renderer would have
     * to fetch it after commit: presentation gating truth, or a post-commit re-layout. Both forbidden.
     * Null only when enrichment is unavailable — the row still renders through honest fallbacks.
     */
    context: QueueRowContext | null;
    /** Placement waitlist projection (child Waitlist) — used for sort/group + compact fields. */
    _placement_waitlist_row?: unknown;
    placementCandidateId?: string | null;
};

/** U-O1 orientation: the active lens indicated among its lens set. Identity only — NO counts. */
export type LensSetEntry = { id: string; label: string; displayOrder: number };

export type CurrentBusinessState = {
    stageKey: string;
    stageLabel: string;
    /** Why this stage exists — the Situation half of Situation → Decision → Action. */
    purpose: string | null;
    /**
     * The required primary work at this stage — for THIS subject.
     *
     * Always present on a family answer: the family path refuses a stage with no reachable work. NULL
     * on a child answer whose effective stage is a FAMILY-segment stage, because the work configured
     * there belongs to the family, and naming it here would attribute the family's work to the child.
     * Null is the truthful value, not a missing one.
     */
    workTemplateKey: string | null;
    workTemplateLabel: string | null;
    required: boolean | null;
};

/** U-O5: capability, not decoration. */
export type TruthfulPrimaryAction = {
    actionRef: string;
    label: string;
    /** The work template this action discharges. */
    workTemplateKey: string;
};

export type FocusPanelScopeStateKind = "in_scope" | "no_active_view" | "out_of_scope";

/**
 * COMMIT-CRITICAL ACTIONS PROJECTION (B — Work Unit Actions Runtime). The resolved right-rail action
 * set for this Work Unit, from the SAME `/process`-published resolver Workspace consumes
 * (`loadRightRailActionsBundleServer` → `resolveActionsForContext`). Carried in the answer so the
 * count + identities + availability/order/placement commit WITH the surface — no Actions(0) flash, no
 * post-commit layout discovery. Each `ResolvedActionForClient` already encodes availability (it is
 * only present when applicable), order (resolver order), and placement (`display_style`). Degrades to
 * an empty projection on any resolver error — never fails the operational answer.
 */
export type WorkUnitActionsProjection = {
    count: number;
    actions: ResolvedActionForClient[];
    /**
     * Department used to resolve this action set. Baked at commit so Create Lead / execute
     * receive the same scope as the Actions control — Settlement must not be required to
     * discover it (Actions can render before Settlement fills the rail).
     */
    departmentId: string | null;
};

const EMPTY_ACTIONS_PROJECTION: WorkUnitActionsProjection = {
    count: 0,
    actions: [],
    departmentId: null,
};

/**
 * COMMIT-CRITICAL SUBJECT IDENTITY TRUTH (A — preparation completeness) — a GENERIC, domain-declared
 * bag of committed-subject truth bindings (`key → value`), carried in the answer so the committed panel
 * renders its identity-owning cards MEANINGFUL at commit, not blank reserved rectangles.
 *
 * PLATFORM/DOMAIN SEAM: this platform type is OPAQUE — the platform provisioning contract and the
 * platform work-mode builder forward this bag into `context.truth` WITHOUT knowing any specific key.
 * The DOMAIN composer (the opportunity answer builder in this file) declares WHICH keys it carries
 * (e.g. `person.primary_contact_name`, `_inquiry_children`); those Household/Children semantics live in
 * the domain, never in a platform type or a platform builder. A second surface declares its own
 * bindings the same way — with no change to any platform layer. Sourced entirely from data the composer
 * already resolved for the subject row (NO extra DB read); deeper detail remains Settlement.
 */
export type SubjectIdentityTruth = Record<string, unknown>;

/**
 * COMMIT-CRITICAL PUBLISHED SUMMARY COMPOSITION (A — the committed panel must present the PUBLISHED
 * Summary composition, not the code default). The applicable published Focus Panel Summary doc for
 * the committed scope, selected server-side by the ONE applicability resolver (P3-A) and carried in
 * the answer so the committed panel renders the published composition IMMEDIATELY — no async client
 * fetch stand-in, no default-doc first frame, no post-commit composition reflow. `doc: null` means
 * RESOLVED: nothing published applies, the code default IS the composition. A null projection means
 * unresolved (read failed) — the client degrades to its own fetch, never an operational failure.
 */
/**
 * The published Summary composition the answer carries, WITH its identity.
 *
 * `doc` is omitted when the client stated it already holds this exact published record — see
 * `summaryConfigHeldIds` on the request. Identity is the authoritative `entity_layouts` row
 * (`id` + `version`), never a hash of the document and never a version on its own: two different
 * published records can share a version number, and a scope that resolves a different record must
 * never be served another record's document.
 */
export type FocusPanelSummaryDocProjection = {
    id: string | null;
    version: number | null;
    doc?: LayoutDoc | null;
};

export type ProvisioningAnswer =
    | {
          terminal: "operational";
          /** U-P1 authorization + canonical identifiers. */
          orgId: string;
          workUnit: { id: string; key: string; name: string; departmentId: string | null };
          /** U-O1 Business Process identity required for orientation. */
          businessProcess: { key: string; name: string };
          /** U-P2 active lens + its set. */
          activeWorkView: { id: string; label: string };
          lensSet: LensSetEntry[];
          /** §0.5.1/§6 — explicit, Stage-owned. */
          rowGrain: RowGrain;
          /**
           * THE SUBJECT GRAIN, DERIVED ONCE (R2). `rowGrain` is the lifecycle vocabulary
           * (`family|child|…`); this is the Focus Panel's (`case|child|candidate`), resolved here by
           * {@link resolveSubjectGrain} so no downstream layer re-derives or hardcodes it. Before this
           * existed the panel builder hardcoded `grain:"case"` / `subject.type:"opportunity"` a few
           * modules away from an answer that already knew better.
           */
          subjectGrain: { grain: OperationalGrain; subjectType: OperationalSubjectType };
          /** U-P3 authoritative queue truth, canonical order, ONE bounded page. */
          rows: ProvisioningRow[];
          /** U-P4/U-O3 Record of Attention, from the SAME evaluated page. */
          recordOfAttention: {
              /** The Operational Subject = Record of Attention (never G-5's context.subject). */
              id: string;
              /** How it was chosen — the configured strategy, or the declared fallback. */
              strategy: DefaultOperationalSubjectStrategy;
              strategySource: "configured" | "declared_fallback";
          };
          /** Record of Truth identifiers required for composition (§0.5.2: may be broader than the row). */
          recordOfTruth: { entityType: string; id: string };
          /** Context Frame — the Work View the operator entered from. Never mutated by Runtime. */
          contextFrame: { workViewId: string; workViewLabel: string };
          focusPanelScopeState: FocusPanelScopeStateKind;
          /** When scope is out_of_scope — destination Work View for the Open-in affordance. */
          focusPanelOutOfView?: {
              destinationViewId: string | null;
              destinationViewLabel: string | null;
          } | null;
          currentBusinessState: CurrentBusinessState;
          /**
           * U-O5 — capability, not decoration.
           *
           * On a family answer keyed by raw shared stage alone: never null — identity alone is not
           * operational, so that path refuses (`no_truthful_primary_action`).
           *
           * When family Mission is derived from Effective Process Position onto a stage that
           * publishes work templates without a primary_action (typical child-segment stages),
           * MAY be null with `primaryActionAbsence` set — What's Next still projects from templates.
           *
           * MAY be null on a CHILD answer, and that is a rendered state rather than a degraded one.
           * Firefly's child-grain stages configure no primary action at all, and a child riding a
           * family-segment stage has none of its own either; refusing there would make a coherent
           * configuration unreachable. `primaryActionAbsence` says which of those is the case, so
           * "nothing is configured" never renders the same as "something failed".
           */
          primaryAction: TruthfulPrimaryAction | null;
          /** Why {@link primaryAction} is null. Null when an action IS present. */
          primaryActionAbsence?: ChildPrimaryActionAbsence | null;
          /**
           * The canonical four-part child identity, carried WHOLE (`docs/runtime/GRAIN-AUTHORITY-MAP.md`).
           * Present only on a child answer. Never collapsed into `recordOfAttention.id`: that field
           * carries the participation id because that is what the row IS, while the durable child,
           * the family context and any genuine legacy row remain separately nameable here.
           */
          childIdentity?: ChildParticipationIdentity | null;
          /**
           * COMMIT-CRITICAL FOCUS PANEL — the default subject's stage-work slice (Current Work
           * runtime: progress, requirements completion, blocked/status, published stage inputs, work
           * intent). The answer OWNS this operational projection: the Current Work widget is a renderer
           * of THIS, so the first meaningful operator action is possible from the provisioning answer
           * ALONE. The drawer VM only ENRICHES the surrounding cards (household, contacts, activity,
           * documents) — Settlement — and never creates the operational Current Work. Null only when
           * unresolved (degrades to the drawer-VM load; never an operational failure).
           */
          focusPanelStageWork: OpportunityStageWorkSlice | null;
          /**
           * THE OPERATIONAL PROJECTIONS, DECIDED HERE.
           *
           * Business Process and Current Work used to be projected in the browser from
           * `focusPanelStageWork.published_stage_inputs`, which is why that ~78KB of configuration —
           * measured byte-identical between consecutive subject selections — had to travel at all.
           * The server runs the same canonical owners now and sends what it decided.
           *
           * Null when there is no operational subject to project for.
           */
          focusPanelOperationalProjection: FocusPanelOperationalProjection | null;
          /** A — commit-critical subject identity truth bindings, domain-declared + opaque to the platform (see {@link SubjectIdentityTruth}). */
          subjectIdentityTruth: SubjectIdentityTruth | null;
          /** Configured lifecycle rail, computed server-side by the canonical pure builder. */
          businessProcessStages?: ReadonlyArray<{ key: string; label: string; support?: readonly string[] }>;
          /** Configured process name ("Enrollment"), not the generic card title. */
          businessProcessName?: string | null;
      /**
       * THE AUTHORITATIVE PARTICIPATION, resolved once on the server and carried to the browser.
       *
       * IDENTITY, NOT PERMISSION. It is the member id and the OCM row that names it, and nothing else —
       * no profile, no photo, no health facts, no authorization answer. Every producer that consumes it
       * still resolves its own grants at request time.
       *
       * It exists because the server already knew this and the browser did not. Measured on deployed
       * 41c67ec17: the document's producers ran Attendance (141ms) and Health (470ms) and put their
       * answers in `operationalProjection`, but the browser decides card readiness from its OWN context,
       * which had no participantScope — so those cards stayed reserved and remounted only when the
       * drawer settled, ~3.5s later, to learn what the answer already carried.
       */
      resolvedParticipant?: { participationId: string; customerMemberId: string } | null;
          /** A — the published Summary composition for the committed scope (see {@link FocusPanelSummaryDocProjection}). */
          focusPanelSummaryDoc: FocusPanelSummaryDocProjection | null;
          /**
           * U-P7 — the RESOLVED operational presentation composition, sufficient to render
           * U-O1…U-O5 in FINAL layout with no further configuration request. Identifiers survive
           * inside `provenance` as evidence; they are never the only renderable output.
           */
          presentation: OperationalPresentation;
          /**
           * D5 — SETTLEMENT-ONLY locators. Server-resolved locations Settlement uses to fill the
           * reserved Work View counts, queue total, and right rail AFTER commit. The operational
           * renderer never reads this; a `status: "unavailable"` here never makes the surface non-operational.
           */
          settlement: SettlementLocators;
          /** B — resolved right-rail Actions, committed WITH the surface (count at commit, no flash). */
          actionsProjection: WorkUnitActionsProjection;
          /**
           * Header KPI values resolved during THIS composition, or null when they did not land
           * inside the join grace. Null means "resolve as before" — never zero, never stale. The
           * seed states the scope it was resolved for; a client on a different scope ignores it.
           */
          headerKpis: WorkUnitHeaderKpiSeed | null;
          timings: ProvisioningTimings;
      }
    | {
          terminal: "empty";
          orgId: string;
          workUnit: { id: string; key: string; name: string };
          businessProcess: { key: string; name: string };
          activeWorkView: { id: string; label: string };
          lensSet: LensSetEntry[];
          rowGrain: RowGrain;
          /**
           * Present on the EMPTY terminal too, and that is the point: an authoritatively-empty child lens
           * must still be able to say it was a CHILD lens that found nobody. Without it, "empty" carries no
           * evidence of which provider ran, and provider-absence becomes indistinguishable from no-matches.
           */
          subjectGrain: { grain: OperationalGrain; subjectType: OperationalSubjectType };
          rows: [];
          /** U-O6: an empty lens has no subject to commit; lens switching stays reachable. */
          recordOfAttention: null;
          contextFrame: { workViewId: string; workViewLabel: string };
          focusPanelScopeState: FocusPanelScopeStateKind;
          focusPanelOutOfView?: null;
          presentation: OperationalPresentation;
          /** D5 — Settlement-only locators (see the operational variant). */
          settlement: SettlementLocators;
          /** B — resolved right-rail Actions, committed WITH the surface (see the operational variant). */
          actionsProjection: WorkUnitActionsProjection;
          timings: ProvisioningTimings;
      }
    | {
          terminal: "error";
          /** U-O7: honest, never a false-empty. Carries a reachable retry at the surface. */
          code: ProvisioningErrorCode;
          message: string;
          orgId: string | null;
          workUnit: { id: string; key: string; name: string } | null;
          /**
           * HONEST, NOT FATAL. The navigational frame the answer had ALREADY resolved when it refused.
           *
           * Measured defect this repairs: Firefly publishes a Work View ("Active Pipeline") whose stages
           * span two Row Grains, so law G-1 refuses it — correctly. But the error terminal dropped the
           * lens set, so the surface rendered a raw internal sentence with NO pill strip, no counts and
           * no retry; with the sidebar collapsed (its default) the operator had no in-surface way to
           * reach a working Work View. A refusal must not also remove the way out.
           *
           * `null` when the failure happened BEFORE lenses were resolved (unauthorized, work unit not
           * found, no business process, no active view) — there is genuinely no frame to offer, and
           * inventing one would be a false affordance.
           */
          navigationFrame: {
              lensSet: LensSetEntry[];
              activeWorkView: { id: string; label: string };
          } | null;
          /**
           * THE COHORT THIS REFUSAL DID NOT INVALIDATE.
           *
           * `navigationFrame` above exists because "a refusal must not also remove the way out" — it
           * carries the lens set the answer had already resolved. This is the same sentence one level
           * deeper, and it repairs the half that was left: the lens set survived a refusal and the
           * ROWS did not, so a subject that could not compose unmounted a queue that was never in
           * question. Measured on Firefly: the same Work Unit and Work View answered `operational`
           * with seven rows, and `error` with zero, on nothing but the addition of a `subject_id`.
           *
           * Present ONLY for refusals raised after the cohort resolved — the six subject-level sites.
           * `null`/absent for everything before it (`unauthorized`, `work_unit_not_found`,
           * `no_business_process`, `no_active_view`, `grain_ambiguous`, `grain_unsupported`,
           * `records_unavailable`), where there is genuinely no cohort and inventing one would be the
           * false affordance this field exists to prevent.
           *
           * The terminal stays `error`. This does not soften the refusal — the subject truly cannot
           * compose, and the Focus Panel is the owner that says so. It only stops the refusal from
           * being charged to the Work View.
           */
          queueFrame?: {
              rows: ProvisioningRow[];
              rowGrain: RowGrain;
              subjectGrain: { grain: OperationalGrain; subjectType: OperationalSubjectType };
              presentation: OperationalPresentation;
              businessProcess: { key: string; name: string };
              actionsProjection: WorkUnitActionsProjection;
              /** The subject the caller named, so the queue can keep it selected while it refuses. */
              requestedSubjectId: string | null;
          } | null;
          timings: ProvisioningTimings;
      }
    /**
     * CONTEXTUAL FOCUS — the operator named a RECORD, not a cohort.
     *
     * A distinct terminal rather than an `operational` answer with nullable fields, because every one
     * of `activeWorkView` / `rowGrain` / `rows` / `recordOfAttention` / `contextFrame` would have to
     * become optional to express it — and each `?` is a place a consumer can forget to check and
     * silently fall back to a default lens. That fallback IS the defect: today
     * `findWorkViewById(...) ?? firstVisibleWorkView(...)` makes "no lens requested" identical to
     * "the first lens", which is why `Kelly → Household` shows `New` as selected.
     *
     * Nothing here failed. The operator asked for a person and got a person.
     *
     * The shape is owned by `contextualFocusAnswer.ts` and is proven independently there; this
     * membership is what forces every consumer to decide, via exhaustiveness, what it renders when no
     * cohort is selected.
     */
    | ContextualFocusAnswer;

export type ProvisioningErrorCode =
    | "unauthorized"
    | "work_unit_not_found"
    | "no_business_process"
    | "no_active_view"
    | "grain_ambiguous"
    /** The lens resolved ONE grain, but it has no Focus Panel subject (`person`/`account`/`work_item`). */
    | "grain_unsupported"
    | "subject_unavailable"
    | "no_truthful_primary_action"
    | "records_unavailable";

/**
 * WHAT KIND of problem this is — the distinction the surface needs and the codes already imply.
 *
 * Before this existed, no renderer read `code` at all, so a tenant CONFIGURATION problem and a missing
 * RECORD produced a visually identical dead surface. They call for different operator responses:
 * configuration is someone's job to fix, a missing subject is not.
 *
 * Derived, never stored — one pure total function over the code union, so it cannot drift and adds no
 * coordinator.
 */
export type ProvisioningErrorKind = "authorization" | "configuration" | "subject" | "records";

export function provisioningErrorKind(code: ProvisioningErrorCode): ProvisioningErrorKind {
    switch (code) {
        case "unauthorized":
            return "authorization";
        // The tenant's configuration is invalid or absent — the surface cannot be composed until it changes.
        case "work_unit_not_found":
        case "no_business_process":
        case "no_active_view":
        case "grain_ambiguous":
        case "grain_unsupported":
        case "no_truthful_primary_action":
            return "configuration";
        // Configuration is sound; the requested subject is not present.
        case "subject_unavailable":
            return "subject";
        // The read itself failed — transient, and the only kind a retry can plausibly fix.
        case "records_unavailable":
            return "records";
    }
}

/** Internal dependency timings — D1 must MEASURE the chain, not assume it (Part 8). */
export type ProvisioningTimings = {
    authorization_ms: number;
    work_unit_ms: number;
    configuration_ms: number;
    /** U-P7 operational presentation resolution — inside the one answer, never a client round-trip. */
    presentation_ms: number;
    records_ms: number;
    projection_ms: number;
    composition_ms: number;
    total_ms: number;
    /**
     * DIAGNOSTIC SUB-SPANS inside composition. `composition_ms` measured 8.1s of a 9.9s answer and
     * named nothing within it, which is not actionable — the same way an aggregate auth number
     * concealed a 100%-miss JWKS cache until it was split into phases. Optional; no consumer breaks.
     */
    spans?: Record<string, number>;
};

const now = () => performance.now();

export type ProvisioningRequest = {
    supabase: SupabaseClient;
    /** U-P1 — resolved ONCE by the caller's route gate; never re-resolved inside. */
    orgId: string;
    currentUserId?: string | null;
    /**
     * Actor for DOCUMENT authorization. Profile photos are documents whose URLs are minted per
     * actor per request (~300s) and never persisted. Optional: an answer composed without one is
     * still valid — its rows simply carry no avatar and present initials.
     */
    documentActor?: DocumentActor | null;
    /*
     * INJECTED BY THE ROUTE. Resolves the header KPI values for the published key set during this
     * composition. Injected rather than imported because its authorization gate reaches
     * `next/headers` and this module is in a client-reachable graph. Absent (any non-route caller)
     * simply means the client resolves them as before.
     */
    /**
     * EARLY SUBJECT NOTIFICATION — the route starts its own subject-scoped reads sooner.
     *
     * `composeProvisioningAnswerForRoute` has exactly three serial awaits: route identity (~170ms),
     * this composition (~742ms), then the card producers (~858ms). Measured on deployed d1b8f1319
     * those sum to the 2,022ms document wall, and nothing the operator can read crosses the wire
     * until the last of them finishes — even though the response itself opens at ~32ms.
     *
     * The producers' own participant read only needs the SUBJECT, which is resolved here, before
     * the ~616ms children shell runs. Announcing it lets the route overlap that read with the rest
     * of composition instead of queueing it behind the whole answer.
     *
     * Announcement only: no value is returned into composition, so the answer cannot come to depend
     * on route-side work and the two cannot deadlock. A throwing listener must never fail the
     * document, so the call site swallows.
     */
    onSubjectResolved?: (args: { subjectId: string; orgId: string }) => void;
    resolveHeaderKpis?: (args: {
        workUnitId: string;
        kpiSlots: ReadonlyArray<{ sourceKey?: string | null }>;
    }) => Promise<WorkUnitHeaderKpiSeed | null>;
    /**
     * The actor's mutate access, resolved ONCE by the caller's route gate.
     *
     * The operational projections read `capabilities.canMutate` — an outcome cannot be completed
     * without edit access — so the server needs the same verdict the browser used to reach. It is
     * the gate's `hasPortalAdminMutateAccess(roleKeys)`, which is exactly what `useAdminAuth`
     * computes client-side, and it is resolved here rather than re-derived so the two cannot drift.
     *
     * Optional and defaulting to `false`: a caller that cannot state the actor's access gets the
     * read-only projection, which is the safe direction to be wrong in.
     */
    canMutate?: boolean;
    workUnitSlug: string;
    /** Attention is an INPUT, never derived from the route inside this resource (K1 owns intent). */
    requestedWorkViewId?: string | null;
    requestedSubjectId?: string | null;
    /**
     * WHAT THE OPERATOR ASKED FOR — a cohort, or a record.
     *
     * `contextual_focus` is stated EXPLICITLY and is never inferred from `requestedWorkViewId == null`.
     * That absence already has a meaning here — "no lens named, resolve the configured default" — and
     * it is the meaning every cold entry and every Workspace link relies on. Overloading it would make
     * "open this Work Unit" and "open this record" the same request, which is the defect restated: the
     * runtime could not tell them apart, so it answered both with the first Work View.
     *
     * Omitted = `operational`. Every existing caller keeps its exact behaviour.
     */
    mode?: "operational" | "contextual_focus";
    /**
     * Contextual only — the entity CLASS of `requestedSubjectId`, as the producer named it. Resolved
     * into the panel's subject grain by `contextualSubjectGrainFromEntityType`; a class with no Focus
     * Panel representation is refused rather than composed as a family.
     */
    requestedSubjectEntityType?: string | null;
    /** Contextual only — the card + row inside the panel (the kernel's ASPECT). */
    requestedAspect?: { cardKey: string; itemId: string | null } | null;
    /**
     * S6-1 — the CLIENT states it already holds this department's published configuration.
     *
     * A claim, not permission: only this composer knows whether a pinned revision makes this
     * subject's department metadata differ from the live record the client holds.
     */
    departmentConfigHeldIds?: readonly string[];
    /** S5-3 — published Summary records the CLIENT states it already holds, as `id:version`. */
    summaryConfigHeldIds?: readonly string[];
};

/**
 * U-P4 — the configured Default Operational Subject Strategy.
 *
 * Configuration declares; the Entry Resource resolves; K2 delivers (C-22). No configuration layer
 * for this exists yet — `resolveDefaultOperationalSubjectStrategyForWorkUnit` is a hardcoded stub
 * with no production callers. The Authorization is explicit that `first_row` is **the declared
 * fallback, not the hardcoded behaviour**, so we read the authored field when present and fall back
 * to `first_row` otherwise. We do NOT fabricate a strategy.
 */
function resolveSubjectStrategy(view: WorkViewConfigV1Stored): {
    strategy: DefaultOperationalSubjectStrategy;
    source: "configured" | "declared_fallback";
} {
    const configured = (view as { default_subject_strategy_v1?: unknown }).default_subject_strategy_v1;
    if (typeof configured === "string") {
        return { strategy: configured as DefaultOperationalSubjectStrategy, source: "configured" };
    }
    return { strategy: "first_row", source: "declared_fallback" };
}

/**
 * §0.5.1/§6 — Row Grain is explicit and Stage-owned.
 *
 * The lens scopes stages through its predicates; those stages' `grain` IS the lens's Row Grain.
 * A lens whose stages disagree on grain is grain-ambiguous — invalid configuration, refused at
 * runtime with an honest error (G-1: "a surface cannot be grain-ambiguous"). This is NOT grain
 * equality with Record of Attention: `case`/`candidate` are attention/compat identifiers and never
 * participate in this comparison.
 */
/**
 * The stage keys a lens filters on — now owned by `@/lib/lifecycle/lensStageKeys` and re-exported here.
 *
 * It moved because the COUNT path needs the identical reading, and a counting module cannot import this
 * answer without a cycle. Re-deriving it there would have been a second definition of what a lens
 * selects — the precise shape of the 13-rows-under-a-pill-of-8 defect.
 */
export { lensStageKeys };

/**
 * Row Grain: DECLARED if the lens declares one, otherwise DERIVED from the stages it filters on.
 *
 * Derivation is authoritative for a stage-scoped lens and stays exactly as it was. What it cannot do is
 * serve a lens that has no stage predicate on purpose — there the derivation has nothing to read, treats
 * "no predicate" as "all stages", and in a process with both family and child stages refuses a perfectly
 * coherent lens as grain-ambiguous.
 *
 * G-1 is intact. A declared lens is unambiguous BY DECLARATION; nothing about multi-grain lenses is
 * relaxed, and an undeclared ambiguous lens still refuses. A declaration that contradicts the lens's own
 * stage predicate is refused too — that is a configuration lie, and honouring it would reintroduce the
 * wrong-subject substitution from the other direction.
 */
export function resolveLensRowGrain(
    view: WorkViewConfigV1Stored,
    stages: readonly LifecycleBuilderStageRecord[],
): { ok: true; grain: RowGrain } | { ok: false; reason: string } {
    const stageKeys = lensStageKeys(view);

    const scoped = stageKeys.length
        ? stages.filter((s) => stageKeys.includes(s.key))
        : stages; // stage-independent: read every stage's grain only to CHECK a declaration against it

    const grains = [...new Set(scoped.map((s) => s.grain).filter((g): g is StageGrain => !!g))];

    const declared = view.row_grain_v1;
    if (declared) {
        if (stageKeys.length && grains.length && !grains.includes(declared)) {
            return {
                ok: false,
                reason: `lens declares Row Grain "${declared}" but the stages it filters on are ${grains.join(", ")} — the declaration contradicts the lens`,
            };
        }
        return { ok: true, grain: declared };
    }

    // Stage-independent (catch-all / inventory) with no declaration: the process population base is
    // family opportunities. Child inventory lenses MUST declare `row_grain_v1: "child"` (All Children).
    // Undeclared stage-scoped multi-grain lenses still refuse below (G-1).
    if (stageKeys.length === 0) {
        return { ok: true, grain: "family" };
    }

    if (grains.length === 1) return { ok: true, grain: grains[0] };
    if (grains.length === 0) return { ok: false, reason: "no stage in this lens declares a Row Grain" };
    return {
        ok: false,
        reason: `lens spans ${grains.length} Row Grains (${grains.join(", ")}) — a surface cannot be grain-ambiguous`,
    };
}

/** THE BOUNDED PROVISIONING ANSWER. */
export async function composeWorkUnitProvisioningAnswer(
    req: ProvisioningRequest,
): Promise<ProvisioningAnswer> {
    const t0 = now();
    const timings: ProvisioningTimings = {
        authorization_ms: 0, work_unit_ms: 0, configuration_ms: 0, presentation_ms: 0,
        records_ms: 0, projection_ms: 0, composition_ms: 0, total_ms: 0,
    };
    /** Diagnostic only — how long one named step inside composition took. */
    const spans: Record<string, number> = {};
    const markSpan = (name: string, startedAt: number) => { spans[name] = Math.round(now() - startedAt); };
    // A refusal carries whatever navigational frame was ALREADY resolved when it happened, so the
    // operator keeps a way out. `frame` is threaded explicitly rather than captured from an outer
    // mutable: the lens set does not exist for the early failures, and a closure would silently offer
    // a stale or empty frame instead of an honest `null`.
    const fail = (
        code: ProvisioningErrorCode,
        message: string,
        wu: ProvisioningAnswer extends never ? never : { id: string; key: string; name: string } | null = null,
        frame: { lensSet: LensSetEntry[]; activeWorkView: { id: string; label: string } } | null = null,
    ): ProvisioningAnswer => {
        timings.total_ms = now() - t0;
        return {
            terminal: "error",
            code,
            message,
            orgId: req.orgId ?? null,
            workUnit: wu,
            navigationFrame: frame,
            timings,
        };
    };

    // ── U-P1: authorization + scope resolved ONCE, by the caller's gate. Not re-resolved here. ──
    timings.authorization_ms = now() - t0;
    if (!req.orgId) return fail("unauthorized", "no tenant scope");

    // ── Work Unit identity + its department, in ONE round trip. ──
    const tWu = now();
    // The ROUTE SLUG is hyphenated ("new-leads"); the platform KEY is underscored ("new_leads").
    // `workUnitRouteSlugToKey` is the canonical mapping — a raw slug lookup matches nothing and
    // turns every Work Unit into a terminal error.
    const workUnitKey = workUnitRouteSlugToKey(req.workUnitSlug.trim());
    // Work-unit identity is CONFIG (rows change only on admin edit). Cache the successful row
    // tenant-keyed; a transport error throws so the cache evicts (never caches a failure) and the
    // `.then` maps it back to the same honest `fail(...)` the raw read produced.
    const wuLookup = await cachedConfigRead(`wu:${req.orgId}:${workUnitKey || req.workUnitSlug}`, async () => {
        const { data, error } = await req.supabase
            .from("work_units")
            .select("id, key, name, org_id, department_id, queue_definition, metadata")
            .eq("org_id", req.orgId)
            .eq("key", workUnitKey || req.workUnitSlug)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
    }).then(
        (row) => ({ row, error: null as string | null }),
        (e: unknown) => ({ row: null, error: e instanceof Error ? e.message : String(e) }),
    );
    timings.work_unit_ms = now() - tWu;
    if (wuLookup.error) return fail("records_unavailable", `work unit lookup failed: ${wuLookup.error}`);
    const wuRow = wuLookup.row;
    if (!wuRow) return fail("work_unit_not_found", `no work unit "${req.workUnitSlug}" in this tenant`);
    const workUnit = {
        id: String(wuRow.id),
        key: String(wuRow.key),
        name: String(wuRow.name),
        // Carried so the client can seed the stage-work cache with a key that matches the drawer VM's
        // (org/opp/dept/stage) — reusing the answer's `focusPanelStageWork` instead of re-fetching it.
        departmentId: wuRow.department_id ? String(wuRow.department_id) : null,
    };

    // ── COLD-PATH PARALLELISM: kick a surface-scoped population read so it overlaps configuration.
    //    After Settlement locators resolve, rows MUST use the active lens's COUNT host when that host
    //    differs from the surface slug (Waitlist shell → All/Tours family lenses). In that case this
    //    early read is discarded and replaced below — still one atomic answer.
    //
    // THE POPULATION IS SHARED WITH THE COUNT PATH. Counts already evaluate on `hostWorkUnitId`;
    // Operational Commit must project the same population or pills and rows diverge.
    const recordsPromise = (async () =>
        req.supabase
            .from("opportunities")
            .select(PROCESS_POPULATION_SELECT)
            .eq("org_id", req.orgId)
            .eq("work_unit_id", workUnit.id)
            .limit(PROCESS_POPULATION_CAP))();

    // ── Configuration: Business Process, stages, lenses. ONE fetch. ──
    const tCfg = now();
    // The department config AND its work units in ONE parallel round trip. The units are Settlement-only
    // (they resolve canonical count locations, D5); fetching them alongside the config adds no latency,
    // and a failure here degrades Settlement to `unavailable` without ever failing the operational answer.
    // Department config + its work units are CONFIG — cache tenant+department-keyed. The `departments`
    // error still fails the answer (throw → cache evicts → `.then` maps to the same `fail`); the
    // Settlement-only work-unit list degrades to `[]` on its own error exactly as before, and that
    // (empty, non-throwing) result is cacheable.
    const deptConfig = await cachedConfigRead(`dept:${req.orgId}:${String(wuRow.department_id)}`, async () => {
        const [deptResult, deptWorkUnitsResult] = await Promise.all([
            req.supabase.from("departments").select("id, metadata").eq("id", wuRow.department_id).maybeSingle(),
            req.supabase
                .from("work_units")
                .select("id, key, name, department_id, is_active, sort_order, queue_definition, metadata")
                .eq("org_id", req.orgId)
                .eq("department_id", wuRow.department_id),
        ]);
        if (deptResult.error) throw new Error(deptResult.error.message);
        return {
            deptRow: deptResult.data,
            deptWorkUnits: (deptWorkUnitsResult.error ? [] : deptWorkUnitsResult.data ?? []) as WorkViewCanonicalLocationWorkUnitRow[],
        };
    }).then(
        (v) => ({ ...v, error: null as string | null }),
        (e: unknown) => ({
            deptRow: null as { id: unknown; metadata: unknown } | null,
            deptWorkUnits: [] as WorkViewCanonicalLocationWorkUnitRow[],
            error: e instanceof Error ? e.message : String(e),
        }),
    );
    if (deptConfig.error) return fail("records_unavailable", `configuration lookup failed: ${deptConfig.error}`, workUnit);
    const deptRow = deptConfig.deptRow;
    // Settlement-only: never gates commit. A fetch error above just yields no units → `unavailable`.
    const deptWorkUnits = deptConfig.deptWorkUnits;

    const builder = lifecycleBuilderFromDepartmentMetadata(deptRow?.metadata);
    const process = activeLifecycleProcess(builder);
    if (!process) return fail("no_business_process", "no active Business Process configured", workUnit);
    const stages = activeStagesForProcess(process);
    const workViews = savedWorkViewsFromDepartmentMetadata(deptRow?.metadata);

    const lensSet: LensSetEntry[] = workViews.map((v, i) => ({
        id: v.id,
        label: v.label,
        displayOrder: v.display_order ?? i,
    }));

    // ── CONTEXTUAL FOCUS — resolved HERE, before any lens resolution. ────────────────────────────
    //
    //    The position of this branch is the whole point. One line below, `findWorkViewById(...) ??
    //    firstVisibleWorkView(...)` turns "no lens named" into "the first lens", and every field after
    //    it is derived from that choice. A contextual request that fell through to it could not be
    //    rescued afterwards — by then the answer would already be about a cohort, and un-choosing a
    //    lens downstream is exactly the kind of after-the-fact correction that leaves a lit pill
    //    somewhere. So it never reaches it.
    //
    //    The lens set IS carried: the operator must still be able to pick a cohort next. Offering the
    //    choice is not making it.
    //
    //    No membership check. A contextual answer selects a HOST RECORD, not a cohort member, so
    //    `subject_unavailable` — which asks "is this row in this lens?" — has no question to ask. That
    //    is also why nothing here consults the capped population: asking whether the subject appears in
    //    a page of ≤N rows would answer membership by pagination, and there is no membership to answer.
    if (req.mode === "contextual_focus") {
        timings.configuration_ms = now() - tCfg;
        const subjectId = (req.requestedSubjectId ?? "").trim();
        if (!subjectId) {
            return fail(
                "subject_unavailable",
                "contextual focus was requested without a subject",
                workUnit,
                null,
            );
        }
        // THE SUBJECT'S CLASS — declared by the producer when it knows, VERIFIED otherwise.
        //
        // A Work Unit hosts opportunities: `opportunities.work_unit_id = <this unit>` is its entire
        // population. So a contextual subject on this host is an opportunity — a fact about the host,
        // not a fallback. It is still confirmed by an EXACT single-row read rather than assumed, so an
        // id that is not one refuses instead of composing someone else's panel as a family.
        //
        // Exact-id, org-scoped. Deliberately NOT scoped to `work_unit_id`: that would be a membership
        // question, and a contextual answer selects a host record rather than a cohort member.
        let entityType = (req.requestedSubjectEntityType ?? "").trim();
        if (!entityType) {
            const tSubject = now();
            const probe = await req.supabase
                .from("opportunities")
                .select("id")
                .eq("org_id", req.orgId)
                .eq("id", subjectId)
                .maybeSingle();
            timings.records_ms = now() - tSubject;
            if (probe.error) {
                return fail("records_unavailable", `contextual subject lookup failed: ${probe.error.message}`, workUnit, null);
            }
            if (!probe.data) {
                return fail("subject_unavailable", `no record "${subjectId}" in this tenant`, workUnit, null);
            }
            entityType = "opportunity";
        }
        const grain = contextualSubjectGrainFromEntityType(entityType);
        if (!grain.ok) {
            return fail("grain_unsupported", grain.reason, workUnit, null);
        }
        const contextual = composeContextualFocusAnswer({
            orgId: req.orgId,
            workUnit,
            businessProcess: { key: process.key, name: process.name },
            lensSet,
            // The record the panel composes against. For a family case this is the same record as the
            // subject — the case IS what the operator named — and the two fields stay separate because
            // at child grain they are not (PR #429: the participation is the subject, the case is the
            // host).
            recordOfTruth: { entityType, id: subjectId },
            subject: { id: subjectId, grain: grain.grain, subjectType: grain.subjectType },
            aspect: req.requestedAspect ?? null,
            startedAt: t0,
            now,
        });
        if (!contextual.ok) {
            // The composer refuses rather than degrades; its refusal is a configuration-class problem
            // with the request, not a missing record.
            return fail("subject_unavailable", contextual.reason, workUnit, null);
        }
        return contextual.answer;
    }

    // U-P2: active lens. Attention is an input (K1 owns intent); the route never derives it here.
    //
    // The `?? firstVisibleWorkView` fallback below is CORRECT for an operational request — "open this
    // Work Unit" genuinely means "show me its default cohort". What it must never see is a request
    // that named a record, which is why contextual focus is answered above and never arrives here.
    const activeView =
        findWorkViewById(workViews, req.requestedWorkViewId) ?? firstVisibleWorkView(workViews);
    timings.configuration_ms = now() - tCfg;
    if (!activeView) {
        // No lens at all is not an error — it is an honest, nameable scope state.
        return fail("no_active_view", "no Work View is configured for this Business Process", workUnit);
    }
    const contextFrame = { workViewId: activeView.id, workViewLabel: activeView.label };
    /**
     * From here on, a refusal can still tell the operator where else to go. Every `fail(...)` below
     * this line passes it; every one above genuinely cannot (no lenses resolved yet).
     */
    const navFrame = { lensSet, activeWorkView: { id: activeView.id, label: activeView.label } };

    // ── D5 SETTLEMENT LOCATORS — server-resolved, additive, Settlement-only. ──
    // The units are already in hand (parallel fetch above), so this is a PURE resolution: no extra
    // round trip, no I/O on the commit path. It cannot fail the answer — `loadSettlementLocators`
    // swallows every error into `unavailable`. The operational renderer never reads this field.
    const settlement: SettlementLocators = wuRow.department_id
        ? await loadSettlementLocators({
              supabase: req.supabase,
              orgId: req.orgId,
              departmentId: String(wuRow.department_id),
              workViews,
              activeWorkViewId: activeView.id,
              surfaceWorkUnitId: workUnit.id,
              deptWorkUnits,
          })
        : SETTLEMENT_LOCATORS_UNAVAILABLE;
    // Rows + child membership follow the active lens's Settlement count host when it differs from the
    // surface slug. Shell identity (`workUnit`) stays the open unit so pill LENS switches do not remount.
    const populationWorkUnitId = resolveProvisioningPopulationWorkUnitId({
        surfaceWorkUnitId: workUnit.id,
        settlement,
    });
    /*
     * PRESENTATION FOLLOWS THE ACTIVE WORK VIEW, NOT THE ROUTE.
     *
     * Membership already follows the active lens's canonical host (`populationWorkUnitId` above). The
     * lens's CONFIGURATION did not: the placement layer was read from the surface unit's metadata, so
     * selecting Waitlist while standing on All produced the right 17 rows with All's affordances —
     * correct membership, wrong presentation. Placement is configured on the unit that HOSTS the lens
     * (measured on this tenant: exactly one unit carries `placement_priority_v1`), so reading the
     * surface unit's layer asked the wrong object and fail-open silently dropped Adjust, the rank
     * cluster and the precedence copy.
     *
     * This resolves the host unit's own row and hands its configuration to the concerns below. It
     * names no lens and inspects no row contents: any Work View whose host enables a profile gets its
     * affordances, on whatever route the operator happens to be standing.
     */
    const activeViewConfigLayer = resolveActiveWorkViewConfigLayer({
        surfaceWorkUnitId: workUnit.id,
        populationWorkUnitId,
        surfaceMetadata: (wuRow as { metadata?: unknown }).metadata ?? null,
        deptWorkUnits,
    });
    const populationWorkUnitMetadata = activeViewConfigLayer.metadata;

    // ── U-P7: resolve the operational presentation composition server-side, into THIS answer. ──
    // An identifier would be the round-trip U-P7 exists to remove; resolving here means the first
    // visible frame is already in final layout and nothing re-lays out after commit.
    // COLD-PATH PARALLELISM: the presentation composition (header + queue-row surface) is INDEPENDENT of
    // records / projection / enrichment — those never read `presentation`; the two branches join only at
    // answer assembly. Kick presentation off here so it runs CONCURRENTLY with the record projection +
    // enrichment branch below, and await it at the join. Still ONE atomic answer — internal read reordering.
    const tPres = now();
    const queueRowSurfaceId = queueRowSurfaceIdForDepartment(String(wuRow.department_id), deptRow?.metadata);
    /*
     * THE HEADER CONFIG READ, SPLIT OUT — ONE read, two consumers.
     *
     * It used to sit inside the presentation branch beside the queue-row layout read. Both run
     * concurrently, but the queue-row read is the dominant cost (~700ms vs ~335ms) and the branch
     * only resolves once BOTH have landed and composed. The KPI resolve chained off that, so it
     * began ~1,000ms into composition, finished ~2,400-3,000ms, and missed the document's join at
     * ~2,300-2,700ms — measured on #1091, binding in only 1 of 8 samples.
     *
     * Splitting it lets the KPI start when the header config alone is ready. This is the SAME read
     * — `presentationPromise` awaits this promise rather than issuing its own — so the config read
     * count is unchanged at one, and the derivation both consumers apply is the same exported
     * function, so their key sets cannot diverge.
     */
    const tHeaderConfig = now();
    const headerLayoutRecordsPromise = cachedConfigRead(`hdr:${req.orgId}:`, () =>
        listWorkUnitHeaderLayoutRecords(req.supabase, req.orgId),
    )
        .then((r) => {
            markSpan("header_config_ready_ms", tHeaderConfig);
            return r;
        })
        .catch(() => null);
    void headerLayoutRecordsPromise.catch(() => {});

    const presentationPromise = (async () => {
        // The queue-row layout and the header layout are INDEPENDENT DB reads — fetch them concurrently,
        // then compose (compose is in-memory). Collapses the two sequential ~700ms + ~335ms reads into one.
        // Both are PUBLISHED CONFIG (queue-row surface layout + org header layout), re-read on every
        // answer though they change only on an admin publish. Cache them tenant-keyed with a short TTL
        // so a navigation burst / warm re-visit collapses to one read each. This is the presentation
        // branch's dominant cost (~700ms + ~335ms). Live records are NEVER cached.
        const [rowLayout, headerLayoutRecords] = await Promise.all([
            cachedConfigRead(`qrl:${req.orgId}:${queueRowSurfaceId}:${process.key}:${activeView.id}`, () =>
                resolveQueueRowLayoutServer({
                    supabase: req.supabase,
                    orgId: req.orgId,
                    surfaceId: queueRowSurfaceId,
                    processKeyHint: process.key,
                    workViewId: activeView.id,
                }),
            ),
            // THE SAME read the KPI seed consumes — not a second one.
            headerLayoutRecordsPromise,
        ]);
        return resolveOperationalPresentation({
            supabase: req.supabase,
            orgId: req.orgId,
            fallbackTitle: workUnit.name,
            queueLayoutId: activeView.queue_layout_id?.trim() || null,
            focusPanelLayoutId: activeView.focus_panel_layout_id?.trim() || null,
            queueDefinition: wuRow.queue_definition,
            queueRowLayoutConfig: rowLayout?.config ?? null,
            businessProcessKey: process.key,
            workViewId: activeView.id,
            queueRowSurfaceId,
            queueRowResolvedSource: rowLayout?.source ?? null,
            headerLayoutRecords,
        });
    })();
    // Early-return safety (grain/records/subject fails never await it): keep the promise handled. The real
    // await at the assembly join re-sees any rejection so a genuine failure still surfaces 1:1.
    void presentationPromise.catch(() => {});

    /*
     * THE HEADER KPI ANSWER, STARTED AS SOON AS ITS CONFIG EXISTS.
     *
     * These three numerals are the Work Unit's COMPLETION OWNER. Measured on deployed staging the
     * client hook that fetches them starts ~50ms AFTER the document lands and finishes ~1.2-1.9s
     * later, holding V2.1 to ~5.6-5.8s while the cards themselves finish at ~4.74s. Nothing about
     * the work needs hydration: org, work unit, site scope, the key set and the authorization
     * bundle all exist here.
     *
     * It chains off the presentation branch because the KEY SET is published header config, which
     * that branch already reads — so this adds no read of its own. It is deliberately NOT awaited
     * inline: the join below takes what is ready and never blocks the document behind the rest.
     */
    const tHeaderKpi = now();
    const headerKpiPromise: Promise<WorkUnitHeaderKpiSeed | null> = headerLayoutRecordsPromise
        .then((records) => {
            // The SAME derivation the presentation branch applies, over the SAME records. A second
            // derivation could pick a different published variant, and the seed's key set would
            // stop matching the client's — which fails silently as "seed ignored", not as an error.
            const { headerConfig } = resolveWorkUnitHeaderConfigFromRecords(records, {
                businessProcessKey: process.key,
                workViewId: activeView.id,
            });
            const kpiSlots = operationalKpiSlotsFromHeaderConfig(headerConfig);
            markSpan("header_kpi_start_ms", tHeaderKpi);
            return req.resolveHeaderKpis?.({ workUnitId: workUnit.id, kpiSlots }) ?? null;
        })
        .then((seed) => {
            markSpan("header_kpi_execution_elapsed_ms", tHeaderKpi);
            return seed;
        })
        .catch(() => null);
    void headerKpiPromise.catch(() => {});

    // ── B: COMMIT-CRITICAL ACTIONS PROJECTION — resolve the right-rail action set CONCURRENTLY with the
    // presentation branch (it depends only on org + department + work unit, all known here). The SAME
    // `/process`-published resolver Workspace uses, config-cached (`act:` prefix, busted on an action
    // publish), and non-fatal: any resolver error degrades to an empty projection — never fails the answer.
    const actionsDepartmentId = wuRow.department_id ? String(wuRow.department_id) : null;
    const actionsProjectionPromise: Promise<WorkUnitActionsProjection> = actionsDepartmentId
        ? cachedConfigRead(`act:${req.orgId}:${workUnit.id}`, () =>
              loadRightRailActionsBundleServer({
                  orgId: req.orgId,
                  departmentId: actionsDepartmentId,
                  workUnitId: workUnit.id,
              }),
          )
              .then((actions) => ({
                  count: actions.length,
                  actions,
                  departmentId: actionsDepartmentId,
              }))
              .catch(() => ({ ...EMPTY_ACTIONS_PROJECTION, departmentId: actionsDepartmentId }))
        : Promise.resolve(EMPTY_ACTIONS_PROJECTION);
    void actionsProjectionPromise.catch(() => {});

    // ── A: COMMIT-CRITICAL PUBLISHED SUMMARY COMPOSITION — read the org's Focus Panel Summary layout
    // rows CONCURRENTLY (config-cached, `fps:` prefix, busted on a summary publish/rollback/delete).
    // Variant selection against the committed subject's scope happens at assembly (pure, in-memory).
    // Non-fatal: a failed read degrades to the client's own fetch — never fails the answer. Flag off
    // = resolved-empty (no published docs → the code default IS the composition), matching the API route.
    const focusPanelSummaryRowsPromise: Promise<readonly EntityLayoutRecord[] | null> =
        isLayoutRuntimeReadPathEnabled()
            ? cachedConfigRead(`fps:${req.orgId}`, async () => {
                  const layoutRows = await listOrgLayouts(
                      createAdminClient(),
                      req.orgId,
                      FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
                      FOCUS_PANEL_SUMMARY_SURFACE,
                  );
                  return layoutRows.filter((r) => r.layoutKey === FOCUS_PANEL_SUMMARY_LAYOUT_KEY);
              }).catch(() => null)
            : Promise.resolve([]);
    void focusPanelSummaryRowsPromise.catch(() => {});

    // ── §6: Row Grain explicit, Stage-owned. Grain-ambiguous config is refused honestly. ──
    const grain = resolveLensRowGrain(activeView, stages);
    if (!grain.ok) return fail("grain_ambiguous", `Work View "${activeView.label}": ${grain.reason}`, workUnit, navFrame);

    // ── R2: the lens grain becomes the SUBJECT grain, here, once. ──
    // Derived at the single point that knows the resolved lens, and published on the answer. Every layer
    // below reads that field; none re-derives it and none may hardcode one.
    //
    // A grain with no Focus Panel subject REFUSES, and does so as a configuration problem the operator can
    // navigate away from — the same honest-not-fatal shape as `grain_ambiguous`. It must never resolve to
    // `case`: silently presenting a `person`/`account`/`work_item` lens as a family is precisely the
    // wrong-subject substitution Subject Authority exists to prevent.
    const subject = resolveSubjectGrain(grain.grain);
    if (!subject.ok) {
        return fail("grain_unsupported", `Work View "${activeView.label}": ${subject.reason}`, workUnit, navFrame);
    }
    const subjectGrain = { grain: subject.grain, subjectType: subject.subjectType };

    // ── Stage Membership: base rows, Work Unit scoped, bounded. Persisted stage_key IS membership. ──
    // Awaited here at the projection join — the surface-scoped fetch was kicked off early so it ran
    // CONCURRENTLY with configuration when the count host IS the surface. Cross-host lenses reload the
    // count host's population via the same helper Settlement totals use.
    const tRec = now();
    let baseRows: Record<string, unknown>[] | null = null;
    if (populationWorkUnitId === workUnit.id) {
        const { data, error: rowErr } = await recordsPromise;
        timings.records_ms = now() - tRec;
        if (rowErr) return fail("records_unavailable", `records unavailable: ${rowErr.message}`, workUnit, navFrame);
        baseRows = (data ?? []) as Record<string, unknown>[];
    } else {
        void recordsPromise.then(
            () => undefined,
            () => undefined,
        );
        try {
            const population = await loadWorkUnitProcessPopulation({
                supabase: req.supabase,
                orgId: req.orgId,
                workUnitId: populationWorkUnitId,
            });
            timings.records_ms = now() - tRec;
            baseRows = population.rows;
        } catch (e) {
            timings.records_ms = now() - tRec;
            return fail(
                "records_unavailable",
                `records unavailable: ${e instanceof Error ? e.message : String(e)}`,
                workUnit,
                navFrame,
            );
        }
    }

    // ── R1: THE ROW SOURCE IS THE RESOLVED GRAIN'S, NOT ALWAYS `opportunities`. ──
    //
    // The `opportunities` read above stays valid for BOTH grains, but means different things:
    //   family → those rows ARE the rows;
    //   child  → they are the org + work-unit SCOPE. `process_instances` carries no `work_unit_id` and no
    //            FK to `opportunities`, so the in-scope opportunity set is a required INPUT to the child
    //            read, not wasted work. (This is why the early fetch's "records depend only on work_unit.id,
    //            not on configuration" comment still holds: the read did not move, only its use.)
    //
    // Provable invariant, stated as OUTPUT rather than as which tables are touched — the data model leaves
    // no child path that never reads `opportunities`: ON A CHILD ANSWER, NO ROW'S IDENTITY OR SUBJECT IS AN
    // OPPORTUNITY ID.
    const tProj = now();
    let page: OperationalProjectionRow[];
    let childRows: ChildProvisioningRow[] | null = null;
    /**
     * The lens's COMPLETE evaluated membership at family grain, before the display cap.
     *
     * `page` is what this answer PUBLISHES; membership is what the lens CONTAINS. They were the same
     * object, so "is this record in the Work View" was silently answered as "is it in the first 100
     * rows" — see the targeted resolution below.
     */
    let familyMembership: OperationalProjectionRow[] = [];

    if (subjectGrain.grain === "child") {
        // MEMBERSHIP FOLLOWS THE LENS'S OWN SHAPE. A stage-scoped child lens (Registration, Waitlist)
        // means "children at these stages". A stage-independent one means "children whose enrollment
        // participation is live" — a different question, answered by the Enrollment Definition's own
        // liveness gate rather than by enumerating stages. Reading an absent stage predicate as "every
        // stage" is what made such a lens resolve every grain at once and refuse itself.
        //
        // The rule now lives in `childGrainMembership` rather than inline here, so the COUNT path can
        // obey the SAME one. While it was inline, the totals route had no way to ask what this lens
        // selects and counted the opportunity lane instead — thirteen child rows under a pill of eight.
        try {
            const t_child_grain_members = now();
            childRows = await loadChildGrainMembersForLens({
                supabase: req.supabase,
                orgId: req.orgId,
                workUnitId: populationWorkUnitId,
                view: activeView,
            });
            markSpan("child_grain_members", t_child_grain_members);
        } catch (e) {
            // NEVER the family path. `QueueService` degrades a failed child read to case-grain rows, which
            // on a child surface is a wrong-subject substitution dressed as success. Here it is an honest
            // terminal — and `records_unavailable` is the one error kind a retry can plausibly fix.
            return fail(
                "records_unavailable",
                `child records unavailable: ${e instanceof Error ? e.message : String(e)}`,
                workUnit,
                navFrame,
            );
        }
        // Membership was decided BY THE PROVIDER, using the effective-stage rule
        // (`process_instances.stage_key ?? opportunities.stage_key`). Re-running the opportunity lens over
        // child rows would evaluate the wrong predicate against the wrong subject.
        page = childRows.slice(0, PROVISIONING_ROW_PAGE_CAP) as unknown as OperationalProjectionRow[];
    } else {
        // ── ONE Operational Projection. The lens is evaluated exactly once. ──
        // Effective Process Position MUST be attached BEFORE the evaluator: case-grain
        // opportunity_stage predicates use `_effective_participant_stage_keys`, not raw
        // `opportunities.stage_key`. Without this, families remain in Lead after every
        // child has diverged to Waitlist.
        /*
         * ── TWO ROUND TRIPS RETIRED, NOT HIDDEN ──
         *
         * These were two awaited database enrichments between the records read and the evaluator, so
         * the evaluated page cost THREE serial round trips for one page of rows. Both were already
         * PURE derivations that simply had nowhere to get their rows from.
         *
         * The rows now arrive WITH the opportunity — `maintained_operational_facts`, maintained
         * transactionally by the authority that changes each fact — so the derivations stay exactly
         * where they were and the reads are gone. Not cached, not prefetched, not parallelised: gone.
         *
         * Both calls are SYNCHRONOUS, and that is the enforcement. An async signature is what let a
         * round trip hide in the middle of this path; a pure function cannot grow one without
         * changing shape.
         */
        const baseWithEpp = attachEffectiveStagesFromMaintainedFacts(
            (baseRows ?? []) as Array<Record<string, unknown>>,
        );
        const baseWithTourFacts = attachActiveTourFactsFromMaintainedFacts(baseWithEpp);
        const projection = computeOperationalProjection({
            baseRows: baseWithTourFacts as OperationalProjectionRow[],
            workViews: [activeView], // only the active lens — no count fan-out, no second evaluation
        });
        const admitted = projection.byViewId[activeView.id]?.rows ?? [];
        const ordered = applyCanonicalWorkViewSort(admitted, activeView);
        familyMembership = ordered;
        page = ordered.slice(0, PROVISIONING_ROW_PAGE_CAP);
    }
    timings.projection_ms = now() - tProj;

    // ── PHASE 4: THE CHILD-SURFACE REFUSAL THAT STOOD HERE IS GONE. ──
    // It stood here because everything below was opportunity-shaped, so a child row reaching it would
    // have produced a family-shaped answer ABOUT a child — the wrong-subject substitution this sprint
    // exists to remove, wearing the costume of success. It came out only once the child path below
    // existed, and in the SAME change that wires `resolveChildGrainFocusPanelScope`, because a child
    // row reaching opportunity-shaped scope resolution is that same defect arriving by another route.
    // Its error code is retired from the vocabulary too, so it cannot return from somewhere new.

    const tComp = now();
    // U-O2 enrichment over the BOUNDED PAGE only — cost scales with what the operator can see.
    // Additive: the page in is the page out, in the same canonical order. Membership was decided
    // upstream by the projection and is never re-evaluated here.
    //
    // CONCURRENCY (D1 §8 budget): the enrichment (queue-row CRM labels) and the commit-critical
    // stage-work read are INDEPENDENT — enrichment adds contact labels to the visible rows, while
    // stage-work reads the SUBJECT's tasks. The subject is resolved from the PAGE (pre-enrichment)
    // and stage-work needs only subject + stage + config, so it never reads the enriched rows. They
    // were serial (~680 ms + ~690 ms measured); kick BOTH off here and join below so composition is
    // the max, not the sum. The subject-snapshot's enriched `primary_contact` is built AFTER the join.
    //
    // CHILD ROWS: enrich the FAMILY opportunity(s) on the page so commit-critical Household /
    // Children cards can know person + sibling roster while Attention stays on the child.
    // Keys are opportunity ids (drawer_open / contextId), never participation ids.
    const enrichedPromise: Promise<readonly Record<string, unknown>[]> =
        childRows
            ? (async () => {
                  const familyIds = [
                      ...new Set(
                          childRows
                              .slice(0, PROVISIONING_ROW_PAGE_CAP)
                              .map((r) => (typeof r.contextId === "string" ? r.contextId.trim() : ""))
                              .filter(Boolean),
                      ),
                  ];
                  if (!familyIds.length) return [];
                  const byId = new Map(
                      ((baseRows ?? []) as Array<Record<string, unknown>>)
                          .filter((o) => familyIds.includes(String(o.id)))
                          .map((o) => [String(o.id), o] as const),
                  );
                  const familyPage = familyIds
                      .map((id) => byId.get(id))
                      .filter((r): r is Record<string, unknown> => r != null);
                  if (!familyPage.length) return [];
                  return enrichOperationalProjectionRows({
                      supabase: req.supabase,
                      orgId: req.orgId,
                      rows: familyPage as unknown as EnrichableProjectionRow[],
                      queue: {
                          key: activeView.id,
                          label: activeView.label,
                          lifecycle_key: process.key,
                          subject_grain: "case",
                          stage_labels_by_key: Object.fromEntries(
                              stages
                                  .filter((s) => s.key.trim() && s.label.trim())
                                  .map((s) => [s.key.trim(), s.label.trim()]),
                          ),
                      },
                  }) as unknown as Promise<readonly Record<string, unknown>[]>;
              })()
            : (enrichOperationalProjectionRows({
                  supabase: req.supabase,
                  orgId: req.orgId,
                  rows: page as unknown as EnrichableProjectionRow[],
                  queue: {
                      key: activeView.id,
                      label: activeView.label,
                      lifecycle_key: process.key,
                      subject_grain: "case",
                      // Configured stages are the only runtime stage vocabulary, so the row pill can
                      // name the stage a record actually holds in the operator's own words.
                      stage_labels_by_key: Object.fromEntries(
                          stages
                              .filter((s) => s.key.trim() && s.label.trim())
                              .map((s) => [s.key.trim(), s.label.trim()])
                      ),
                  },
              }) as unknown as Promise<readonly Record<string, unknown>[]>);
    void enrichedPromise.catch(() => {});

    // ── U-O6 AUTHORITATIVE EMPTY — a workable place, never confused with error. Gated on the PAGE
    //    (enrichment is 1:1, page in = page out), so it does not wait on enrichment. ──
    if (page.length === 0) {
        const presentation = await presentationPromise;
        timings.presentation_ms = now() - tPres;
        const actionsProjection = await actionsProjectionPromise;
        timings.composition_ms = now() - tComp;
        timings.total_ms = now() - t0;
        return {
            terminal: "empty",
            orgId: req.orgId,
            workUnit,
            businessProcess: { key: process.key, name: process.name },
            activeWorkView: { id: activeView.id, label: activeView.label },
            lensSet,
            rowGrain: grain.grain,
            subjectGrain,
            rows: [],
            recordOfAttention: null,
            contextFrame,
            focusPanelScopeState: resolveFocusPanelScope({ record: null, activeView }).kind,
            focusPanelOutOfView: null,
            presentation,
            settlement,
            actionsProjection,
            timings,
        };
    }

    // ── U-P4/U-O3 Record of Attention — from the SAME evaluated page. No second evaluator. Resolved
    //    from the PAGE (pre-enrichment) so the commit-critical stage-work read can start CONCURRENTLY
    //    with enrichment above. ──
    const { strategy, source } = resolveSubjectStrategy(activeView);
    // THE ROW'S IDENTITY IS ITS GRAIN'S, NOT ALWAYS AN OPPORTUNITY ID.
    //
    // A child row has no `id` field at all — it has the canonical four-part identity, and the part that
    // names THIS row is `participationId` (`process_instances.id`): one row per participation is
    // exactly what the provider deduped to. Reading `.id` off a child row here yielded the string
    // "undefined" for every row — every subject id identical, so selection, deep links and
    // next/previous would all have addressed the same phantom subject. Unreachable until now only
    // because the refusal above returned first.
    //
    // `subjectId` (the durable child) is deliberately NOT the row id: the same child can hold two
    // participations across two leads, and those are two different rows.
    const subjectRows: OperationalSubjectQueueRow[] = childRows
        ? childRows.slice(0, PROVISIONING_ROW_PAGE_CAP).map((r, i) => ({
              id: String(r.participationId ?? ""),
              entityId: String(r.participationId ?? ""),
              entityType: "child",
              sortIndex: i,
          }))
        : page.map((r, i) => ({
              id: String((r as Record<string, unknown>).id),
              entityId: String((r as Record<string, unknown>).id),
              entityType: "opportunity",
              sortIndex: i,
          }));
    /**
     * TARGETED MEMBER RESOLUTION — membership decides, not the display page.
     *
     * `subjectRows` is the published page, capped at `PROVISIONING_ROW_PAGE_CAP`. Resolving a named
     * subject only against it answered "is this record in the Work View?" with "is it in the first
     * 100 rows?" — two different questions. A truthful member sorted past the cap was refused as
     * `subject_unavailable`, so direct navigation to it was impossible and the operator was told the
     * record was not in a view that does contain it.
     *
     * The complete membership is ALREADY in memory for both grains (`childRows` is the lens's full
     * member set; `familyMembership` is the full ordered projection), so this costs no query and no
     * larger page — it reads what the lens already evaluated. The published page is unchanged: only
     * the SELECTABILITY of a named member widens to the truth.
     *
     * This is not a weakening of the guard. An id that names no member of this lens still fails, and
     * nothing is ever substituted — the refusal below is untouched for genuine non-members.
     */
    // The FAMILY NAMES the child page can honestly cite. `baseRows` are the in-scope opportunities the
    // answer already fetched (for the child grain they ARE the scope), so this is a pure lookup — no
    // extra read, and no invented name when the row carries none.
    const familyNamesByOpportunityId = new Map<string, string | null>(
        childRows
            ? ((baseRows ?? []) as Array<Record<string, unknown>>).map((o) => [
                  String(o.id),
                  strOrNull(o.name) ?? strOrNull(o.title),
              ])
            : [],
    );

    /*
     * ── THE COHORT, RESOLVED ONCE, FOR BOTH OUTCOMES ─────────────────────────────────────────────
     *
     * The rows this answer publishes, built in ONE place and reachable from two exits: the
     * operational return below, and a subject-level refusal (`cohortRefusal`).
     *
     * This exists because `fail()` is scope-blind. Six refusal sites fire AFTER the Work Unit, the
     * lens set and the evaluated page have all resolved, and each of them used to discard that
     * resolved cohort — so one unconfigurable subject unmounted a seven-row queue that was never in
     * question. The queue is not a second owner and this is not a fallback path: it is the SAME
     * mapping, memoised, so the refusal cannot drift from the operational answer by construction.
     *
     * CONCURRENCY. Nothing here starts work. `enrichedPromise` (kicked off above) and
     * `presentationPromise` are already in flight, and `focusPanelStageWorkPromise` is started
     * BELOW every refusal site — so awaiting this on the refusal path serialises nothing on the
     * operational path, which awaits exactly what it awaited before, in the same order.
     */
    let cohortRowsMemo: Promise<{
        enriched: readonly Record<string, unknown>[];
        rows: ProvisioningRow[];
        presentation: OperationalPresentation;
    }> | null = null;
    const cohortRowsOnce = () =>
        (cohortRowsMemo ??= (async () => {
        const enriched = await enrichedPromise;
        // Child rows are published from the PROVIDER's own normalization — the same rows membership was
        // decided over — with a PI-NATIVE presentation context. Leaving `context` null was not the neutral
        // choice it looked like: a queue row renders entirely from its context, so thirteen children
        // rendered as thirteen raw participation UUIDs. The context carries only what a child row knows,
        // and leaves every Settlement-owned signal null rather than borrowing the family's.
        const stageLabelsByKey = Object.fromEntries(
            stages.filter((s) => s.key.trim() && s.label.trim()).map((s) => [s.key.trim(), s.label.trim()]),
        );
        const rowsUnsorted: ProvisioningRow[] = childRows
            ? childRows.slice(0, PROVISIONING_ROW_PAGE_CAP).map((r) => {
                  const placed = r as ChildProvisioningRowWithPlacement;
                  return {
                      id: String(r.participationId ?? ""),
                      stageKey: r.stageKey,
                      statusKey: r.statusKey,
                      updatedAt: r.updatedAt,
                      title: r.title,
                      context: childQueueRowContext({
                          row: placed,
                          stageLabel: (r.stageKey ? stageLabelsByKey[r.stageKey] : null) ?? r.stageKey ?? "",
                          stageLabelsByKey,
                          lifecycleKey: process.key,
                          familyName: r.contextId ? familyNamesByOpportunityId.get(r.contextId) ?? null : null,
                      }),
                      ...(placed.placementWaitlistRow
                          ? {
                                _placement_waitlist_row: placed.placementWaitlistRow,
                                placementCandidateId: placed.placementCandidateId ?? null,
                            }
                          : {}),
                  };
              })
            : enriched.map((r) => ({
                  id: String((r as Record<string, unknown>).id),
                  stageKey: strOrNull((r as Record<string, unknown>).stage_key),
                  statusKey: strOrNull((r as Record<string, unknown>).status_key),
                  updatedAt: strOrNull((r as Record<string, unknown>).updated_at),
                  title: strOrNull((r as Record<string, unknown>).name),
                  context: queueRowContextOf(r as Record<string, unknown>),
              }));
        // Join: await the presentation branch that ran CONCURRENTLY with projection + enrichment above.
        // `presentation_ms` now measures the residual wait — the enrichment cost is hidden underneath it.
        const presentation = await presentationPromise;
        timings.presentation_ms = now() - tPres;

        // Published Queue Row variant groupBy + sortCriteria drive child-grain Waitlist order.
        // Canonical config owner = the matched published variant (not a second Work View authority).
        let rows: ProvisioningRow[] = rowsUnsorted;
        if (childRows && rowsUnsorted.length > 0 && presentation.queue.rowVariants.length > 0) {
            const stageKey = rowsUnsorted[0]?.stageKey ?? null;
            const matched = resolveQueueRowVariant(presentation.queue.rowVariants, {
                stageKey,
                workViewId: activeView.id,
                processKey: process.key,
                grain: "child",
            });
            if (matched) {
                const groupBy = normalizeGroupByCriteria(matched);
                const criteria = normalizeSortCriteria(matched);
                if (groupBy.length || criteria.length) {
                    rows = applyQueueRowVariantGroupAndSortCriteria(
                        rowsUnsorted as unknown as Array<Record<string, unknown>>,
                        groupBy,
                        criteria,
                    ) as unknown as ProvisioningRow[];
                }
            }
        }
            return { enriched, rows, presentation };
        })());

    /*
     * A SUBJECT-LEVEL REFUSAL THAT KEEPS ITS COHORT.
     *
     * Mirrors the `navigationFrame` precedent exactly: that field exists because "a refusal must not
     * also remove the way out", and it carried the lens set through the error terminal so the
     * operator kept an exit. It carried no rows, so the exit survived and the queue did not.
     *
     * `queueFrame` is that same sentence one level deeper — the resolved cohort, propagated across
     * the error boundary. The terminal stays `error` and the message stays verbatim: the subject
     * genuinely cannot compose, and the Focus Panel is where that is said.
     */
    const cohortRefusal = async (code: ProvisioningErrorCode, message: string): Promise<ProvisioningAnswer> => {
        const { rows, presentation } = await cohortRowsOnce();
        const actionsProjection = await actionsProjectionPromise;
        const refused = fail(code, message, workUnit, navFrame);
        if (refused.terminal !== "error") return refused;
        return {
            ...refused,
            queueFrame: {
                rows,
                rowGrain: grain.grain,
                subjectGrain,
                presentation,
                businessProcess: { key: process.key, name: process.name },
                actionsProjection,
                requestedSubjectId: req.requestedSubjectId ?? null,
            },
        };
    };


    const requested = req.requestedSubjectId
        ? subjectRows.find((s) => s.entityId === req.requestedSubjectId) ??
          resolveTargetedWorkViewMember({
              childRows,
              familyMembership,
              subjectId: req.requestedSubjectId,
          })
        : null;
    if (req.requestedSubjectId && !requested) {
        // SUBJECT AUTHORITY. A caller that NAMES a subject is stating intent, not offering a hint.
        // Falling through to the default here answered a request for record X with record Y under a
        // `terminal: "operational"` banner — measured: a well-formed but off-page id returned the
        // default family with no error and no signal, while the URL still read `subject_id=X`. In this
        // domain that is an operator acting on the wrong family, which is the most consequential form
        // the fabrication defect can take.
        //
        // Absence here does NOT mean "no such record" — the id may be beyond the page cap, outside the
        // active lens, or in another work unit. It means THIS surface cannot honestly present it, which
        // is exactly what the honest terminal below already exists to say. Substituting is never the
        // truthful answer; the default subject remains reachable by asking for it without a subject id.
        return await cohortRefusal(
            "subject_unavailable",
            `the requested subject is not present in this work unit's evaluated page — refusing to substitute a different subject`,
        );
    }
    const chosen =
        requested ??
        resolveDefaultOperationalSubject(subjectRows, strategy, { currentUserId: req.currentUserId ?? null });
    if (!chosen) {
        // Rows exist but no subject could be chosen — honest, never a fabricated subject.
        return await cohortRefusal(
            "subject_unavailable",
            "the configured strategy resolved no subject from the evaluated page",
        );
    }
    /*
     * The subject is known HERE — before the children shell, which is the single largest piece of
     * the remaining composition. Anything the route can start from the subject alone should start
     * now rather than after the answer is assembled.
     */
    if (chosen.entityId) {
        try {
            req.onSubjectResolved?.({ subjectId: String(chosen.entityId), orgId: req.orgId });
        } catch {
            // A listener is an optimisation. It may never cost the document its answer.
        }
    }
    // ── U-P5/U-O4 current business state + U-O5 truthful primary action. ──
    const childSubjectRow = childRows?.find((r) => String(r.participationId ?? "") === chosen.entityId) ?? null;
    // The chosen member may sit BEYOND the published page (targeted resolution above), so composition
    // reads the full membership. Searching only `page` here returned `undefined` behind a non-null
    // assertion — the off-page path would have crashed rather than composed.
    const subjectRow =
        childSubjectRow ??
        page.find((r) => String((r as Record<string, unknown>).id) === chosen.entityId) ??
        familyMembership.find((r) => String((r as Record<string, unknown>).id) === chosen.entityId)!;

    /*
     * THE SITE LOOKUP STARTS HERE AND IS AWAITED AT THE COMMIT BOUNDARY.
     *
     * It was a serial `await` in the bindings block at the very TAIL of composition — after
     * presentation, the children shell, waitlist, inquiry and avatar had all finished. There was
     * no remaining work to overlap with, so its whole wall landed on the document: measured
     * 1,949ms -> 3,061ms, about +1,112ms, which is the regression this repair exists to remove.
     *
     * Started here it runs ALONGSIDE the children shell and the child-grain branches below, which
     * is the same shape those already use ("started here, awaited at the commit boundary"). The
     * inputs are authoritative at this point: `req.orgId` came from the route gate and the subject
     * row is resolved, so concurrency cannot let the read outrun the request's authority.
     *
     * ONE promise, ONE resolved answer, consumed by both the rail annotation and Children. It is
     * never awaited early and never published before it is authoritative.
     */
    /*
     * The family row for a child surface, resolved from the membership set already in hand —
     * `enriched` is not in scope this early, and reaching for it would mean moving a read rather
     * than moving a wait. `familyMembership` carries the same opportunity rows, so the location id
     * it yields is the same one the late binding resolves; the join below re-checks rather than
     * assuming.
     */
    const wave3RecordEarly = ((childSubjectRow?.contextId != null
        ? ((familyMembership.find(
              (r) => String((r as Record<string, unknown>).id) === childSubjectRow.contextId,
          ) ?? null) as Record<string, unknown> | null)
        : null) ?? (subjectRow as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const wave3EarlyLocation = resolveOpportunityLeadLocationFields(wave3RecordEarly);
    const tWave3Location = now();
    const wave3LocationPromise: Promise<string | null> =
        wave3EarlyLocation.locationLabel
            ? Promise.resolve(wave3EarlyLocation.locationLabel)
            : wave3EarlyLocation.locationId
              ? resolveLocationById(req.supabase, req.orgId, wave3EarlyLocation.locationId)
                    .then((loc) => {
                        markSpan("location_lookup_ms", tWave3Location);
                        return loc ? canonicalLocationDisplay(loc) : null;
                    })
                    /*
                     * An outage is not an answer. Null here means UNKNOWN, and the binding below
                     * omits the key rather than writing a label — so nothing claims the record has
                     * no site, and the drawer still corrects it later.
                     */
                    .catch(() => {
                        markSpan("location_lookup_failed_ms", tWave3Location);
                        return null;
                    })
              : Promise.resolve(null);

    /*
     * THE AUTHORITATIVE CHILDREN ANSWER — started here, awaited at the commit boundary.
     *
     * Children was the last blocking area that genuinely required the second round trip. Its card
     * cannot be served from intake metadata: the headline count is
     * `rows.filter((r) => r.outcome_status_key !== "declined")`, and `outcome_status_key` exists
     * only in the OCM join and the enrollment overlay. Metadata would produce a WRONG count, not a
     * partial one, which is why the cheap transport was rejected.
     *
     * So the document runs THE SAME owner the drawer runs — `attachOpportunityInquiryChildrenShell`
     * — against the same org and the same opportunity. One authority, one row mapping, no second
     * definition of what a Children row means.
     *
     * NO NEW COLUMNS RIDE ON THIS. The first attempt added `program_type, schedule_type` to the
     * population select because the shell reads them as the opportunity-level defaults a child row
     * falls back to. Neither column exists on `opportunities` — the deployed answer became
     * "records unavailable: column opportunities.program_type does not exist" and staging lost
     * every card. They are vestigial on the DRAWER path too: `OPPORTUNITY_CANONICAL_ADMIN_SELECT`
     * does not carry them either, so `oppDefaultProgramType` has always resolved to null in
     * production and the child's own `program_type` is what actually renders. Passing the host we
     * already have reproduces the drawer's answer exactly, which is the point of one owner.
     *
     * A COPY, not the subject row: the shell writes `_inquiry_children` onto the host it is given,
     * and the page rows must not acquire a key the row contract does not define.
     */
    const t_document_children = now();
    const childrenHost: Record<string, unknown> = { ...(subjectRow as Record<string, unknown>) };
    const documentChildrenP: Promise<unknown[] | null> = attachOpportunityInquiryChildrenShell(
        req.supabase as never,
        req.orgId,
        childrenHost,
        /*
         * The SAME actor the answer already uses for row avatars. Photo URLs are documents minted
         * per actor per request, so without it the children carry no `resolved_photo_url` and fall
         * back to initials — a DIFFERENT visible answer, not a missing one.
         */
        req.documentActor ?? null,
    )
        .then(() => {
            markSpan("document_children_ms", t_document_children);
            return Array.isArray(childrenHost._inquiry_children)
                ? (childrenHost._inquiry_children as unknown[])
                : null;
        })
        /*
         * Bounded and TRUTHFUL. A rejection resolves to null, which leaves the contract ABSENT, and
         * the card reads absent as "not loaded". It must never resolve to `[]`, which is the
         * authoritative answer "this family has no children".
         */
        .catch(() => {
            markSpan("document_children_failed_ms", t_document_children);
            return null;
        });

    // Child Waitlist: attach Placement ranking (derived position / wait_since / program) onto rows.
    // Membership stays PI-owned; ranking authority is placement_candidates + overrides.
    if (childRows?.length) {
        /**
         * Avatar resolution runs CONCURRENTLY with the waitlist + inquiry chain.
         *
         * The four child-grain steps were strictly serial and measured 1.4s + 4.6s + 0.7s + 2.2s
         * = 8.9s, which is essentially the whole 8.2s `composition_ms`. Inquiry genuinely depends
         * on placement (it is the fallback for a program placement did not supply), but the avatar
         * step reads ONLY `row.subjectId` — member -> person -> photo — and no placement field.
         * Serialising it behind placement bought nothing.
         *
         * It runs on COPIES: `attachChildGrainAvatar` mutates rows in place, and the placement step
         * can expand one child into several candidate rows, so mutating the shared input would
         * write onto objects the final page no longer contains. The merge below re-applies the
         * result keyed by `subjectId` — the same key the avatar step uses internally, so each row
         * still answers only for its own child.
         */
        const t_child_grain_avatar_conc = now();
        const avatarRowsPromise = attachChildGrainAvatar({
            supabase: req.supabase,
            orgId: req.orgId,
            actor: req.documentActor,
            childRows: childRows.map((r) => ({ ...r })) as ChildProvisioningRowWithPlacement[],
        });
        void avatarRowsPromise.catch(() => {});
        const t_child_grain_waitlist = now();
        childRows = await attachChildGrainWaitlistPlacement({
            supabase: req.supabase,
            orgId: req.orgId,
            workUnitId: populationWorkUnitId,
            workUnitMetadata: populationWorkUnitMetadata,
            departmentMetadata: deptRow?.metadata ?? null,
            placementQueueKeys: ["waitlisted", "waitlist", activeView.id],
            childRows,
            familyNamesByOpportunityId,
        });
        markSpan("child_grain_waitlist", t_child_grain_waitlist);
        const t_child_grain_inquiry = now();
        childRows = await attachChildGrainInquiryProgramFallback({
            supabase: req.supabase,
            orgId: req.orgId,
            childRows: childRows as ChildProvisioningRowWithPlacement[],
        });
        markSpan("child_grain_inquiry", t_child_grain_inquiry);
        // Join the avatar branch started above. One batched member -> person -> photo resolution
        // for the whole page, never per row — and now off the critical path of placement.
        try {
            const avatarRows = await avatarRowsPromise;
            const urlBySubject = new Map<string, string>();
            for (const r of avatarRows) {
                const id = strOrNull((r as { subjectId?: unknown }).subjectId);
                const url = strOrNull((r as { avatarImageUrl?: unknown }).avatarImageUrl);
                if (id && url) urlBySubject.set(id, url);
            }
            for (const r of childRows as ChildProvisioningRowWithPlacement[]) {
                const id = strOrNull((r as { subjectId?: unknown }).subjectId);
                const url = id ? urlBySubject.get(id) : null;
                if (url) (r as { avatarImageUrl?: string }).avatarImageUrl = url;
            }
        } catch {
            // Avatars are presentation. A read failure must never cost the operator their queue.
        }
        markSpan("child_grain_avatar", t_child_grain_avatar_conc);
    }

    let stage: LifecycleBuilderStageRecord;
    let currentBusinessState: CurrentBusinessState;
    let primaryAction: TruthfulPrimaryAction | null;
    let childComposition: ChildSurfaceComposition | null = null;
    let familyMissionPrimaryAbsence: ChildPrimaryActionAbsence | null = null;
    let familyMissionParticipantCount = 0;
    let familyMissionStageKeys: string[] = [];
    let familyMissionHomogeneous = true;

    if (childSubjectRow) {
        // ── THE CHILD RUNTIME VIEWMODEL — composition only. Every field below is READ from Business
        //    Process outputs (effective stage from the provider, journey segment from the canonical
        //    translation, work + action from the stage's operating plan). Nothing here computes
        //    readiness, membership, stage or eligibility.
        const composed = composeChildGrainSurface({
            row: childSubjectRow,
            stages,
            familyNamesByOpportunityId,
        });
        if (!composed.ok) {
            // Same refusal the family path makes, for the same reason: a surface cannot describe a
            // position the Business Process does not define.
            return await cohortRefusal("no_truthful_primary_action", composed.reason);
        }
        childComposition = composed.composition;
        stage = childComposition.stage;
        currentBusinessState = childComposition.currentBusinessState;
        primaryAction = childComposition.primaryAction;
    } else {
        // ── FAMILY PATH — Mission from Effective Process Position, not raw stage_key alone. ──
        // Inventory / catch-all Work Views (empty opportunity_stage lens) must not impose a stale
        // shared-stage Mission when authorized participants have diverged. Shared context stage
        // remains authority only when no participant stage signal exists.
        const subjectRecord = subjectRow as Record<string, unknown>;
        const contextStageKey = strOrNull(subjectRecord.stage_key);
        const mission = resolveContextMissionStages({
            contextStageKey,
            effectiveParticipantStageKeys: effectiveParticipantStageKeysFromRow(subjectRecord),
            workViewLensStageKeys: lensStageKeys(activeView),
        });
        familyMissionParticipantCount = mission.contributingParticipantCount;
        familyMissionStageKeys = [...mission.missionStageKeys];
        familyMissionHomogeneous = mission.homogeneous;
        const missionStageKey = mission.primaryMissionStageKey;
        const found = stages.find((s) => s.key === missionStageKey) ?? null;
        if (!found || !missionStageKey) {
            return await cohortRefusal(
                "no_truthful_primary_action",
                `subject holds no resolvable Mission stage (context="${contextStageKey}", epp=[${mission.missionStageKeys.join(",")}])`,
            );
        }
        // ── ONE definition of "can a family surface be entered here" ──
        // Extracted so anything that OFFERS this lens as a destination (Search) asks the SAME
        // question this answer asks on arrival. Two readings of it is how a pill came to light up
        // over a Focus Panel with zero cells while the answer behind it was refusing.
        //
        // Child-segment stages (Waitlist, Assignment, …) often publish templates without a
        // primary_action. When Mission is EPP-derived onto such a stage, the rule allows a null
        // primary action with an absence reason — same as the child path — so What's Next can
        // project from templates instead of falling back to stale Lead Contact Family.
        const operability = familyStageDestinationOperability(found, {
            missionDerivedFromEffectiveParticipants: mission.derivedFromEffectiveParticipants,
        });
        if (!operability.ok) {
            return await cohortRefusal("no_truthful_primary_action", operability.reason);
        }

        const foundPlan = found.stage_operating_plan_v1 ?? null;
        const template = foundPlan?.work_templates?.find((t) => t.primary) ?? foundPlan?.work_templates?.[0] ?? null;
        const actionRef = template?.primary_action?.action_ref ?? null;
        if (!foundPlan || !template) {
            // Unreachable — the operability rule above already refused exactly this case. Kept as a
            // type narrowing so it can never silently degrade into a different answer.
            return await cohortRefusal(
                "no_truthful_primary_action",
                `stage "${found.key}" offers no work templates — the answer will not claim operational on identity alone`,
            );
        }
        stage = found;
        currentBusinessState = {
            stageKey: found.key,
            stageLabel: found.label,
            purpose: foundPlan.purpose ?? null,
            workTemplateKey: template.template_key,
            workTemplateLabel: template.label,
            required: template.required,
        };
        primaryAction = actionRef
            ? {
                  actionRef,
                  label: template.primary_action?.override_label ?? template.label,
                  workTemplateKey: template.template_key,
              }
            : null;
        familyMissionPrimaryAbsence = actionRef ? null : "work_template_has_no_action";
    }

    // ── COMMIT-CRITICAL FOCUS PANEL — the answer OWNS the operational Current Work projection. ──
    // Progress + requirements + blocked/status are part of Situation→Decision→Action, so the useful
    // Focus Panel commits WITH Header + Queue from the answer alone; the drawer VM only enriches the
    // surrounding Settlement cards afterward. Additive and non-fatal: any failure degrades to the
    // client drawer-VM load, never an operational error. `departmentMetadata` is already in hand.
    // Kicked off CONCURRENTLY with enrichment (both need only data resolved above); joined below.
    //
    // FOR A CHILD, THE READ IS THE CHILD'S OR IT DOES NOT HAPPEN. The slice is already
    // child-parameterized (`customerMemberId` / `processInstanceId` / `opportunityCustomerMemberId`),
    // so the child path threads the canonical identity through it rather than adding a second reader —
    // and it is anchored on the family case (`contextId`), which is where the tasks actually hang.
    //
    // When the child's effective stage is a FAMILY-segment stage, no read is issued at all. The work
    // configured there is the family's; fetching it and publishing it as `focusPanelStageWork` would
    // put the family's Current Work on a child's surface, which is precisely the substitution the
    // removed refusal was standing in for.
    const focusPanelStageWorkPromise: Promise<OpportunityStageWorkSlice | null> = childSubjectRow
        ? childComposition?.childOwnsStageWork && childSubjectRow.contextId
            ? resolveOpportunityStageWorkSlice({
                  supabase: req.supabase,
                  orgId: req.orgId,
                  opportunityId: childSubjectRow.contextId,
                  departmentId: wuRow.department_id ? String(wuRow.department_id) : null,
                  stageKey: stage.key,
                  stageLabel: stage.label,
                  departmentMetadata: deptRow?.metadata,
                  clientHoldsLiveDepartmentConfig:
                      (req.departmentConfigHeldIds ?? []).includes(String(wuRow.department_id ?? "")),
                  customerMemberId: childSubjectRow.subjectId,
                  processInstanceId: childSubjectRow.participationId,
                  opportunityCustomerMemberId: childSubjectRow.legacyOcmId,
              }).catch(() => null)
            : Promise.resolve(null)
        : resolveOpportunityStageWorkSlice({
              supabase: req.supabase,
              orgId: req.orgId,
              opportunityId: chosen.entityId,
              departmentId: wuRow.department_id ? String(wuRow.department_id) : null,
              stageKey: stage.key,
              stageLabel: stage.label,
              departmentMetadata: deptRow?.metadata,
              clientHoldsLiveDepartmentConfig:
                      (req.departmentConfigHeldIds ?? []).includes(String(wuRow.department_id ?? "")),
          }).catch(() => null /* stage-work is additive to the commit — never fail the operational answer on it */);

    // ── JOIN: enrichment (queue rows) + presentation + actions + stage-work, all kicked off above. ──
    const { enriched, rows, presentation } = await cohortRowsOnce();
    // B: the actions projection ran concurrently above — join it here (no serial latency added).
    const actionsProjection = await actionsProjectionPromise;
    let focusPanelStageWork = await focusPanelStageWorkPromise;

    // Mixed context Mission: keep the primary stage-work slice, then append each additional
    // Mission stage's primary template as secondary items (sync from already-loaded dept metadata —
    // no extra task fetch waterfall). Labels come from published plans, never hardcoded stage names.
    if (
        !childSubjectRow
        && !familyMissionHomogeneous
        && familyMissionStageKeys.length > 1
        && focusPanelStageWork?.stage_work_runtime
        && wuRow.department_id
    ) {
        const primaryRuntime = focusPanelStageWork.stage_work_runtime;
        const extraItems = [];
        for (const extraKey of familyMissionStageKeys.slice(1)) {
            if (extraKey === primaryRuntime.stage_key) continue;
            const extra = projectStageWorkRuntimeSync({
                orgId: req.orgId,
                opportunityId: chosen.entityId,
                departmentId: String(wuRow.department_id),
                departmentMetadata: deptRow?.metadata,
                builderStageKey: extraKey,
                stageLabel: stages.find((s) => s.key === extraKey)?.label ?? null,
                openRows: [],
                completedRows: [],
            });
            if (extra?.primary) {
                extraItems.push({
                    ...extra.primary,
                    role: "secondary" as const,
                    label: `${extra.primary.label}${extra.stage_label ? ` · ${extra.stage_label}` : ""}`,
                });
            }
        }
        if (extraItems.length) {
            focusPanelStageWork = {
                ...focusPanelStageWork,
                stage_work_runtime: {
                    ...primaryRuntime,
                    additional: [...primaryRuntime.additional, ...extraItems],
                    template_keys: [
                        ...primaryRuntime.template_keys,
                        ...extraItems.map((i) => i.template_key),
                    ],
                },
            };
        }
    }

    // A — COMMIT-CRITICAL SUBJECT IDENTITY TRUTH (DOMAIN-owned key declaration). The opportunity domain
    // composer declares WHICH truth bindings the committed Household + Children cards read
    // (`person.primary_contact_name` / `_phone` / `_email`, `_inquiry_children`) — these Household/Children
    // semantics live HERE, in the domain, and the platform contract/builder forward the bag opaquely.
    // Sourced from data ALREADY resolved for the subject row (enriched queue-row `primary_contact` + the
    // row's `metadata.inquiry_children`) — no extra DB read. Empty/absent bindings → the bag is null and
    // those cards reserve (the drawer VM fills them). A second surface declares its own keys the same way.
    //
    // CHILD ATTENTION: Settlement Truth is the family opportunity. Prefer enriched family row for
    // Household/Children knowability while child.* bindings name the focused participant.
    const familyEnrichedForChild =
        childSubjectRow?.contextId != null
            ? ((enriched.find(
                  (r) => String((r as Record<string, unknown>).id) === childSubjectRow.contextId,
              ) ?? null) as Record<string, unknown> | null)
            : null;
    const familyContextForChild = familyEnrichedForChild
        ? queueRowContextOf(familyEnrichedForChild)
        : null;

    const chosenRowContext = (rows.find((r) => r.id === chosen.entityId)?.context ?? {}) as Record<string, unknown>;
    const identityContactSource = (familyContextForChild?.primary_contact ??
        chosenRowContext.primary_contact ??
        {}) as Record<string, unknown>;
    const subjectMetadata = (
        (familyEnrichedForChild?.metadata ?? (subjectRow as Record<string, unknown>).metadata) as
            | Record<string, unknown>
            | null
            | undefined
    );
    /*
     * WAVE-3 FIRST-ORDER TRUTH, CARRIED INSTEAD OF WAITED FOR.
     *
     * Measured on deployed staging: business_process, children and household all made their first
     * CORRECT visible statement ~2,974ms after the first card wave, and only when the drawer
     * arrived. Withholding the drawer left them permanently wrong rather than merely late —
     * children read "—" for a site the row already named, and household showed a contact it could
     * not act on. That is not enrichment arriving late; it is first-order truth owned by the wrong
     * frame.
     *
     * Every value below was ALREADY READ by this composer. `workUnitProcessPopulation` selects
     * `updated_at`, `location_id` and `primary_person_id` on the opportunity, and the row carries
     * its resolved `_location_name`. Nothing here adds a query, a projection or a second owner:
     * `resolveOpportunityLeadLocationFields` is the canonical location resolver the drawer itself
     * uses, so the two frames cannot disagree about the site.
     *
     * The household record precedence matches `identityContactSource` directly above — a child
     * surface reads the FAMILY row, because household truth is family-grain even when the subject
     * is a participant.
     */
    const wave3Record = (familyEnrichedForChild
        ?? (subjectRow as Record<string, unknown> | null)
        ?? {}) as Record<string, unknown>;
    const wave3LeadLocation = resolveOpportunityLeadLocationFields(wave3Record);
    /*
     * THE SITE LABEL — THE LAST WAVE-3 FIRST-ORDER DEPENDENCY.
     *
     * Deployed measurement of the previous slice: business_process and household converged, and
     * the ENTIRE remaining late wave was four mutations carrying ONE fact — "North Campus". The
     * Tour stage annotation gained it and Children swapped "— / Inherited from lead" for it, both
     * from the drawer, both at ~5.2s.
     *
     * My previous classification of this field as "already present" was WRONG and the measurement
     * caught it. `_location_name` is CONSUMED in the document path but PRODUCED on the drawer's:
     * `opportunityEntityRecord` reads the locations row and derives the label there. The document
     * row carries `location_id`, a uuid, and no label — so `resolveOpportunityLeadLocationFields`
     * correctly returned empty and the conditional spread correctly omitted the key rather than
     * fabricating a site.
     *
     * So this is the one authorized new read, and it is ONE read feeding BOTH consumers: the same
     * resolved label becomes the rail's annotation and Children's location. `resolveLocationById`
     * is the canonical provider — a single indexed lookup scoped to `org_id`, which is the
     * authority this composer already holds. No permission verdict is transported and no second
     * location owner is created; `canonicalLocationDisplay` is the platform's own label rule.
     *
     * FAILURE SEMANTICS. A THROW is an outage, not an answer: the label stays null and no key is
     * written, so nothing claims the record has no site. A null RESULT is authoritative absence —
     * the row genuinely has no location — and the card's existing empty state is then correct.
     * Neither path ever writes an empty-string label, which would render as a real blank site.
     */
    // JOIN. The lookup started beside the children shell; this is only the wait it did not already
    // cover. `location_join_wait_ms` is what the join actually cost — the number to hold honest.
    const tWave3LocationJoin = now();
    const wave3LocationId = wave3LeadLocation.locationId || null;
    /*
     * The early start was keyed to the row available before the children branches ran. If the
     * authoritative record resolved to a DIFFERENT location, the speculative answer is not this
     * record's and must not be shown — so it is discarded and the canonical lookup runs for the
     * real id. Same owner, same display rule; the speculation is an optimisation, never a source.
     */
    let wave3LocationLabel: string | null =
        wave3EarlyLocation.locationId === wave3LocationId ? await wave3LocationPromise : null;
    if (wave3LocationLabel == null && wave3LocationId && wave3EarlyLocation.locationId !== wave3LocationId) {
        try {
            const late = await resolveLocationById(req.supabase, req.orgId, wave3LocationId);
            wave3LocationLabel = late ? canonicalLocationDisplay(late) : null;
        } catch {
            wave3LocationLabel = null;
        }
    }
    markSpan("location_join_wait_ms", tWave3LocationJoin);
    const wave3UpdatedAt = strOrNull(wave3Record.updated_at);
    /*
     * IDENTITY, NOT A PERMISSION VERDICT. The Household contact renders as plain text until it has
     * an editable person id — `isEditableHouseholdPersonId` rejects empty and the "primary" /
     * "secondary:" sentinels — so the missing id, not the missing authority, is what kept the
     * affordance drawer-bound. `canMutate` is still evaluated at the request boundary from the
     * operator's own roles and is NOT carried here.
     */
    const wave3PrimaryPersonId = strOrNull(wave3Record.primary_person_id);
    /*
     * THE LIFECYCLE RAIL, COMPUTED WHERE ITS CONFIGURATION ALREADY LIVES.
     *
     * `buildOpportunityWorkspaceLifecycleRail` is a PURE function — no I/O — and this composer
     * already holds every input it needs: `deptRow.metadata` was read for the lens set, and the
     * subject record is in hand. Its own contract states the split this relies on: "the stages are
     * configuration, the annotations are truth."
     *
     * It is computed HERE, server-side, rather than plumbing `departmentMetadata` to the browser.
     * The rail is the answer; the department's whole configuration document is not, and shipping
     * it to the client to recompute the same value would be both larger and a second owner.
     *
     * `statusDefs: []` is deliberate. That argument exists only to resolve a status key to a stage
     * for the rail's own `current_stage_key`, and the commit context already carries the record's
     * stage as `situation.stageKey` — which is what the card's "current" marker reads. Passing an
     * empty list therefore drops nothing the card uses and avoids a read for an answer we have.
     */
    const wave3Rail = buildOpportunityWorkspaceLifecycleRail({
        departmentMetadata: deptRow?.metadata,
        statusKey: null,
        statusDefs: [],
        record: wave3Record,
        annotationLabels: {
            locationLabel: wave3LocationLabel,
            ownerLabel: null,
        },
    });
    const wave3ProcessName = strOrNull((process as { name?: unknown } | null)?.name)
        ?? strOrNull((process as { label?: unknown } | null)?.label);
    const primaryContactName = strOrNull(identityContactSource.display_name);
    const primaryContactPhone = strOrNull(identityContactSource.phone);
    const primaryContactEmail = strOrNull(identityContactSource.email);
    // The committed Children card's roster must come from authoritative child enrichment
    // (`_inquiry_children` / `_household_children`), NOT the thin queue `related_subjects_summary`
    // projection (names-only). Preferring the summary first blanked DOB/gender/program when the
    // family was opened from All/Tours vs Waitlist — same children, divergent Focus Panel truth.
    const chosenEnrichedRow = (familyEnrichedForChild ??
        (enriched.find((r) => String((r as Record<string, unknown>).id) === chosen.entityId) ??
            {})) as Record<string, unknown>;
    const householdChildren = chosenEnrichedRow._household_children;
    const enrichedInquiryChildren = chosenEnrichedRow._inquiry_children;
    // Queue `related_subjects_summary` is recognition-only (names/DOB). Never promote it to
    // `_inquiry_children` — that falsely marks Children commit-critical and Mission overlays
    // would clobber Settlement's authoritative roster with a thin seed.
    const inquiryChildren =
        (Array.isArray(enrichedInquiryChildren) && enrichedInquiryChildren.length
            ? enrichedInquiryChildren
            : null)
        ?? (Array.isArray(householdChildren) && householdChildren.length ? householdChildren : null)
        ?? subjectMetadata?.inquiry_children
        ?? null;
    /*
     * ── THE HOUSEHOLD, STATED AT COMMIT BECAUSE THE ANSWER ALREADY HOLDS IT ──
     *
     * An account-scoped card (Financials) addresses `customers.id`, and that id was reaching the panel
     * only after Settlement — not because the composer had to go and find it, but because nobody had
     * said it. `opportunities.customer_id` is in the population select (`workUnitProcessPopulation`),
     * survives enrichment untouched, and is already in memory here. This is a DECLARATION, not a read:
     * no query is added, no promise is awaited, and the answer's timing is unchanged.
     *
     * ONE OWNER, BOTH GRAINS. The household of a case is the case's customer; the household of a child
     * is their FAMILY case's customer — the same column on the same table, reached through the family
     * opportunity the child participation already names. There is no second resolver, and no id is
     * synthesised: a participation with no family case yields nothing and Financials reserves, which
     * is the truthful answer for a child whose account is genuinely unknown here.
     */
    const householdOpportunityId = childComposition
        ? (childComposition.family?.opportunityId?.trim()
           || childComposition.identity.contextId?.trim()
           || null)
        : chosen.entityId;
    const householdCustomerId =
        // FAMILY GRAIN — the case row itself, enriched or base. Both carry `customer_id` from the
        // population select; enrichment is additive and never strips it.
        strOrNull((chosenEnrichedRow as Record<string, unknown>).customer_id)
        ?? (householdOpportunityId
            ? strOrNull(
                  ((baseRows ?? []) as Array<Record<string, unknown>>).find(
                      (o) => String(o.id) === householdOpportunityId,
                  )?.customer_id,
              )
            : null)
        /*
         * CHILD GRAIN — the family case is not in `baseRows` at all (a child lens pages participations,
         * so `baseRows` is empty and `enriched` with it). The child row's OWN provider already read that
         * opportunity in full to resolve the effective stage, and the column was being dropped at the
         * normalizer. Reading it back is a declaration, not a lookup: measured `baseRowsLen: 0` with the
         * family opportunity id known all along.
         */
        ?? childComposition?.family?.customerId?.trim()
        ?? null;
    const subjectIdentityTruthBindings: SubjectIdentityTruth = {
        ...(householdCustomerId ? { "customer.id": householdCustomerId } : {}),
        ...(primaryContactName ? { "person.primary_contact_name": primaryContactName } : {}),
        ...(primaryContactPhone ? { "person.primary_phone": primaryContactPhone } : {}),
        ...(primaryContactEmail ? { "person.primary_email": primaryContactEmail } : {}),
        // Wave-3 first-order truth (see above): all already read, none newly queried.
        ...(wave3LocationLabel ? { _location_label: wave3LocationLabel } : {}),
        ...(wave3LeadLocation.locationId ? { _location_id: wave3LeadLocation.locationId } : {}),
        ...(wave3UpdatedAt ? { updated_at: wave3UpdatedAt } : {}),
        ...(wave3PrimaryPersonId ? { primary_person_id: wave3PrimaryPersonId } : {}),
        ...(inquiryChildren != null ? { _inquiry_children: inquiryChildren } : {}),
        // Context Mission metadata (family grain) — presentation may aggregate participant count;
        // never invents stage labels (keys only; labels come from stage records / runtime).
        ...(!childComposition && familyMissionStageKeys.length
            ? {
                  _mission_stage_keys: familyMissionStageKeys,
                  _mission_homogeneous: familyMissionHomogeneous,
                  ...(familyMissionParticipantCount > 0
                      ? { _mission_participant_count: familyMissionParticipantCount }
                      : {}),
              }
            : {}),
    };
    // Child surface: Attention bindings (child.*) + family Truth bindings (person.* / children).
    // Family bindings are Settlement context for the Focus Panel — not a substitution of subject.
    const childBindings = childComposition
        ? childSubjectIdentityTruthBindings(
              childComposition,
              childSubjectRow?.title ?? null,
              /*
               * The photo `attachChildGrainAvatar` already resolved, read from the LIVE row set.
               *
               * `childSubjectRow` was captured before the avatar branch merged its results, and the
               * placement/inquiry attaches in between may hand back new row objects — so the
               * captured reference can be a stale copy with no avatar on it. Looking the child up
               * again by its participation id reads whatever the pipeline actually produced,
               * without resolving the photo a second time.
               */
              (() => {
                  const live = (childRows as Array<Record<string, unknown>> | null)?.find(
                      (r) => String(r.participationId ?? "") === String(childComposition.identity.participationId ?? ""),
                  );
                  const url = live?.avatarImageUrl ?? (childSubjectRow as { avatarImageUrl?: unknown } | null)?.avatarImageUrl;
                  return typeof url === "string" && url.trim() ? url : null;
              })(),
          )
        : null;
    // Child surface: Attention bindings (child.*) + family Truth bindings (person.* / children).
    // Family bindings are Settlement context for the Focus Panel — not a substitution of subject.
    const subjectIdentityTruth: SubjectIdentityTruth | null = childComposition
        ? Object.keys({ ...subjectIdentityTruthBindings, ...(childBindings ?? {}) }).length
            ? { ...subjectIdentityTruthBindings, ...(childBindings ?? {}) }
            : null
        : Object.keys(subjectIdentityTruthBindings).length
          ? subjectIdentityTruthBindings
          : null;

    /*
     * AWAITED HERE — before the commit-critical context is built, which is the whole point.
     *
     * The first attempt awaited this AFTER `buildCommitCriticalOperationalContext` and folded the
     * rows only into the answer payload. Even had it run, the COMMIT context would still have
     * carried the children-less bag, the commit predicate would still have been false, and the
     * card would still have waited for the drawer — the slice would have measured as a no-op. It
     * also never used the folded value at all: the variable was declared and dropped.
     *
     * Everything above this line ran while the chain was in flight, so what the await costs is the
     * INCREMENTAL tail past the existing critical work, not the chain's ~706ms serial length.
     * `document_children_ms` is the chain; `document_children_tail_ms` is what this slice actually
     * added.
     */
    const t_children_join = now();
    const documentChildren = await documentChildrenP;
    markSpan("document_children_tail_ms", t_children_join);

    /*
     * INTO THE IDENTITY BAG, BY THE DOMAIN COMPOSER — not named by the platform builder.
     *
     * The platform work-mode builder forwards `subjectIdentityTruth` OPAQUELY and may not mention
     * a domain truth key; the boundary gate says so and rejected the first attempt, which named
     * `_inquiry_children` in the builder. The DOMAIN owns which keys exist, so the rows join the
     * bag here and reach commit truth through the path every other domain binding uses.
     *
     * `_inquiry_children` is deliberate: that IS the canonical representation at this boundary.
     * The shell writes exactly that key, the card's normalizer reads exactly that key, and the
     * commit predicate already tests it. A different name would be a second representation of one
     * truth.
     *
     * Folded ONLY when rows actually came back. Absent leaves the predicate false and the card
     * reserves exactly as before, so "not loaded" stays distinct from the authoritative `[]`.
     */
    const subjectIdentityTruthWithChildren: SubjectIdentityTruth | null = documentChildren
        ? { ...(subjectIdentityTruth ?? {}), _inquiry_children: documentChildren }
        : subjectIdentityTruth;

    // A — the published Summary composition for the committed scope. Selected with the SAME axes the
    // client doc provider sends (`workViewId` + committed stage; Business Process / status stay
    // wildcard), so the carried doc and any later client re-fetch resolve identically.
    const summaryLayoutRows = await focusPanelSummaryRowsPromise;
    const summaryRecord = summaryLayoutRows
        ? resolvePublishedFocusPanelSummaryRecord(summaryLayoutRows, {
              workViewId: contextFrame.workViewId,
              stageKey: stage.key,
          })
        : null;
    /*
     * S5-3. The client may state which published Summary records it already holds; the answer drops
     * the duplicate document only when the record IT RESOLVED for this scope is one of them.
     *
     * The comparison is `id:version`, and the server does it against its own resolution — a claim is
     * never taken as permission. That is what makes scope safe without the client having to know the
     * scope: a subject whose stage resolves a DIFFERENT published variant yields a different id, so
     * the claim cannot match and the document is included.
     *
     * Unlike department metadata (S6-1) there is no pin here to refuse: the Summary resolver reads
     * published org layouts and selects a variant, with no governing-revision overlay, so the record
     * the client holds and the record this answer resolved are the same kind of thing.
     */
    const summaryHeldByClient =
        summaryRecord != null
        && typeof summaryRecord.version === "number"
        && (req.summaryConfigHeldIds ?? []).includes(`${summaryRecord.id}:${summaryRecord.version}`);
    /*
     * P0-7.6 item 13 — WHEN, inside the compose, does the published composition become available?
     *
     * Measured from the compose's own `t0`, so it is directly comparable with every section beside
     * it. DIAGNOSTIC ONLY: nothing here decouples, flushes or streams the composition; the question
     * is only how early a later slice *could* release it.
     */
    markSpan("composition_ready", t0);
    const focusPanelSummaryDoc: FocusPanelSummaryDocProjection | null = summaryLayoutRows
        ? {
              id: summaryRecord?.id ?? null,
              version: typeof summaryRecord?.version === "number" ? summaryRecord.version : null,
              ...(summaryHeldByClient ? {} : { doc: summaryRecord?.doc ?? null }),
          }
        : null;

    /*
     * ONE CONTEXT, BUILT ONCE — the sync projection and the async card producers read the same
     * subject. Building it twice would be two answers to "who is this panel about".
     */
    const focusPanelProjectionContext = buildCommitCriticalOperationalContext({
            // Business Process and Current Work are WORK-mode cards; the mode names the
            // Focus Panel surface, not the provisioning request kind.
            mode: "work",
            subjectId: chosen.entityId,
            title: strOrNull((subjectRow as Record<string, unknown>)?.title) ?? "",
            statusLabel: currentBusinessState?.stageLabel ?? null,
            statusKey: currentBusinessState?.stageKey ?? null,
            canMutate: req.canMutate ?? false,
            perspective: null,
            stageWorkRuntime: focusPanelStageWork?.stage_work_runtime ?? null,
            // SERVER-SIDE PROJECTION INPUT. It is stripped from the answer below; the projection is
            // what travels, and it is produced here from this.
            publishedStageInputs: focusPanelStageWork?.published_stage_inputs ?? null,
            situation: currentBusinessState
                ? {
                      stageKey: currentBusinessState.stageKey,
                      stageLabel: currentBusinessState.stageLabel,
                      purpose: currentBusinessState.purpose ?? null,
                  }
                : null,
            primaryAction: primaryAction
                ? { actionRef: primaryAction.actionRef, label: primaryAction.label }
                : null,
            subjectIdentityTruth: subjectIdentityTruthWithChildren,
            /*
             * First-order lifecycle truth, carried so the Business Process card states
             * "Enrollment" and its configured rail at commit instead of "Business Process" and an
             * empty timeline until the drawer settles.
             */
            businessProcessStages: wave3Rail?.stages ?? [],
            businessProcessName: wave3ProcessName,
            subjectGrain,
    });

    /*
     * JOIN WITH A BOUNDED GRACE — overlap, never relocation.
     *
     * By here the KPI work has had the whole records/projection/enrichment branch to run in. If it
     * has landed, it travels and the client issues no request at all. If it has not, we wait only
     * a small measured grace and then ship without it: the client's existing fetch is the fallback,
     * so the worst case is today's behaviour, never a document blocked behind the KPI cost.
     * `header_kpi_wait_ms` is what this join actually added — the number to hold honest.
     */
    /*
     * TWO DIFFERENT NUMBERS, MEASURED SEPARATELY.
     *
     * `header_kpi_wait_ms` previously started at KPI EXECUTION start, so it reported 812-1,152ms
     * and read like the join cost. It was not: it was elapsed-time-to-join. The join's real cost is
     * bounded by the grace, and conflating the two hid exactly the fact that needed seeing — that
     * the resolve was starting too late, not that the join was expensive.
     *
     * `header_kpi_execution_elapsed_ms` is how long the resolve took (stamped where it completes).
     * `header_kpi_join_wait_ms` is how long the DOCUMENT actually waited here, and is bounded by
     * WORK_UNIT_HEADER_KPI_JOIN_GRACE_MS plus timer tolerance.
     */
    const tKpiJoinStart = now();
    const headerKpis = await (async (): Promise<WorkUnitHeaderKpiSeed | null> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const grace = new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), WORK_UNIT_HEADER_KPI_JOIN_GRACE_MS);
        });
        try {
            return await Promise.race([headerKpiPromise, grace]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    })();
    markSpan("header_kpi_join_wait_ms", tKpiJoinStart);
    spans.header_kpi_seeded = headerKpis && headerKpis.status === "ok" ? 1 : 0;

    const answer: ProvisioningAnswer = {
        terminal: "operational",
        orgId: req.orgId,
        workUnit,
        businessProcess: { key: process.key, name: process.name },
        activeWorkView: { id: activeView.id, label: activeView.label },
        lensSet,
        rowGrain: grain.grain,
        subjectGrain,
        rows,
        recordOfAttention: { id: chosen.entityId, strategy, strategySource: source },
        // §0.5.2: the Record of Truth may be broader than the row; the attention scope is preserved.
        // For a child the Record of Truth is the PARTICIPATION — `process_instances` is the canonical
        // child row (`docs/runtime/GRAIN-AUTHORITY-MAP.md`), and naming the opportunity here would say
        // the truth about a child lives on its family's record.
        recordOfTruth: childComposition
            ? { entityType: "process_instance", id: chosen.entityId }
            : { entityType: "opportunity", id: chosen.entityId },
        contextFrame,
        ...(() => {
            // ── 3C WIRED HERE, in the same change that removed the refusal. ──
            // `resolveFocusPanelScope` runs the lens's OPPORTUNITY-shaped predicates over the record. A
            // child row has none of those fields, so it would match nothing, and the answer would tell
            // the operator their record had moved OUT of the lens they are looking at — then offer a
            // destination chosen by the same broken comparison. Confident, navigable, fabricated.
            const scope = childComposition
                ? resolveChildGrainFocusPanelScope({
                      subject: { stageKey: childComposition.stage.key },
                      activeView,
                      workViews,
                      reader: {
                          stageKeysForView: lensStageKeys,
                          // Resolved, never guessed: a lens whose grain cannot be resolved is not a
                          // place a child can be sent, so it is not offered as a destination.
                          isChildLens: (v) => {
                              const g = resolveLensRowGrain(v, stages);
                              return g.ok && g.grain === "child";
                          },
                      },
                  })
                : resolveFocusPanelScope({
                      record: subjectRow,
                      activeView,
                      workViews,
                  });
            return {
                focusPanelScopeState: scope.kind,
                focusPanelOutOfView:
                    scope.kind === "out_of_scope"
                        ? {
                              destinationViewId: scope.destinationViewId ?? null,
                              destinationViewLabel: scope.destinationViewLabel ?? null,
                          }
                        : null,
            };
        })(),
        currentBusinessState,
        primaryAction,
        primaryActionAbsence: childComposition?.primaryActionAbsence ?? familyMissionPrimaryAbsence,
        childIdentity: childComposition?.identity ?? null,
        /*
         * THE SLICE WITHOUT ITS RAW INPUTS.
         *
         * `published_stage_inputs` was ~78,355B of published configuration — measured byte-identical
         * between consecutive subject selections — carried so the BROWSER could project the cards
         * from it. The server projects now, below, and no browser reader remains, so the
         * configuration stops travelling. The runtime halves of the slice stay: they are this
         * subject's own state, not configuration.
         */
        focusPanelStageWork: focusPanelStageWork
            ? {
                  stage_work_runtime: focusPanelStageWork.stage_work_runtime,
                  work_intent_runtime: focusPanelStageWork.work_intent_runtime,
                  published_stage_inputs: null,
              }
            : null,
        subjectIdentityTruth: subjectIdentityTruthWithChildren,
        focusPanelOperationalProjection: (() => {
            /*
             * THE PROJECTION CHOKEPOINT. One call, here, where every ingredient already exists.
             *
             * Perspective is deliberately null: no projection reads it — verified across both card
             * projectors — and inventing a server-side one would be guessing at a viewer's lens.
             */
            const startedAt = now();
            const projected = projectFocusPanelOperational({ context: focusPanelProjectionContext });
            markSpan("focus_panel_operational_projection", startedAt);
            return projected;
        })(),
        focusPanelSummaryDoc,
        /*
         * The header KPI answer, resolved during THIS composition. Absent (null) means it did not
         * land inside the join grace, which the client reads as "fetch as before" — never as zero.
         */
        headerKpis,
        presentation,
        settlement,
        actionsProjection,
        timings,
    };
    timings.composition_ms = now() - tComp;
    timings.spans = spans;
    timings.total_ms = now() - t0;
    return answer;
}

function strOrNull(v: unknown): string | null {
    return typeof v === "string" && v.length ? v : v == null ? null : String(v);
}

