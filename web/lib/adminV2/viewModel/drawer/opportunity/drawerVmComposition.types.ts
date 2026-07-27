/**
 * CP-1 / S4 — the three owned composition contracts (D-013; see docs/runtime/cp1-s4-decomposition-plan.md).
 *
 * The opportunity enriched drawer VM is composed from THREE modules with a REAL import boundary:
 *   - Shared canonical deps (C)  — identity + inputs BOTH tiers read (narrow; no dumping ground).
 *   - Initial Panel resource (A)  — Tier-2 only: the genuinely-new data the visible Summary panel needs.
 *   - Deferred Detail resource (B) — Tier-3 only: deep/deferred data, loaded independently.
 *
 * Module A must import NO Tier-3 implementation (enforced by `drawerVmCompositionBoundaries.test.ts`).
 * The orchestrator (`composeOpportunityDrawerViewModel`) owns the cross-tier joins (tasks filter,
 * scheduling→first_paint merge, single record snapshot) — see the plan's §5/§6.
 *
 * Contracts are derived by indexed access from `OpportunityDrawerViewModel` so they cannot drift from the
 * shipped VM shape; only `tasks` splits (A carries `tasks_raw`; the orchestrator produces `summaries.tasks`).
 */
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

type Vm = OpportunityDrawerViewModel;

/** Per-module server phase timings; the orchestrator merges them into `timing.phases_ms` (exact keys preserved). */
export type ComposePhaseTimings = Record<string, number>;

/**
 * Module C — data BOTH A and B read (the shared DATA foundation). Kept narrow: identity, the raw layout
 * inputs, the workspace identity fields, and the once-resolved deptMetadata/statusDefs/lifecycle inputs.
 * Neither A nor B re-fetches these. (Shell compilation + first-viewport plan are NOT here — they consume C
 * and are owned by A / the orchestrator; C is data, not layout assembly.)
 */
export type SharedCanonicalDeps = {
    orgId: string;
    opportunityId: string;
    /** Base visible payload (mutable baseline the tiers patch; snapshot+stripped ONCE by the orchestrator). */
    record: Record<string, unknown>;
    departmentId: string | null;
    workUnitId: string | null;
    /** Raw layout config the shell compiles from (owned downstream, not in C). */
    layoutConfigJson: RecordLayoutConfigJson;
    /** → VM.generation input. */
    layoutVersion: string;
    /** Raw `work_units.queue_definition` JSON → VM.workspace.queue_definition. */
    queueDefinitionRaw: unknown;
    /** Coerced queue definition for the first-paint deps. */
    queueDefinition: QueueDefinitionV1 | null;
    /** Raw `work_units.metadata` — first-paint deps + lifecycle inputs. */
    wuMetadata: unknown;
    /** Once-resolved inputs passed by value (A: readiness/attention/header; B: stage_context/stage_work). */
    deptMetadata: Record<string, unknown> | null;
    statusDefs: StatusDefinitionRow[];
    statusKey: string | null;
    lifecycle_rail: Vm["workspace"]["lifecycle_rail"];
    currentStageKey: string | null;
    currentStageLabel: string | null;
    phases_ms: ComposePhaseTimings;
};

/**
 * Module A — Tier-2 (visible Summary panel enrichment). Carries `tasks_raw` (UNFILTERED — the residual
 * filter needs B's stage-work, so the orchestrator owns it) and `record_patches` for the attention bundle
 * ONLY (NOT scheduling — that is Tier-3/B). Imports no Tier-3.
 */
export type InitialPanelResource = {
    header: Vm["header"];
    actions: Vm["actions"];
    layout: Vm["layout"];
    first_paint: Vm["first_paint"];
    /**
     * A produces the above-fold RENDER MODEL only. The orchestrator snapshots + strips `above_fold.record`
     * ONCE, AFTER Tier-3 (B) record patches land — so the paint record is complete regardless of tier order.
     */
    aboveFoldRenderModel: Vm["above_fold"]["render_model"];
    summaries: Omit<Vm["summaries"], "tasks"> & { tasks_raw: Vm["summaries"]["tasks"] };
    phases_ms: ComposePhaseTimings;
};

/**
 * Module B — Tier-3 (deep/deferred). The workspace deep-runtime fields, activity comms preview, and the
 * scheduling projection. `record_patches` carries `_scheduling_projection` / `_stage_work_runtime` /
 * `_work_intent_runtime`, applied by the orchestrator before the single record snapshot.
 */
export type DeferredDetailResource = {
    workspace_detail: Pick<
        Vm["workspace"],
        "stage_context" | "work_intent_runtime" | "stage_work_runtime" | "published_stage_inputs" | "stage_work"
    >;
    activity: Vm["activity"];
    scheduling_projection: { byMemberId: Record<string, unknown>; asOf: string } | null;
    record_patches: Record<string, unknown>;
    phases_ms: ComposePhaseTimings;
};
