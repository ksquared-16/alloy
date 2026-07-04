/**
 * Commercial Execution Platform — public surface (barrel + API contract types).
 *
 * The public surface is intentionally tiny: two evaluation primitives and one
 * temporal expander. Internal stages (Export → Resolver → Policy → Funding →
 * Resolution) stay private and replaceable.
 *
 *   evaluate()      — one subject / enrollment / quote / projected seat
 *   evaluateSet()   — group evaluation (relational: siblings, family caps,
 *                     corporate/volume, scholarships, household, cohort)
 *   expand()        — resolution → dated occurrences (shared temporal engine)
 *
 * `materialize()` is NOT part of this surface — each consumer implements its own
 * over the neutral CommercialSchedule (keeps every Billing concept out of the
 * platform).
 *
 * Phase 2 exports the API as function TYPES; the implementations arrive in later
 * phases (evaluate=P4, policy=P5, funding=P6, expand=P7). Nothing here executes.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §3, §6.
 */

export * from "@/lib/commercial/execution/executionTypes";
export * from "@/lib/commercial/execution/explanation";
export * from "@/lib/commercial/execution/funding";
export * from "@/lib/commercial/execution/commercialExport";
export * from "@/lib/commercial/execution/schedule";

import type { CommercialContext, CommercialResolution } from "@/lib/commercial/execution/executionTypes";
import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import type { CommercialSchedule, DateRange } from "@/lib/commercial/execution/schedule";

/** How a set of contexts relates, so relational policies apply across the group. */
export type RelationalScope = {
    /** e.g. "household" | "cohort" | "corporate_account". */
    kind: string;
    /** Opaque id of the relating entity (the household, cohort, or account). */
    id: string;
};

/** evaluate(): one Commercial Context → one Commercial Resolution. Pure. */
export type EvaluateFn = (context: CommercialContext, cfg: CommercialExport) => CommercialResolution;

/** evaluateSet(): a related group → one Resolution each, with cross-subject policy applied. Pure. */
export type EvaluateSetFn = (
    contexts: CommercialContext[],
    group: RelationalScope,
    cfg: CommercialExport,
) => CommercialResolution[];

/** expand(): a Resolution → a dated timeline over a horizon. Pure, platform-owned. */
export type ExpandFn = (resolution: CommercialResolution, horizon: DateRange) => CommercialSchedule;

/** attribute(): decorate a Resolution's lines with per-payer funding. Pure; never changes net. */
export type AttributeFn = (resolution: CommercialResolution, plan: import("@/lib/commercial/execution/funding").FundingPlan) => CommercialResolution;

// ── Implementations (Phase 4: evaluate/evaluateSet; Phase 6: attribute; expand()=Phase 7) ──
export { evaluate, evaluateSet } from "@/lib/commercial/execution/evaluate/evaluate";
export { attribute, attributeLine } from "@/lib/commercial/execution/fundingAttribute";
