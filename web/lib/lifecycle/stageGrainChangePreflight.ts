/**
 * May this stage's journey grain be changed to the requested value?
 *
 * Grain is not a label. It decides which record a stage's outcomes move — the family case or one
 * child's enrollment — so changing it retargets every saved movement into and out of the stage.
 * A change that contradicts the platform's own definition, or that would strand existing authored
 * configuration on the wrong track, must be refused with an explanation rather than written and
 * discovered later at execution.
 *
 * Decides only. Reads no database and writes nothing: the caller supplies the evidence, so this
 * cannot mutate configuration and a test can prove that by construction.
 */

import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveStageGrain, type StageGrain } from "@/lib/lifecycle/stageGrainResolution";

export type StageGrainChangeBlockerCode =
    /** A saved path out of this stage would land on the other track. */
    | "outgoing_transition_conflict"
    /** A saved path into this stage would arrive from the other track. */
    | "incoming_transition_conflict";

export type StageGrainChangeBlocker = {
    code: StageGrainChangeBlockerCode;
    message: string;
    /** Stage keys implicated, so the caller can name them without re-deriving. */
    stage_keys: string[];
};

export type StageGrainChangeDecision =
    | { allowed: true; unchanged: boolean; from: StageGrain | null; to: StageGrain }
    | { allowed: false; blockers: StageGrainChangeBlocker[] };

export type StageGrainChangePreflightInput = {
    stageKey: string;
    requestedGrain: StageGrain;
    /** Grain as the department metadata declares it today. */
    currentConfiguredGrain?: unknown;
    /** This stage's saved operating plan, when it has one. */
    operatingPlan?: StageOperatingPlanV1 | null;
    /** Every configured stage with its declared grain — for judging transition endpoints. */
    processStages?: ReadonlyArray<{ key: string; label?: string | null; grain?: unknown }>;
    /** Saved plans of OTHER stages, so a path INTO this one can be judged too. */
    otherStagePlans?: ReadonlyArray<StageOperatingPlanV1>;
};

function normalizeGrain(value: unknown): StageGrain | null {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase();
    return key === "family" || key === "child" ? key : null;
}

export function evaluateStageGrainChange(
    input: StageGrainChangePreflightInput,
): StageGrainChangeDecision {
    const stageKey = input.stageKey.trim();
    const requested = input.requestedGrain;
    const current = normalizeGrain(input.currentConfiguredGrain);
    const blockers: StageGrainChangeBlocker[] = [];

    // 1. (removed) The built-in stage vocabulary used to VETO a grain change here: a stage whose
    // key appeared in the platform's map could not be configured the other way. That made a
    // platform-owned list of stage keys authoritative over the tenant's own process. Which stages
    // exist and what grain each carries is configuration's decision; the blockers below are the
    // real invariants — they check this change against the tenant's OWN saved paths and records,
    // not against a list of names the platform happens to know.

    const stageByKey = new Map((input.processStages ?? []).map((s) => [s.key, s]));
    const label = (key: string) => stageByKey.get(key)?.label?.trim() || key;

    /** Grain of another stage, judged by the shared resolver — never a private rule. */
    const grainOf = (key: string): StageGrain | null => {
        const resolution = resolveStageGrain({
            stageKey: key,
            configuredMetadataGrain: stageByKey.get(key)?.grain,
        });
        return resolution.ok ? resolution.grain : null;
    };

    // 2. Saved paths OUT of this stage would now cross tracks.
    const outgoingConflicts = (input.operatingPlan?.outgoing_transitions ?? [])
        .map((t) => t.target_stage_key?.trim())
        .filter((key): key is string => Boolean(key))
        .filter((key) => {
            const destination = grainOf(key);
            return destination != null && destination !== requested;
        });
    if (outgoingConflicts.length) {
        blockers.push({
            code: "outgoing_transition_conflict",
            message:
                `"${stageKey}" already has ${outgoingConflicts.length === 1 ? "a way out" : "ways out"} to `
                + `${[...new Set(outgoingConflicts)].map(label).map((l) => `"${l}"`).join(", ")}, which `
                + `${outgoingConflicts.length === 1 ? "belongs" : "belong"} to the other journey. `
                + `Repoint or remove ${outgoingConflicts.length === 1 ? "it" : "them"} before changing this stage.`,
            stage_keys: [...new Set(outgoingConflicts)],
        });
    }

    // 3. Saved paths INTO this stage would now arrive from the other track.
    const incomingConflicts = (input.otherStagePlans ?? [])
        .filter((plan) =>
            (plan.outgoing_transitions ?? []).some((t) => t.target_stage_key?.trim() === stageKey),
        )
        .map((plan) => plan.stage_key?.trim())
        .filter((key): key is string => Boolean(key))
        .filter((key) => {
            const source = grainOf(key);
            return source != null && source !== requested;
        });
    if (incomingConflicts.length) {
        blockers.push({
            code: "incoming_transition_conflict",
            message:
                `${[...new Set(incomingConflicts)].map(label).map((l) => `"${l}"`).join(", ")} already `
                + `${incomingConflicts.length === 1 ? "moves" : "move"} records into "${stageKey}" from the `
                + `other journey. Repoint ${incomingConflicts.length === 1 ? "that path" : "those paths"} `
                + `before changing this stage.`,
            stage_keys: [...new Set(incomingConflicts)],
        });
    }

    if (blockers.length) return { allowed: false, blockers };
    return { allowed: true, unchanged: current === requested, from: current, to: requested };
}
