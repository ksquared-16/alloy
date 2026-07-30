/**
 * WHAT STAGES A LENS FILTERS ON — one definition, importable by anyone who needs it.
 *
 * This lived inside `workUnitProvisioningAnswer.ts`. That was fine while the answer was its only
 * consumer, and stopped being fine the moment the COUNT path needed the same reading: a module that
 * counts a lens's members cannot import the answer without an import cycle, so it would have had to
 * re-derive the predicate — and two readings of "is this lens stage-scoped" is exactly how the rows
 * and the count came to disagree.
 *
 * The answer re-exports this so existing importers are unaffected.
 */

import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

/**
 * The stage keys a lens filters on. ONE reading, so the grain resolver, the child row source and the
 * child count all decide "what does this lens select" identically.
 *
 * Empty means the lens is STAGE-INDEPENDENT. It does not mean "every active stage": that reading is what
 * made a deliberately stage-independent lens resolve every stage's grain at once and refuse itself. What a
 * stage-independent lens selects is decided by its grain's own membership rule (for `child`, participation
 * membership), not by enumerating stages.
 */
export function lensStageKeys(view: WorkViewConfigV1Stored): string[] {
    return (view.filters_v1 ?? [])
        .filter((f) => f.field_key === "opportunity_stage")
        .flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value]))
        // Trim and drop empties, exactly as `stageKeysReferencedByWorkView` already does. The two are
        // the runtime's and the builder's readers of the same predicate, and "is this lens stage-scoped"
        // must not be answered differently by them: a filter carrying an empty stage value made the
        // builder offer a Row Type declaration (nothing to inherit) while the runtime believed the lens
        // was scoped to a stage key of "".
        .map((v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()))
        .filter((v) => v !== "");
}
