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
    listWorkUnitHeaderLayoutRecords,
    type OperationalPresentation,
} from "./operationalPresentation";
import { resolveQueueRowLayoutServer } from "@/lib/layout/runtime/queueRowLayoutServer";
import { attachEffectiveEnrollmentStagesToOpportunityRows } from "@/lib/process/definitions/enrollment/attachEffectiveEnrollmentStagesToOpportunityRows";
import { attachActiveTourFactsToOpportunityRows } from "@/lib/tours/queue/attachActiveTourFactsToOpportunityRows";
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
export type FocusPanelSummaryDocProjection = { doc: LayoutDoc | null };

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
          /** A — commit-critical subject identity truth bindings, domain-declared + opaque to the platform (see {@link SubjectIdentityTruth}). */
          subjectIdentityTruth: SubjectIdentityTruth | null;
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
                .select("id, key, name, department_id, is_active, sort_order, queue_definition")
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
    // ── U-P7: resolve the operational presentation composition server-side, into THIS answer. ──
    // An identifier would be the round-trip U-P7 exists to remove; resolving here means the first
    // visible frame is already in final layout and nothing re-lays out after commit.
    // COLD-PATH PARALLELISM: the presentation composition (header + queue-row surface) is INDEPENDENT of
    // records / projection / enrichment — those never read `presentation`; the two branches join only at
    // answer assembly. Kick presentation off here so it runs CONCURRENTLY with the record projection +
    // enrichment branch below, and await it at the join. Still ONE atomic answer — internal read reordering.
    const tPres = now();
    const queueRowSurfaceId = queueRowSurfaceIdForDepartment(String(wuRow.department_id), deptRow?.metadata);
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
            cachedConfigRead(`hdr:${req.orgId}:`, () =>
                listWorkUnitHeaderLayoutRecords(req.supabase, req.orgId),
            ).catch(() => null),
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
        const baseWithEpp = await attachEffectiveEnrollmentStagesToOpportunityRows({
            supabase: req.supabase,
            orgId: req.orgId,
            rows: (baseRows ?? []) as Array<Record<string, unknown>>,
            logLabel: "provisioning",
        });
        // Active Tour facts before Work View predicates — family-grain Tours lenses filter on
        // operational booking truth (`has_active_tour`), not stage_key alone.
        const baseWithTourFacts = await attachActiveTourFactsToOpportunityRows({
            supabase: req.supabase,
            orgId: req.orgId,
            rows: baseWithEpp,
            logLabel: "provisioning",
        });
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
        return fail(
            "subject_unavailable",
            `the requested subject is not present in this work unit's evaluated page — refusing to substitute a different subject`,
            workUnit,
            navFrame,
        );
    }
    const chosen =
        requested ??
        resolveDefaultOperationalSubject(subjectRows, strategy, { currentUserId: req.currentUserId ?? null });
    if (!chosen) {
        // Rows exist but no subject could be chosen — honest, never a fabricated subject.
        return fail(
            "subject_unavailable",
            "the configured strategy resolved no subject from the evaluated page",
            workUnit,
            navFrame,
        );
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
            workUnitId: workUnit.id,
            workUnitMetadata: (wuRow as { metadata?: unknown }).metadata ?? null,
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
            return fail("no_truthful_primary_action", composed.reason, workUnit, navFrame);
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
            return fail(
                "no_truthful_primary_action",
                `subject holds no resolvable Mission stage (context="${contextStageKey}", epp=[${mission.missionStageKeys.join(",")}])`,
                workUnit,
                navFrame,
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
            return fail("no_truthful_primary_action", operability.reason, workUnit, navFrame);
        }

        const foundPlan = found.stage_operating_plan_v1 ?? null;
        const template = foundPlan?.work_templates?.find((t) => t.primary) ?? foundPlan?.work_templates?.[0] ?? null;
        const actionRef = template?.primary_action?.action_ref ?? null;
        if (!foundPlan || !template) {
            // Unreachable — the operability rule above already refused exactly this case. Kept as a
            // type narrowing so it can never silently degrade into a different answer.
            return fail(
                "no_truthful_primary_action",
                `stage "${found.key}" offers no work templates — the answer will not claim operational on identity alone`,
                workUnit,
                navFrame,
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
          }).catch(() => null /* stage-work is additive to the commit — never fail the operational answer on it */);

    // ── JOIN: enrichment (queue rows) + presentation + actions + stage-work, all kicked off above. ──
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
    const subjectIdentityTruthBindings: SubjectIdentityTruth = {
        ...(primaryContactName ? { "person.primary_contact_name": primaryContactName } : {}),
        ...(primaryContactPhone ? { "person.primary_phone": primaryContactPhone } : {}),
        ...(primaryContactEmail ? { "person.primary_email": primaryContactEmail } : {}),
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
        ? childSubjectIdentityTruthBindings(childComposition, childSubjectRow?.title ?? null)
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

    // A — the published Summary composition for the committed scope. Selected with the SAME axes the
    // client doc provider sends (`workViewId` + committed stage; Business Process / status stay
    // wildcard), so the carried doc and any later client re-fetch resolve identically.
    const summaryLayoutRows = await focusPanelSummaryRowsPromise;
    const focusPanelSummaryDoc: FocusPanelSummaryDocProjection | null = summaryLayoutRows
        ? {
              doc:
                  resolvePublishedFocusPanelSummaryRecord(summaryLayoutRows, {
                      workViewId: contextFrame.workViewId,
                      stageKey: stage.key,
                  })?.doc ?? null,
          }
        : null;

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
        focusPanelStageWork,
        subjectIdentityTruth,
        focusPanelSummaryDoc,
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

