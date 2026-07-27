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

type Vm = OpportunityDrawerViewModel;

/** Per-module server phase timings; the orchestrator merges them into `timing.phases_ms` (exact keys preserved). */
export type ComposePhaseTimings = Record<string, number>;

/**
 * Module C — data BOTH A and B read. Kept narrow: identity, the layout/shell, the workspace identity
 * fields, and the once-resolved deptMetadata/statusDefs/lifecycle inputs. Neither A nor B re-fetches these.
 */
export type SharedCanonicalDeps = {
    orgId: string;
    opportunityId: string;
    /** Base visible payload (mutable baseline the tiers patch; snapshot+stripped ONCE by the orchestrator). */
    record: Record<string, unknown>;
    layout: Vm["layout"];
    /** → VM.generation input. */
    layoutVersion: string;
    workspaceIdentity: Pick<Vm["workspace"], "department_id" | "work_unit_id" | "queue_definition">;
    lifecycle_rail: Vm["workspace"]["lifecycle_rail"];
    /** Once-resolved inputs passed by value (A: readiness/attention/header; B: stage_context/stage_work). */
    deptMetadata: Record<string, unknown> | null;
    statusDefs: unknown[];
    statusKey: string | null;
    currentStageKey: string | null;
    currentStageLabel: string | null;
};

/**
 * Module A — Tier-2 (visible Summary panel enrichment). Carries `tasks_raw` (UNFILTERED — the residual
 * filter needs B's stage-work, so the orchestrator owns it) and `record_patches` for the attention bundle
 * ONLY (NOT scheduling — that is Tier-3/B). Imports no Tier-3.
 */
export type InitialPanelResource = {
    header: Vm["header"];
    actions: Vm["actions"];
    first_paint: Vm["first_paint"];
    above_fold: Vm["above_fold"];
    summaries: Omit<Vm["summaries"], "tasks"> & { tasks_raw: Vm["summaries"]["tasks"] };
    /** Attention-bundle patches to the shared record (e.g. `_operational_attention`). NOT scheduling. */
    record_patches: Record<string, unknown>;
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
