/**
 * What grain does a stage operate at — family or child?
 *
 * Three sources answer this today, and on the Firefly Decision stage they disagree:
 *
 *   Decision operating plan `journey_segment`      family
 *   canonical durable-stage vocabulary             family
 *   department lifecycle_builder_v1 stage metadata child
 *
 * Picking a winner silently is how a child ends up moved onto a family stage — or how a real
 * configuration defect stays invisible for another six months. This module states the precedence
 * once, and makes disagreement a REPORTED outcome rather than a resolved one.
 *
 * Precedence, when sources agree:
 *   1. explicit, valid operating-plan `journey_segment` — the stage's own declaration
 *   2. canonical durable-stage vocabulary — the platform's definition for known stage keys
 *   3. configured stage metadata — compatibility fallback for tenant-authored stages
 *
 * When two available sources DISAGREE the result is a contradiction, not a winner. The grain of a
 * stage is not a preference to be arbitrated; a stage whose own plan and whose platform definition
 * describe different journeys is misconfigured, and movement onto it must stop until someone
 * decides which is true. That is deliberate: this sub-slice makes the Decision disagreement
 * visible and does NOT coerce it.
 */

import { enrollmentStageMembership } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

export type StageGrain = "family" | "child";

export type StageGrainSource = "operating_plan" | "canonical_vocabulary" | "configured_metadata";

export type StageGrainOpinion = { source: StageGrainSource; grain: StageGrain };

export type StageGrainResolution =
    | { ok: true; stage_key: string; grain: StageGrain; source: StageGrainSource; opinions: StageGrainOpinion[] }
    | {
          ok: false;
          stage_key: string;
          reason: "grain_unknown";
          message: string;
      }
    | {
          ok: false;
          stage_key: string;
          reason: "grain_contradiction";
          conflicts: StageGrainOpinion[];
          message: string;
      };

/** Only these two values mean anything. Anything else is an unreadable declaration, not a grain. */
function normalizeGrain(value: unknown): StageGrain | null {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase();
    if (key === "family") return "family";
    if (key === "child") return "child";
    return null;
}

export type ResolveStageGrainInput = {
    stageKey: string;
    /** `stage_operating_plan_v1.journey_segment` for THIS stage, when the caller has loaded it. */
    operatingPlanJourneySegment?: unknown;
    /** `lifecycle_builder_v1` stage `grain`, from department metadata. */
    configuredMetadataGrain?: unknown;
};

/** In precedence order, so the first agreeing opinion wins when there is no conflict. */
function gatherOpinions(input: ResolveStageGrainInput): StageGrainOpinion[] {
    const opinions: StageGrainOpinion[] = [];

    const planGrain = normalizeGrain(input.operatingPlanJourneySegment);
    if (planGrain) opinions.push({ source: "operating_plan", grain: planGrain });

    const canonical = enrollmentStageMembership(input.stageKey);
    if (canonical) opinions.push({ source: "canonical_vocabulary", grain: canonical.grain });

    const metadataGrain = normalizeGrain(input.configuredMetadataGrain);
    if (metadataGrain) opinions.push({ source: "configured_metadata", grain: metadataGrain });

    return opinions;
}

export function resolveStageGrain(input: ResolveStageGrainInput): StageGrainResolution {
    const stage_key = input.stageKey?.trim() ?? "";
    if (!stage_key) {
        return {
            ok: false,
            stage_key,
            reason: "grain_unknown",
            message: "A stage key is required to resolve its grain.",
        };
    }

    const opinions = gatherOpinions(input);
    if (!opinions.length) {
        return {
            ok: false,
            stage_key,
            reason: "grain_unknown",
            message:
                `Stage "${stage_key}" does not declare a journey grain in its operating plan, the `
                + `canonical stage vocabulary, or its configured metadata. Movement onto it cannot `
                + `be validated — no change was made.`,
        };
    }

    const distinct = new Set(opinions.map((opinion) => opinion.grain));
    if (distinct.size > 1) {
        return {
            ok: false,
            stage_key,
            reason: "grain_contradiction",
            conflicts: opinions,
            message:
                `Stage "${stage_key}" is configured with conflicting journey grains: `
                + opinions.map((o) => `${o.source}=${o.grain}`).join(", ")
                + `. Movement onto it is blocked until the configuration agrees — no change was made.`,
        };
    }

    const winner = opinions[0]!;
    return { ok: true, stage_key, grain: winner.grain, source: winner.source, opinions };
}

// ─── Movement compatibility ──────────────────────────────────────────────────────────────────

export type StageMoveGrainError = {
    kind:
        | "stage_grain_mismatch"
        | "subject_grain_unknown"
        | "destination_grain_unknown"
        | "destination_grain_contradiction";
    stage_key: string;
    subject_grain: StageGrain | null;
    destination_grain: StageGrain | null;
    conflicts?: StageGrainOpinion[];
    message: string;
};

/**
 * May a subject of this grain move onto this stage?
 *
 * Fails closed on every uncertainty: an unknown subject grain, an unknown destination grain, and a
 * contradictory destination all block. A movement the platform cannot justify is not performed.
 *
 * Note what this deliberately does NOT do: it never infers the subject's grain from the
 * destination. Reading "the destination is child-grain, so this must be a child" would turn a
 * family close into a child write, which is exactly the cross-grain accident being prevented.
 */
export function assertStageMoveGrainCompatible(input: {
    subjectGrain: unknown;
    destination: StageGrainResolution;
}): { ok: true; grain: StageGrain } | { ok: false; error: StageMoveGrainError } {
    const subjectGrain = normalizeGrain(input.subjectGrain);
    const destination = input.destination;

    if (!subjectGrain) {
        return {
            ok: false,
            error: {
                kind: "subject_grain_unknown",
                stage_key: destination.stage_key,
                subject_grain: null,
                destination_grain: destination.ok ? destination.grain : null,
                message:
                    `This movement does not declare whether it applies to the family or to one `
                    + `child, so it cannot be validated against stage "${destination.stage_key}" — `
                    + `no change was made.`,
            },
        };
    }

    if (!destination.ok) {
        return {
            ok: false,
            error: {
                kind:
                    destination.reason === "grain_contradiction"
                        ? "destination_grain_contradiction"
                        : "destination_grain_unknown",
                stage_key: destination.stage_key,
                subject_grain: subjectGrain,
                destination_grain: null,
                ...(destination.reason === "grain_contradiction"
                    ? { conflicts: destination.conflicts }
                    : {}),
                message: destination.message,
            },
        };
    }

    if (destination.grain !== subjectGrain) {
        return {
            ok: false,
            error: {
                kind: "stage_grain_mismatch",
                stage_key: destination.stage_key,
                subject_grain: subjectGrain,
                destination_grain: destination.grain,
                message:
                    `A ${subjectGrain} record cannot move to "${destination.stage_key}", which is a `
                    + `${destination.grain}-grain stage. The family case and each child's enrollment `
                    + `move on their own tracks — no change was made.`,
            },
        };
    }

    return { ok: true, grain: subjectGrain };
}
