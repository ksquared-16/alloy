/**
 * Pure stage-level mutations of a Business Process draft (Law 4, editor slice 1).
 *
 * Every function here takes a parsed `LifecycleBuilderV1` and returns a new one. None of them
 * touches Supabase, re-reads anything, or writes durable state — which is what lets the stage save
 * apply four or five independent edits to ONE in-memory builder and persist it exactly once.
 * Previously each of these lived inside its own `persist…ForLifecycleStageSave` helper that issued
 * its own whole-column `UPDATE departments`, so a single stage save was 4-6 sequential writes with
 * no CAS between them — the torn-stage failure documented in
 * docs/platform/governance/business-process-stage-save-decomposition.md.
 *
 * Losslessness comes free: the builder records carry their unowned residue on an enumerable symbol
 * (lib/config/preserveUnknownFields.ts), and object spread copies symbols. Rebuilding a stage as
 * `{ ...stage, status_rollup_v1 }` therefore preserves `row_grain_v1` and every other field this
 * branch does not know about.
 *
 * DEFAULTS: nothing here seeds. `applyQueueMembershipDraft` and `applyStageOperatingPlanDraft`
 * write only what the operator supplied. The template defaults their predecessors seeded on every
 * save (`persistQueueMembershipV1.ts:153`, `persistStageOperatingPlanV1.ts:116`) are gone from the
 * save path per decision D1 — code defaults are a creation-time seed template, never a runtime or
 * save-time authority.
 */

import type {
    ConfigurationError,
    ConfigurationWarning,
} from "@/lib/businessProcesses/configuration/configurationDiagnostics";
import {
    activeLifecycleProcess,
    type LifecycleBuilderStageRecord,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    coercePerspectivesV1ForLanes,
    type PerspectiveConfigV1Stored,
} from "@/lib/lifecycle/perspectiveConfigV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageV2DraftInput } from "@/lib/lifecycle/persistStageV2DraftFields";
import type { StatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";

/** The contract every draft transform satisfies. */
export type StageDraftMutation = {
    nextBuilder: LifecycleBuilderV1;
    warnings: ConfigurationWarning[];
    errors: ConfigurationError[];
};

export const STAGE_NOT_CONFIGURED = "stage_not_configured" as const;

function stageNotConfigured(stageKey: string): ConfigurationError {
    return {
        code: STAGE_NOT_CONFIGURED,
        stage_key: stageKey,
        message: `Stage “${stageKey}” is not configured on this Business Process.`,
    };
}

function unchanged(builder: LifecycleBuilderV1): StageDraftMutation {
    return { nextBuilder: builder, warnings: [], errors: [] };
}

/**
 * Replace one active stage of the active process, structurally sharing everything else.
 *
 * The active process — not "the process whose key is enrollment". The old persisters *found* the
 * stage through `activeLifecycleProcess` but *wrote* it only into the process keyed
 * `ENROLLMENT_PROCESS_KEY`, so on a non-enrollment process they silently no-opped while reporting
 * success. One resolution rule removes that class of bug.
 */
export function mutateStageInBuilder(
    builder: LifecycleBuilderV1,
    stageKey: string,
    mutate: (stage: LifecycleBuilderStageRecord) => LifecycleBuilderStageRecord,
): { builder: LifecycleBuilderV1; found: boolean } {
    const sk = stageKey.trim();
    const active = activeLifecycleProcess(builder);
    if (!active) return { builder, found: false };

    let found = false;
    const stages = active.stages.map((stage) => {
        if (found || stage.key !== sk || !stage.is_active) return stage;
        found = true;
        return mutate(stage);
    });
    if (!found) return { builder, found: false };

    const nextProcess = { ...active, stages };
    return {
        builder: {
            ...builder,
            processes: builder.processes.map((p) => (p.id === active.id ? nextProcess : p)),
        },
        found: true,
    };
}

/** Find the active stage record without mutating — used for read-only derivations. */
export function findActiveStageInBuilder(
    builder: LifecycleBuilderV1,
    stageKey: string,
): LifecycleBuilderStageRecord | null {
    const sk = stageKey.trim();
    const active = activeLifecycleProcess(builder);
    if (!active) return null;
    return active.stages.find((s) => s.key === sk && s.is_active) ?? null;
}

export function applyStatusRollupDraft(
    builder: LifecycleBuilderV1,
    params: { stageKey: string; rollup: StatusRollupV1 | null },
): StageDraftMutation {
    if (!params.rollup) return unchanged(builder);
    const { builder: next, found } = mutateStageInBuilder(builder, params.stageKey, (stage) => ({
        ...stage,
        status_rollup_v1: params.rollup!,
    }));
    if (!found) {
        return { nextBuilder: builder, warnings: [], errors: [stageNotConfigured(params.stageKey)] };
    }
    return { nextBuilder: next, warnings: [], errors: [] };
}

/**
 * Author `queue_membership_v1` — explicit operator input only.
 *
 * A null membership is a no-op, NOT a seed. Reading a template default for the work-unit
 * projection is a separate, read-only concern (`resolveEffectiveStageMembership`); mixing the two
 * is what made opening and saving a stage silently author configuration.
 */
export function applyQueueMembershipDraft(
    builder: LifecycleBuilderV1,
    params: { stageKey: string; membership: QueueMembershipV1 | null },
): StageDraftMutation {
    if (!params.membership) return unchanged(builder);
    const { builder: next, found } = mutateStageInBuilder(builder, params.stageKey, (stage) => ({
        ...stage,
        queue_membership_v1: params.membership!,
    }));
    if (!found) {
        return { nextBuilder: builder, warnings: [], errors: [stageNotConfigured(params.stageKey)] };
    }
    return { nextBuilder: next, warnings: [], errors: [] };
}

/** Author `stage_operating_plan_v1` — explicit operator input only (decision D1). */
export function applyStageOperatingPlanDraft(
    builder: LifecycleBuilderV1,
    params: { stageKey: string; plan: StageOperatingPlanV1 | null },
): StageDraftMutation {
    if (!params.plan) return unchanged(builder);
    const { builder: next, found } = mutateStageInBuilder(builder, params.stageKey, (stage) => ({
        ...stage,
        stage_operating_plan_v1: params.plan!,
    }));
    if (!found) {
        return { nextBuilder: builder, warnings: [], errors: [stageNotConfigured(params.stageKey)] };
    }
    return { nextBuilder: next, warnings: [], errors: [] };
}

/**
 * Author `perspectives_v1`, coerced to the stage's queue lanes.
 *
 * `laneKeys` is supplied by the caller from a PURE projection of the prospective work-unit
 * queue_definition. It used to come from the work unit that had just been written, which is what
 * forced perspectives to persist after the queue upsert and made the whole orchestrator
 * un-liftable one call at a time.
 *
 * An empty perspectives array deletes the key — that is an operator clearing their overrides, and
 * the stage must not keep a stale `perspectives_v1: []`.
 */
export function applyStagePerspectivesDraft(
    builder: LifecycleBuilderV1,
    params: {
        stageKey: string;
        perspectives: readonly PerspectiveConfigV1Stored[];
        laneKeys: readonly string[];
    },
): StageDraftMutation {
    const coerced = params.laneKeys.length
        ? coercePerspectivesV1ForLanes([...params.perspectives], [...params.laneKeys])
        : [...params.perspectives];

    const { builder: next, found } = mutateStageInBuilder(builder, params.stageKey, (stage) => {
        if (coerced.length) return { ...stage, perspectives_v1: coerced };
        const { perspectives_v1: _dropped, ...rest } = stage;
        return rest as LifecycleBuilderStageRecord;
    });
    if (!found) {
        return { nextBuilder: builder, warnings: [], errors: [stageNotConfigured(params.stageKey)] };
    }
    return { nextBuilder: next, warnings: [], errors: [] };
}

/**
 * Apply StageEditorV2 fields.
 *
 * Unlike its predecessor this does NOT stamp process-level `command_set_v1`. A stage save may not
 * author process-level configuration; `resolveBusinessProcessCommandSelection` already falls back
 * to legacy compatibility when the key is absent, so nothing at runtime depends on the stamp
 * happening here. See the decomposition doc §4.
 */
export function applyStageV2DraftFields(
    builder: LifecycleBuilderV1,
    params: { stageKey: string; draft: StageV2DraftInput | null },
): StageDraftMutation {
    const draft = params.draft;
    if (!draft || Object.keys(draft).length === 0) return unchanged(builder);

    const { builder: next, found } = mutateStageInBuilder(builder, params.stageKey, (stage) => {
        // Rebuild rather than mutate so an explicit "" clears the key instead of persisting "".
        const { description, parent_stage_key, operator_guidance, ...base } = stage;
        const out: LifecycleBuilderStageRecord = { ...base };

        const nextDescription = draft.description !== undefined ? draft.description : description;
        if (nextDescription) out.description = nextDescription;

        const nextParent =
            draft.parent_stage_key !== undefined ? draft.parent_stage_key : parent_stage_key;
        if (nextParent) out.parent_stage_key = nextParent;

        const nextGuidance =
            draft.operator_guidance !== undefined ? draft.operator_guidance : operator_guidance;
        if (nextGuidance) out.operator_guidance = nextGuidance;

        if (draft.grain !== undefined) out.grain = draft.grain;
        if (draft.purpose !== undefined) out.purpose = draft.purpose;
        if (draft.allow_skipping !== undefined) out.allow_skipping = draft.allow_skipping;
        if (draft.subject_resolution_strategy !== undefined) {
            out.subject_resolution_strategy = draft.subject_resolution_strategy;
        }
        if (draft.candidate_actions !== undefined) {
            out.action_catalog_v1 = { version: 1, candidate_actions: draft.candidate_actions };
        }
        return out;
    });
    if (!found) {
        return { nextBuilder: builder, warnings: [], errors: [stageNotConfigured(params.stageKey)] };
    }
    return { nextBuilder: next, warnings: [], errors: [] };
}
