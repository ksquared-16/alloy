/**
 * Where a journey begins — the one resolver (Gate B1a, superseded in shape by D-103).
 *
 * ## Why this is declared rather than derived
 *
 * The question "which stage does a journey of this process begin in?" had no answer in the Business
 * Process model, and every candidate source was checked before adding one:
 *
 * | Candidate | Why it cannot answer |
 * | --- | --- |
 * | `sort_order` on stages | presentation order; the builder sorts by it for display |
 * | array order in `stages[]` | the parser re-sorts, so it is not even stable |
 * | `tracks_v1` | orders TRACKS and splits subjects between them; declares no start |
 * | transition graph (`outgoing_transitions`) | see below |
 * | `active_process_id` | selects a process, not a stage |
 * | `resolveCreateLeadEntryStageKey` | answers a DIFFERENT question — see "not a competing authority" |
 *
 * The transition graph deserves its own note, because it is the one that looks like it should work.
 * Run over Firefly's own published revision 12 it yields THREE roots — `lead`, `waitlist` and
 * `enrolling` — because a stage entered by a split rule, or only ever by an operator movement, is
 * indistinguishable from a starting stage when all you have is "no incoming edge". Picking one of
 * three would be exactly the silent guess this module exists to prevent.
 *
 * ## D-103 — the answer is per INTENT, not per process
 *
 * B1a declared `entry_stage_key`: one stage for the whole process. That collapsed two legitimate
 * initiations of the same Enrollment process — Create Lead begins an acquisition episode at `lead`,
 * Start Enrollment begins paperwork for a durable child at `enrolling` — and whichever stage the
 * scalar named was wrong for the other.
 *
 * The scalar is GONE, not deprecated. It was added days earlier, has no authored production usage
 * anywhere (no tenant, seed, template or migration writes it), and keeping it would leave two
 * authorities answering one question. `entry_points_v1` is the single authority.
 *
 * ## Not a competing authority: `resolveCreateLeadEntryStageKey`
 *
 * That function's `entry_stage_key` output names the stage whose WORK UNIT a new lead's Opportunity
 * is routed to, together with its status key. It is about queue routing for an Opportunity, not about
 * where a child's process instance begins — and its own consumers
 * (`resolveCreateLeadEntryDepartment`, `lifecycleRuntimeBinding`) read `work_unit_id`, `status_key`
 * and `activation` and drop the stage entirely. Nothing in production reads it. There is one
 * process-entry authority, and this is it.
 *
 * ## What this does NOT own
 *
 * Movement. Transitions, outcome rules and stage work remain the execution authority for where a
 * journey goes; this only answers where it begins. Nothing here writes `stage_key`.
 */

import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { ProcessEntryIntentV1 } from "@/lib/lifecycle/processEntryPointsV1";

export type ProcessEntryStageResolution =
    | { readonly ok: true; readonly stageKey: string; readonly stage: LifecycleBuilderStageRecord }
    /** No `entry_points_v1` authored at all. Not an error — an unanswered question. */
    | { readonly ok: false; readonly reason: "not_declared" }
    /** Entry points authored, but this intent is not among them. */
    | { readonly ok: false; readonly reason: "intent_not_mapped"; readonly intent: ProcessEntryIntentV1 }
    /** Mapped, but the key names no ACTIVE stage of this process. A configuration defect. */
    | {
          readonly ok: false;
          readonly reason: "declared_stage_missing";
          readonly intent: ProcessEntryIntentV1;
          readonly declared: string;
      }
    | { readonly ok: false; readonly reason: "no_process" };

/**
 * Resolve the stage this process begins in FOR ONE INTENT. Reads the declaration and nothing else.
 *
 * Deliberately synchronous and dependency-free: publish validation, the participant runtime and tests
 * all call it, and any of them acquiring a database read through it would make the entry stage
 * resolvable differently in different places.
 */
export function resolveProcessEntryStage(
    process: LifecycleBuilderProcessRecord | null | undefined,
    intent: ProcessEntryIntentV1,
): ProcessEntryStageResolution {
    if (!process) return { ok: false, reason: "no_process" };

    const entryPoints = process.entry_points_v1;
    if (!entryPoints) return { ok: false, reason: "not_declared" };

    const declared = (entryPoints.by_intent[intent] ?? "").trim();
    // An intent nobody mapped is NOT the other intent's stage. Refusing here is what keeps Create
    // Lead from inheriting Start Enrollment's stage and the reverse.
    if (!declared) return { ok: false, reason: "intent_not_mapped", intent };

    // ACTIVE only. A deactivated stage is not somewhere a new journey may begin, and treating one as
    // an entry point would start families in a stage the operator has retired.
    const stage = process.stages.find((s) => s.key === declared && s.is_active);
    if (!stage) return { ok: false, reason: "declared_stage_missing", intent, declared };

    return { ok: true, stageKey: declared, stage };
}

/**
 * The stage a running journey is effectively in, for configuration lookups.
 *
 * `process_instances.stage_key` stays NULL at creation — see the process-start decision in
 * `docs/runtime/BUSINESS-PROCESS-ENTRY-STAGE.md`. A journey that has not been moved is nonetheless
 * governed by its own entry stage's configuration, and this is the one place that says so.
 *
 * Order matters and is not a preference: a persisted `stage_key` is where the journey ACTUALLY is, so
 * it always wins. The declaration answers only for a journey that has not moved yet.
 */
export function resolveEffectiveStageKey(input: {
    readonly persistedStageKey: string | null | undefined;
    readonly process: LifecycleBuilderProcessRecord | null | undefined;
    /** The intent the journey was created with — from `process_instances.metadata.source`. */
    readonly intent: ProcessEntryIntentV1;
}): string | null {
    const persisted = (input.persistedStageKey ?? "").trim();
    if (persisted) return persisted;

    const entry = resolveProcessEntryStage(input.process, input.intent);
    return entry.ok ? entry.stageKey : null;
}
