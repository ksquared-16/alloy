/**
 * Commercial Execution — Evaluation layer public surface.
 *
 * evaluate() / evaluateSet() consume a CommercialExport and produce a
 * consumer-neutral CommercialResolution. Pure, deterministic, side-effect-free.
 * No policy execution, no funding, no expand(), no materialization, no writes.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §3.
 */

export { evaluate, evaluateSet } from "@/lib/commercial/execution/evaluate/evaluate";
export { resolvePricing, type PricingResolution } from "@/lib/commercial/execution/evaluate/resolvePricing";
export { resolveProducts } from "@/lib/commercial/execution/evaluate/resolveProducts";
export { resolveAccounting, recognitionFor, type AccountingResolution } from "@/lib/commercial/execution/evaluate/resolveAccounting";
export { isEffective, roundCents, money, resolutionKeyFor } from "@/lib/commercial/execution/evaluate/evalUtils";
