/**
 * The canonical entry stage of a Business Process (Gate B1a).
 *
 * ## Why this had to be added rather than derived
 *
 * The question "which stage does a journey of this process begin in?" had no answer anywhere in the
 * Business Process model, and every candidate source was checked before adding one:
 *
 * | Candidate | Why it cannot answer |
 * | --- | --- |
 * | `sort_order` on stages | presentation order; the builder sorts by it for display |
 * | array order in `stages[]` | the parser re-sorts, so it is not even stable |
 * | `tracks_v1` | orders TRACKS and splits subjects between them; declares no start |
 * | transition graph (`outgoing_transitions`) | a stage with no incoming edge is not the same thing as a starting stage |
 * | `active_process_id` | selects a process, not a stage |
 * | `resolveCreateLeadEntryStageKey` | Create-Lead-specific: it looks for the LEAD operator stage, then a legacy `new_inquiry` status, then the first active stage |
 *
 * The transition graph deserves its own note, because it is the one that looks like it should work.
 * Run over Firefly's own published revision 12 it yields THREE roots — `lead`, `waitlist` and
 * `enrolling` — because a stage entered by a split rule, or only ever by an operator movement, is
 * indistinguishable from a starting stage when all you have is "no incoming edge". Picking one of
 * three would be exactly the silent guess this module exists to prevent.
 *
 * ## The shape of the declaration
 *
 * One optional scalar on the process record, `entry_stage_key`. A per-stage `is_entry` boolean was
 * rejected: two stages could carry it, and then the model would need a tie-break rule, which is an
 * ambiguity invented by the schema rather than by the operator.
 *
 * Absence is UNAUTHORED, never a default. This module refuses instead of falling back, so a tenant
 * that has not declared an entry stage gets an explicit, nameable outcome rather than a plausible
 * stage nobody chose. That is the same posture `requirements_v1` takes under D-90.
 *
 * ## What it does NOT own
 *
 * Movement. Transitions, outcome rules and stage work remain the execution authority for where a
 * journey goes; this only answers where it begins. Nothing here writes `stage_key`, and adding this
 * declaration takes no authority away from the execution graph — a journey that never leaves its
 * entry stage does so because no transition fired, not because of anything decided here.
 */

import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

export type ProcessEntryStageResolution =
    | { readonly ok: true; readonly stageKey: string; readonly stage: LifecycleBuilderStageRecord }
    /** No `entry_stage_key` authored on this process. Not an error — an unanswered question. */
    | { readonly ok: false; readonly reason: "not_declared" }
    /** Declared, but the key names no ACTIVE stage of this process. A configuration defect. */
    | { readonly ok: false; readonly reason: "declared_stage_missing"; readonly declared: string }
    | { readonly ok: false; readonly reason: "no_process" };

/**
 * Resolve the declared entry stage of one process. Reads the declaration and nothing else.
 *
 * Deliberately synchronous and dependency-free: it is called from publish validation, from the
 * participant runtime and from tests, and any of those acquiring a database read through it would
 * make the entry stage resolvable differently in different places.
 */
export function resolveDeclaredProcessEntryStage(
    process: LifecycleBuilderProcessRecord | null | undefined,
): ProcessEntryStageResolution {
    if (!process) return { ok: false, reason: "no_process" };

    const declared = (process.entry_stage_key ?? "").trim();
    if (!declared) return { ok: false, reason: "not_declared" };

    // ACTIVE only. A deactivated stage is not somewhere a new journey may begin, and treating one
    // as the entry point would start families in a stage the operator has retired.
    const stage = process.stages.find((s) => s.key === declared && s.is_active);
    if (!stage) return { ok: false, reason: "declared_stage_missing", declared };

    return { ok: true, stageKey: declared, stage };
}

/**
 * The stage a running journey is effectively in, for configuration lookups.
 *
 * `process_instances.stage_key` stays NULL at creation — see the process-start decision in
 * `docs/runtime/BUSINESS-PROCESS-ENTRY-STAGE.md`. A journey that has not yet been moved is
 * nonetheless governed by its entry stage's configuration, and this is the one place that says so.
 *
 * Order matters and is not a preference: a persisted `stage_key` is where the journey ACTUALLY is,
 * so it always wins. The declaration answers only for a journey that has not moved yet.
 */
export function resolveEffectiveStageKey(input: {
    readonly persistedStageKey: string | null | undefined;
    readonly process: LifecycleBuilderProcessRecord | null | undefined;
}): string | null {
    const persisted = (input.persistedStageKey ?? "").trim();
    if (persisted) return persisted;

    const entry = resolveDeclaredProcessEntryStage(input.process);
    return entry.ok ? entry.stageKey : null;
}
