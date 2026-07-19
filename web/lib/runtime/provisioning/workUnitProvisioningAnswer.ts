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
import {
    loadSettlementLocators,
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
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    resolveOpportunityStageWorkSlice,
    type OpportunityStageWorkSlice,
} from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";

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
};

/** U-O1 orientation: the active lens indicated among its lens set. Identity only — NO counts. */
export type LensSetEntry = { id: string; label: string; displayOrder: number };

export type CurrentBusinessState = {
    stageKey: string;
    stageLabel: string;
    /** Why this stage exists — the Situation half of Situation → Decision → Action. */
    purpose: string | null;
    /** The required primary work at this stage. */
    workTemplateKey: string;
    workTemplateLabel: string;
    required: boolean;
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
};

const EMPTY_ACTIONS_PROJECTION: WorkUnitActionsProjection = { count: 0, actions: [] };

/**
 * COMMIT-CRITICAL SUBJECT SNAPSHOT (A — preparation completeness). The default subject's
 * first-operational relationship identity — primary contact reachability + the children roster —
 * carried in the answer so the committed Focus Panel renders Household + Children as MEANINGFUL cards
 * at commit, not blank reserved rectangles. Sourced entirely from data the composer already resolved
 * for the subject row (enriched primary contact + the row's `metadata.inquiry_children`) — NO extra
 * DB read. Deeper family (secondary parents, emergency, address) + per-child settlement detail remain
 * Settlement (the drawer VM fills them in place).
 */
export type FocusPanelSubjectSnapshot = {
    primaryContact: { name: string | null; phone: string | null; email: string | null };
    /** Raw `opportunity.metadata.inquiry_children` — the Children card's `truth._inquiry_children`. */
    inquiryChildren: unknown;
};

export type ProvisioningAnswer =
    | {
          terminal: "operational";
          /** U-P1 authorization + canonical identifiers. */
          orgId: string;
          workUnit: { id: string; key: string; name: string };
          /** U-O1 Business Process identity required for orientation. */
          businessProcess: { key: string; name: string };
          /** U-P2 active lens + its set. */
          activeWorkView: { id: string; label: string };
          lensSet: LensSetEntry[];
          /** §0.5.1/§6 — explicit, Stage-owned. */
          rowGrain: RowGrain;
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
          currentBusinessState: CurrentBusinessState;
          primaryAction: TruthfulPrimaryAction;
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
          /** A — commit-critical Household + Children snapshot (see {@link FocusPanelSubjectSnapshot}). */
          focusPanelSubjectSnapshot: FocusPanelSubjectSnapshot | null;
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
          rows: [];
          /** U-O6: an empty lens has no subject to commit; lens switching stays reachable. */
          recordOfAttention: null;
          contextFrame: { workViewId: string; workViewLabel: string };
          focusPanelScopeState: FocusPanelScopeStateKind;
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
          timings: ProvisioningTimings;
      };

export type ProvisioningErrorCode =
    | "unauthorized"
    | "work_unit_not_found"
    | "no_business_process"
    | "no_active_view"
    | "grain_ambiguous"
    | "subject_unavailable"
    | "no_truthful_primary_action"
    | "records_unavailable";

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
};

const now = () => performance.now();

export type ProvisioningRequest = {
    supabase: SupabaseClient;
    /** U-P1 — resolved ONCE by the caller's route gate; never re-resolved inside. */
    orgId: string;
    currentUserId?: string | null;
    workUnitSlug: string;
    /** Attention is an INPUT, never derived from the route inside this resource (K1 owns intent). */
    requestedWorkViewId?: string | null;
    requestedSubjectId?: string | null;
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
export function resolveLensRowGrain(
    view: WorkViewConfigV1Stored,
    stages: readonly LifecycleBuilderStageRecord[],
): { ok: true; grain: RowGrain } | { ok: false; reason: string } {
    const stageKeys = (view.filters_v1 ?? [])
        .filter((f) => f.field_key === "opportunity_stage")
        .flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value]))
        .map((v) => String(v));

    const scoped = stageKeys.length
        ? stages.filter((s) => stageKeys.includes(s.key))
        : stages; // no stage predicate → the lens spans every active stage

    const grains = [...new Set(scoped.map((s) => s.grain).filter((g): g is StageGrain => !!g))];
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
    const fail = (code: ProvisioningErrorCode, message: string, wu: ProvisioningAnswer extends never ? never : { id: string; key: string; name: string } | null = null): ProvisioningAnswer => {
        timings.total_ms = now() - t0;
        return { terminal: "error", code, message, orgId: req.orgId ?? null, workUnit: wu, timings };
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
            .select("id, key, name, org_id, department_id, queue_definition")
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
    const workUnit = { id: String(wuRow.id), key: String(wuRow.key), name: String(wuRow.name) };

    // ── COLD-PATH PARALLELISM: the operational records depend ONLY on work_unit.id (available now), not on
    //    configuration, queue-layout, or presentation. Kick the fetch off here so it overlaps that whole
    //    independent branch; it is awaited at the projection join below. This is still ONE atomic Preparation
    //    answer — an internal read reordering, never a second round-trip. Supabase returns errors in-band
    //    (no rejection), so an early return that never awaits this promise cannot leak an unhandled rejection.
    const recordsPromise = (async () =>
        req.supabase
            .from("opportunities")
            .select("id, org_id, work_unit_id, status_key, stage_key, updated_at, name, title, metadata, primary_person_id, location_id, customer_id")
            .eq("org_id", req.orgId)
            .eq("work_unit_id", workUnit.id)
            .limit(500))();

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

    // U-P2: active lens. Attention is an input (K1 owns intent); the route never derives it here.
    const activeView =
        findWorkViewById(workViews, req.requestedWorkViewId) ?? firstVisibleWorkView(workViews);
    timings.configuration_ms = now() - tCfg;
    if (!activeView) {
        // No lens at all is not an error — it is an honest, nameable scope state.
        return fail("no_active_view", "no Work View is configured for this Business Process", workUnit);
    }

    const lensSet: LensSetEntry[] = workViews.map((v, i) => ({
        id: v.id,
        label: v.label,
        displayOrder: v.display_order ?? i,
    }));
    const contextFrame = { workViewId: activeView.id, workViewLabel: activeView.label };

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
    const actionsProjectionPromise: Promise<WorkUnitActionsProjection> = wuRow.department_id
        ? cachedConfigRead(`act:${req.orgId}:${workUnit.id}`, () =>
              loadRightRailActionsBundleServer({
                  orgId: req.orgId,
                  departmentId: String(wuRow.department_id),
                  workUnitId: workUnit.id,
              }),
          )
              .then((actions) => ({ count: actions.length, actions }))
              .catch(() => EMPTY_ACTIONS_PROJECTION)
        : Promise.resolve(EMPTY_ACTIONS_PROJECTION);
    void actionsProjectionPromise.catch(() => {});

    // ── §6: Row Grain explicit, Stage-owned. Grain-ambiguous config is refused honestly. ──
    const grain = resolveLensRowGrain(activeView, stages);
    if (!grain.ok) return fail("grain_ambiguous", `Work View "${activeView.label}": ${grain.reason}`, workUnit);

    // ── Stage Membership: base rows, Work Unit scoped, bounded. Persisted stage_key IS membership. ──
    // Awaited here at the projection join — the fetch was kicked off at gesture-entry (above) so it ran
    // CONCURRENTLY with configuration + queue-layout + presentation. `records_ms` now measures the residual
    // wait (near-zero when it has already resolved), which is exactly the overlap we bought.
    const tRec = now();
    const { data: baseRows, error: rowErr } = await recordsPromise;
    timings.records_ms = now() - tRec;
    if (rowErr) return fail("records_unavailable", `records unavailable: ${rowErr.message}`, workUnit);

    // ── ONE Operational Projection. The lens is evaluated exactly once. ──
    const tProj = now();
    const projection = computeOperationalProjection({
        baseRows: (baseRows ?? []) as OperationalProjectionRow[],
        workViews: [activeView], // only the active lens — no count fan-out, no second evaluation
    });
    const admitted = projection.byViewId[activeView.id]?.rows ?? [];
    const ordered = applyCanonicalWorkViewSort(admitted, activeView);
    const page = ordered.slice(0, PROVISIONING_ROW_PAGE_CAP);
    timings.projection_ms = now() - tProj;

    const tComp = now();
    // U-O2 enrichment over the BOUNDED PAGE only — cost scales with what the operator can see.
    // Additive: the page in is the page out, in the same canonical order. Membership was decided
    // upstream by the projection and is never re-evaluated here.
    const enriched = await enrichOperationalProjectionRows({
        supabase: req.supabase,
        orgId: req.orgId,
        rows: page as unknown as EnrichableProjectionRow[],
        queue: {
            key: activeView.id,
            label: activeView.label,
            lifecycle_key: process.key,
            subject_grain: "case",
        },
    });
    const rows: ProvisioningRow[] = enriched.map((r) => ({
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
    // B: the actions projection ran concurrently above — join it here (no serial latency added).
    const actionsProjection = await actionsProjectionPromise;

    // ── U-O6 AUTHORITATIVE EMPTY — a workable place, never confused with error. ──
    if (rows.length === 0) {
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
            rows: [],
            recordOfAttention: null,
            contextFrame,
            focusPanelScopeState: resolveFocusPanelScope({ record: null, activeView }).kind,
            presentation,
            settlement,
            actionsProjection,
            timings,
        };
    }

    // ── U-P4/U-O3 Record of Attention — from the SAME evaluated page. No second evaluator. ──
    const { strategy, source } = resolveSubjectStrategy(activeView);
    const subjectRows: OperationalSubjectQueueRow[] = page.map((r, i) => ({
        id: String((r as Record<string, unknown>).id),
        entityId: String((r as Record<string, unknown>).id),
        entityType: "opportunity",
        sortIndex: i,
    }));
    const requested = req.requestedSubjectId
        ? subjectRows.find((s) => s.entityId === req.requestedSubjectId) ?? null
        : null;
    const chosen =
        requested ??
        resolveDefaultOperationalSubject(subjectRows, strategy, { currentUserId: req.currentUserId ?? null });
    if (!chosen) {
        // Rows exist but no subject could be chosen — honest, never a fabricated subject.
        return fail("subject_unavailable", "the configured strategy resolved no subject from the evaluated page", workUnit);
    }
    const subjectRow = page.find((r) => String((r as Record<string, unknown>).id) === chosen.entityId)!;
    const subjectStageKey = strOrNull((subjectRow as Record<string, unknown>).stage_key);

    // ── U-P5/U-O4 current business state + U-O5 truthful primary action. Identity alone is NOT operational. ──
    const stage = stages.find((s) => s.key === subjectStageKey) ?? null;
    if (!stage) {
        return fail("no_truthful_primary_action", `subject holds stage "${subjectStageKey}" which is not an active configured stage`, workUnit);
    }
    const plan = stage.stage_operating_plan_v1 ?? null;
    const template = plan?.work_templates?.find((t) => t.primary) ?? plan?.work_templates?.[0] ?? null;
    const actionRef = template?.primary_action?.action_ref ?? null;
    if (!plan || !template || !actionRef) {
        return fail(
            "no_truthful_primary_action",
            `stage "${stage.key}" offers no reachable primary action — the answer will not claim operational on identity alone`,
            workUnit,
        );
    }

    // ── COMMIT-CRITICAL FOCUS PANEL — the answer OWNS the operational Current Work projection. ──
    // Progress + requirements + blocked/status are part of Situation→Decision→Action, so the useful
    // Focus Panel commits WITH Header + Queue from the answer alone; the drawer VM only enriches the
    // surrounding Settlement cards afterward. Additive and non-fatal: any failure degrades to the
    // client drawer-VM load, never an operational error. `departmentMetadata` is already in hand.
    let focusPanelStageWork: OpportunityStageWorkSlice | null = null;
    try {
        focusPanelStageWork = await resolveOpportunityStageWorkSlice({
            supabase: req.supabase,
            orgId: req.orgId,
            opportunityId: chosen.entityId,
            departmentId: wuRow.department_id ? String(wuRow.department_id) : null,
            stageKey: stage.key,
            stageLabel: stage.label,
            departmentMetadata: deptRow?.metadata,
        });
    } catch {
        /* stage-work is additive to the commit — never fail the operational answer on it */
    }

    // A — COMMIT-CRITICAL SUBJECT SNAPSHOT. The default subject's Household + Children first-operational
    // identity, from data ALREADY resolved for its row: the enriched queue-row `primary_contact` and the
    // row's `metadata.inquiry_children`. No extra DB read. Lets the committed Focus Panel render Household
    // and Children as MEANINGFUL cards, not blank reserved rectangles.
    const chosenRowContext = (rows.find((r) => r.id === chosen.entityId)?.context ?? {}) as Record<string, unknown>;
    const chosenPrimaryContact = (chosenRowContext.primary_contact ?? {}) as Record<string, unknown>;
    const subjectMetadata = (subjectRow as Record<string, unknown>).metadata as Record<string, unknown> | null | undefined;
    const focusPanelSubjectSnapshot: FocusPanelSubjectSnapshot = {
        primaryContact: {
            name: strOrNull(chosenPrimaryContact.display_name),
            phone: strOrNull(chosenPrimaryContact.phone),
            email: strOrNull(chosenPrimaryContact.email),
        },
        inquiryChildren: subjectMetadata?.inquiry_children ?? null,
    };

    const answer: ProvisioningAnswer = {
        terminal: "operational",
        orgId: req.orgId,
        workUnit,
        businessProcess: { key: process.key, name: process.name },
        activeWorkView: { id: activeView.id, label: activeView.label },
        lensSet,
        rowGrain: grain.grain,
        rows,
        recordOfAttention: { id: chosen.entityId, strategy, strategySource: source },
        // §0.5.2: the Record of Truth may be broader than the row; the attention scope is preserved.
        recordOfTruth: { entityType: "opportunity", id: chosen.entityId },
        contextFrame,
        focusPanelScopeState: resolveFocusPanelScope({ record: subjectRow, activeView }).kind,
        currentBusinessState: {
            stageKey: stage.key,
            stageLabel: stage.label,
            purpose: plan.purpose ?? null,
            workTemplateKey: template.template_key,
            workTemplateLabel: template.label,
            required: template.required,
        },
        primaryAction: {
            actionRef,
            label: template.primary_action?.override_label ?? template.label,
            workTemplateKey: template.template_key,
        },
        focusPanelStageWork,
        focusPanelSubjectSnapshot,
        presentation,
        settlement,
        actionsProjection,
        timings,
    };
    timings.composition_ms = now() - tComp;
    timings.total_ms = now() - t0;
    return answer;
}

function strOrNull(v: unknown): string | null {
    return typeof v === "string" && v.length ? v : v == null ? null : String(v);
}

