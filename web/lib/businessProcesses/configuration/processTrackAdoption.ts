/**
 * ADOPTING A CANONICAL TRACK MODEL INTO A PROCESS THAT ALREADY HAS STAGES.
 *
 * Track-based routing was reachable only by instantiating a template into an EMPTY process. Any
 * tenant whose Business Process predates the template, or who built their own, held a process the
 * runtime resolver would route as `legacy` forever — not because their configuration was wrong, but
 * because no product operation could give it `tracks_v1`. The repair that was reached for instead
 * was a direct database edit, which was correctly refused.
 *
 * This module is that missing operation, and it is deliberately generic: it reads a process record
 * and a template DESCRIPTOR, and it never names a track key, a stage key or a subject string. The
 * Enrollment vocabulary lives in `lib/businessProcessTemplates/processTrackTemplates.ts`, which is
 * template land; everything here would work identically for a Billing process that published one.
 *
 * ── WHY ADOPTION IS VALIDATED RATHER THAN SIMPLY WRITTEN ──
 *
 * `tracks_v1` is not an annotation. `isQueueMembershipFromBuilderEnabled` treats its presence as the
 * switch from legacy routing to builder membership routing, for EVERY lane at once. So a process
 * with one stale `queue_membership_v1` does not get one wrong lane on adoption — it gets a silent,
 * whole-process change of who decides what each lane contains, with the wrong answer on the stale
 * stage. That is why the contradictions below are blockers and not warnings, and why adoption is
 * all-or-nothing: a partially adopted process is one whose routing has already flipped.
 */

import type {
    ProcessSplitOutcomeV1,
    ProcessSplitRuleV1,
    ProcessTracksV1,
} from "@/lib/businessProcesses/processConfigTypes";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
    LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { isQueueSubjectCompatibleWithStageGrain, queueSubjectTypesForStageGrain } from "@/lib/lifecycle/queueMembershipV1";
import { parseStageGrain } from "@/lib/lifecycle/stageGrainV1";
import type { ProcessTrackAdoptionTemplate } from "@/lib/businessProcessTemplates/processTrackTemplates";

export const ADOPT_STAGE_GRAIN_MISSING = "stage_grain_missing" as const;
export const ADOPT_STAGE_GRAIN_UNMAPPABLE = "stage_grain_unmappable" as const;
export const ADOPT_MEMBERSHIP_GRAIN_CONFLICT = "membership_grain_conflict" as const;
export const ADOPT_MEMBERSHIP_STAGE_MISMATCH = "membership_stage_mismatch" as const;
export const ADOPT_SPLIT_TRACK_UNKNOWN = "split_rule_track_unknown" as const;
export const ADOPT_SPLIT_STAGE_UNKNOWN = "split_rule_stage_unknown" as const;
export const ADOPT_SPLIT_RULE_UNREACHABLE = "split_rule_unreachable" as const;
export const ADOPT_SPLIT_TARGET_WRONG_TRACK = "split_outcome_target_wrong_track" as const;
export const ADOPT_INSTANCE_STAGE_UNCONFIGURED = "instance_stage_unconfigured" as const;
export const ADOPT_TEMPLATE_TRACKS_INVALID = "template_tracks_invalid" as const;

export type TrackAdoptionBlockerCode =
    | typeof ADOPT_STAGE_GRAIN_MISSING
    | typeof ADOPT_STAGE_GRAIN_UNMAPPABLE
    | typeof ADOPT_MEMBERSHIP_GRAIN_CONFLICT
    | typeof ADOPT_MEMBERSHIP_STAGE_MISMATCH
    | typeof ADOPT_SPLIT_TRACK_UNKNOWN
    | typeof ADOPT_SPLIT_STAGE_UNKNOWN
    | typeof ADOPT_SPLIT_RULE_UNREACHABLE
    | typeof ADOPT_SPLIT_TARGET_WRONG_TRACK
    | typeof ADOPT_INSTANCE_STAGE_UNCONFIGURED
    | typeof ADOPT_TEMPLATE_TRACKS_INVALID;

export type TrackAdoptionBlocker = {
    code: TrackAdoptionBlockerCode;
    /** Operator-meaningful. Names the stage and what disagrees, never an internal symbol. */
    message: string;
    stage_key?: string;
    track_key?: string;
};

export type TrackAdoptionAssignment = {
    stage_id: string;
    stage_key: string;
    label: string;
    grain: string;
    track_key: string;
    /** Which rule decided this stage's track — the template's own stage, or its grain. */
    source: "template_stage" | "stage_grain";
    /** True when the stage already carried exactly this track key. */
    unchanged: boolean;
};

export type TrackAdoptionPreviewTrack = {
    key: string;
    label: string;
    subject: string;
    stage_keys: string[];
    stage_labels: string[];
};

export type TrackAdoptionOmittedOutcome = {
    from_stage_key: string;
    outcome_key: string;
    label: string;
    missing_stage_key: string;
};

export type TrackAdoptionPreview = {
    before: {
        tracks_configured: boolean;
        track_count: number;
        routing: "legacy" | "builder";
    };
    after: {
        tracks_configured: true;
        track_count: number;
        routing: "builder";
        tracks: TrackAdoptionPreviewTrack[];
        split_points: {
            from_track_key: string;
            from_stage_key: string;
            from_stage_label: string;
            into_track_key: string;
            outcome_labels: string[];
        }[];
    };
    /**
     * Canonical split outcomes this process cannot express, and why.
     *
     * Reported rather than silently dropped. An operator is entitled to know that the model they
     * adopted is the canonical one MINUS these, so they can add the stage later if they want the
     * outcome back.
     */
    omitted_outcomes: TrackAdoptionOmittedOutcome[];
    /** One row per stage whose lane routing the adoption changes. */
    stage_routing_changes: {
        stage_key: string;
        label: string;
        grain: string;
        track_key: string;
        subject_type: string | null;
        from: "legacy" | "builder";
        to: "builder";
    }[];
};

export type TrackAdoptionEvaluation = {
    ok: boolean;
    /**
     * The track model to persist: canonical, FITTED to this process's stage inventory.
     *
     * Not the raw template. The template's split rule names terminal outcomes like
     * `closed_withdrawn`, and the platform explicitly does not require a process to have such a
     * stage — a family case ends through `opportunities.status_key` and a child's participation
     * through `process_instances.state`, so representing either as a stage is a tenant's choice.
     * Persisting an outcome that points at a stage the process does not have would store a split
     * the runtime could never execute.
     */
    tracks: ProcessTracksV1;
    /** True when the process already holds exactly this track model and every stage assignment. */
    already_adopted: boolean;
    blockers: TrackAdoptionBlocker[];
    assignments: TrackAdoptionAssignment[];
    preview: TrackAdoptionPreview;
};

type EvaluateParams = {
    process: LifecycleBuilderProcessRecord;
    template: ProcessTrackAdoptionTemplate;
    /**
     * Stage keys live process instances currently occupy.
     *
     * Configuration alone cannot answer "will existing instances still resolve" — the instances are
     * data. The caller reads them and passes them in, so this stays a pure function and the check is
     * testable without a database. Omitting them checks configuration only, which is the honest
     * answer for a preview with no instance read behind it.
     */
    observedInstanceStageKeys?: readonly string[];
};

/** Stages that can hold a queue row. Inactive stages keep their assignment but route nothing. */
function activeStages(process: LifecycleBuilderProcessRecord): LifecycleBuilderStageRecord[] {
    return process.stages.filter((s) => s.is_active !== false);
}

function tracksAreIdentical(a: ProcessTracksV1 | undefined, b: ProcessTracksV1): boolean {
    if (!a) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Decide, validate and preview the adoption without writing anything.
 *
 * Every blocker is derived from the process's OWN configuration plus the template descriptor. There
 * is no stage-name special case and no process-key branch: a template that published different
 * tracks would produce different assignments through the same code.
 */
export function evaluateProcessTrackAdoption(params: EvaluateParams): TrackAdoptionEvaluation {
    const { process, template } = params;
    const blockers: TrackAdoptionBlocker[] = [];
    const assignments: TrackAdoptionAssignment[] = [];

    const tracks = template.tracks;
    const trackByKey = new Map(tracks.tracks.map((t) => [t.key, t]));
    if (!tracks.tracks.length) {
        blockers.push({
            code: ADOPT_TEMPLATE_TRACKS_INVALID,
            message: "The canonical track model for this process defines no tracks.",
        });
    }

    const stages = activeStages(process);
    const stageByKey = new Map(stages.map((s) => [s.key, s]));
    const allStageKeys = new Set(process.stages.map((s) => s.key));

    /* ---------------------------------------------------------------- per-stage assignment */

    for (const stage of stages) {
        const grain = parseStageGrain(stage.grain);
        if (!grain) {
            blockers.push({
                code: ADOPT_STAGE_GRAIN_MISSING,
                stage_key: stage.key,
                message: `Stage "${stage.label}" has no configured grain. Set its grain before adopting tracks — the track a stage belongs to is decided by what one of its rows represents.`,
            });
            continue;
        }

        const fromTemplateStage = template.track_key_by_stage_key[stage.key];
        const fromGrain = template.track_key_by_grain[grain];
        const trackKey = fromTemplateStage ?? fromGrain;

        if (!trackKey || !trackByKey.has(trackKey)) {
            blockers.push({
                code: ADOPT_STAGE_GRAIN_UNMAPPABLE,
                stage_key: stage.key,
                message: `Stage "${stage.label}" has grain "${grain}", which this process's canonical track model has no track for. Change the stage's grain or remove the stage before adopting tracks.`,
            });
            continue;
        }

        /*
         * THE STALE-MEMBERSHIP GATE.
         *
         * This is the check that stops adoption from silently re-routing a stage. Before adoption
         * the lane is built by the legacy path and the membership's `subject_type` is largely
         * inert; after adoption the membership IS the lane definition. A family-grain stage still
         * carrying a child subject would therefore begin listing children the moment tracks landed,
         * with nothing in the diff to say so.
         */
        const membership = stage.queue_membership_v1;
        if (membership) {
            if (!isQueueSubjectCompatibleWithStageGrain(grain, membership.subject_type)) {
                const allowed = queueSubjectTypesForStageGrain(grain);
                blockers.push({
                    code: ADOPT_MEMBERSHIP_GRAIN_CONFLICT,
                    stage_key: stage.key,
                    message:
                        `Stage "${stage.label}" is ${grain}-grain but its queue membership lists "${membership.subject_type}" records. ` +
                        (allowed.length ?
                            `Adopting tracks would make that membership the lane definition, so it must list ${allowed.map((s) => `"${s}"`).join(" or ")} first.`
                        :   "That grain cannot be expressed as queue membership."),
                });
            }
            if (membership.stage_key && membership.stage_key !== stage.key) {
                blockers.push({
                    code: ADOPT_MEMBERSHIP_STAGE_MISMATCH,
                    stage_key: stage.key,
                    message: `Stage "${stage.label}" has a queue membership that claims stage "${membership.stage_key}". After adoption that membership decides the lane, so it must name its own stage.`,
                });
            }
        }

        assignments.push({
            stage_id: stage.id,
            stage_key: stage.key,
            label: stage.label,
            grain,
            track_key: trackKey,
            source: fromTemplateStage ? "template_stage" : "stage_grain",
            unchanged: stage.track_key === trackKey,
        });
    }

    /* ---------------------------------------------------------------- split-rule integrity */

    const trackKeyByStageKey = new Map(assignments.map((a) => [a.stage_key, a.track_key]));

    const omittedOutcomes: TrackAdoptionOmittedOutcome[] = [];
    const fittedRules: ProcessSplitRuleV1[] = [];

    for (const rule of tracks.split_rules) {
        if (!trackByKey.has(rule.from_track_key)) {
            blockers.push({
                code: ADOPT_SPLIT_TRACK_UNKNOWN,
                track_key: rule.from_track_key,
                message: `The canonical split rule starts in track "${rule.from_track_key}", which is not one of this process's tracks.`,
            });
        }
        if (!trackByKey.has(rule.into_track_key)) {
            blockers.push({
                code: ADOPT_SPLIT_TRACK_UNKNOWN,
                track_key: rule.into_track_key,
                message: `The canonical split rule moves into track "${rule.into_track_key}", which is not one of this process's tracks.`,
            });
        }
        if (!stageByKey.has(rule.from_stage_key)) {
            // The split POINT is different from a split DESTINATION: without it there is nowhere
            // for the crossing to happen at all, and no amount of fitting can supply one.
            blockers.push({
                code: ADOPT_SPLIT_STAGE_UNKNOWN,
                stage_key: rule.from_stage_key,
                message: `The canonical split happens at stage "${rule.from_stage_key}", which this process does not have. Add or rename that stage before adopting tracks, or the split point has nowhere to live.`,
            });
        }

        const keptOutcomes: ProcessSplitOutcomeV1[] = [];
        for (const outcome of rule.per_subject_outcomes) {
            // A null target is "no movement" and is deliberately not a reference.
            if (outcome.target_stage_key == null) {
                keptOutcomes.push(outcome);
                continue;
            }
            if (!allStageKeys.has(outcome.target_stage_key)) {
                /*
                 * FITTED, NOT REFUSED. The canonical model names terminal outcomes such as
                 * `closed_withdrawn`, and the platform explicitly does NOT require a process to
                 * have such a stage — a family case ends through `opportunities.status_key`, a
                 * child's participation through `process_instances.state`, and representing either
                 * as a stage is the tenant's choice. Refusing here would have made adoption
                 * impossible for precisely the processes it exists to upgrade.
                 */
                omittedOutcomes.push({
                    from_stage_key: rule.from_stage_key,
                    outcome_key: outcome.outcome_key,
                    label: outcome.label,
                    missing_stage_key: outcome.target_stage_key,
                });
                continue;
            }
            const targetTrack = trackKeyByStageKey.get(outcome.target_stage_key);
            if (targetTrack && targetTrack !== rule.into_track_key) {
                // A CONTRADICTION, not an absence: the stage exists and the grain puts it
                // somewhere the split says it is not. Fitting cannot resolve a disagreement.
                blockers.push({
                    code: ADOPT_SPLIT_TARGET_WRONG_TRACK,
                    stage_key: outcome.target_stage_key,
                    track_key: targetTrack,
                    message: `The split outcome "${outcome.label}" moves into track "${rule.into_track_key}" but targets stage "${outcome.target_stage_key}", which this process's grain puts in track "${targetTrack}".`,
                });
                continue;
            }
            keptOutcomes.push(outcome);
        }

        // A rule whose every MOVING outcome was omitted can never cross a subject into the other
        // track, so adopting it would store a split that does nothing. That is worth refusing.
        if (!keptOutcomes.some((o) => o.target_stage_key != null)) {
            blockers.push({
                code: ADOPT_SPLIT_RULE_UNREACHABLE,
                stage_key: rule.from_stage_key,
                track_key: rule.into_track_key,
                message: `None of the canonical outcomes at stage "${rule.from_stage_key}" can reach a stage this process has, so nothing would ever move into "${rule.into_track_key}". Add at least one of its destination stages before adopting tracks.`,
            });
        }

        fittedRules.push({ ...rule, per_subject_outcomes: keptOutcomes });
    }

    const fittedTracks: ProcessTracksV1 = {
        version: 1,
        tracks: tracks.tracks.map((t) => ({ ...t })),
        split_rules: fittedRules,
    };

    /* ---------------------------------------------------------------- live instance safety */

    for (const stageKey of new Set(params.observedInstanceStageKeys ?? [])) {
        const key = stageKey.trim();
        if (!key) continue;
        if (!trackKeyByStageKey.has(key)) {
            blockers.push({
                code: ADOPT_INSTANCE_STAGE_UNCONFIGURED,
                stage_key: key,
                message: `Records are currently at stage "${key}", which will not belong to any track after adoption. Those records would stop resolving, so adoption is refused until that stage is configured or they are moved.`,
            });
        }
    }

    /* ---------------------------------------------------------------- preview */

    const previewTracks: TrackAdoptionPreviewTrack[] = tracks.tracks.map((track) => {
        const members = assignments.filter((a) => a.track_key === track.key);
        return {
            key: track.key,
            label: track.label,
            subject: track.subject,
            stage_keys: members.map((m) => m.stage_key),
            stage_labels: members.map((m) => m.label),
        };
    });

    const beforeConfigured = Boolean(process.tracks_v1?.tracks?.length);
    const preview: TrackAdoptionPreview = {
        before: {
            tracks_configured: beforeConfigured,
            track_count: process.tracks_v1?.tracks?.length ?? 0,
            routing: beforeConfigured ? "builder" : "legacy",
        },
        after: {
            tracks_configured: true,
            track_count: tracks.tracks.length,
            routing: "builder",
            tracks: previewTracks,
            split_points: fittedTracks.split_rules.map((rule) => ({
                from_track_key: rule.from_track_key,
                from_stage_key: rule.from_stage_key,
                from_stage_label: stageByKey.get(rule.from_stage_key)?.label ?? rule.from_stage_key,
                into_track_key: rule.into_track_key,
                outcome_labels: rule.per_subject_outcomes.map((o) => o.label),
            })),
        },
        omitted_outcomes: omittedOutcomes,
        stage_routing_changes: beforeConfigured ? [] : (
            assignments.map((a) => ({
                stage_key: a.stage_key,
                label: a.label,
                grain: a.grain,
                track_key: a.track_key,
                subject_type: stageByKey.get(a.stage_key)?.queue_membership_v1?.subject_type ?? null,
                from: "legacy" as const,
                to: "builder" as const,
            }))
        ),
    };

    const alreadyAdopted =
        tracksAreIdentical(process.tracks_v1, fittedTracks) && assignments.every((a) => a.unchanged);

    return {
        ok: blockers.length === 0,
        tracks: fittedTracks,
        already_adopted: alreadyAdopted,
        blockers,
        assignments,
        preview,
    };
}

/**
 * Write the adopted track model into the draft configuration.
 *
 * Stages keep everything else they have — this sets `tracks_v1` on the process and `track_key` on
 * each stage, and touches nothing else. It is the counterpart to `applyEnrollmentTemplateToProcess`
 * with the stage inventory left alone, which is the entire distinction that makes it usable on a
 * process someone has already built.
 *
 * Idempotent by identity: adopting a model the process already holds returns the SAME config object,
 * so a repeated apply produces no diff, no new revision content and no duplicated tracks.
 *
 * Takes the FITTED model from {@link evaluateProcessTrackAdoption}, never the raw template: the
 * evaluator is what knows which canonical outcomes this process's stage inventory can express.
 *
 * This does NOT validate. Callers run {@link evaluateProcessTrackAdoption} first and refuse on
 * blockers; separating them is what lets the preview be computed without any possibility of a write.
 */
export function adoptProcessTracks(
    config: LifecycleBuilderV1,
    processId: string,
    tracks: ProcessTracksV1,
    assignments: readonly TrackAdoptionAssignment[],
): LifecycleBuilderV1 {
    const process = config.processes.find((p) => p.id === processId);
    if (!process) throw new Error("Process not found");

    const trackKeyByStageId = new Map(assignments.map((a) => [a.stage_id, a.track_key]));
    const nothingToDo =
        tracksAreIdentical(process.tracks_v1, tracks) &&
        process.stages.every((s) => !trackKeyByStageId.has(s.id) || s.track_key === trackKeyByStageId.get(s.id));
    if (nothingToDo) return config;

    return {
        ...config,
        processes: config.processes.map((p) => {
            if (p.id !== processId) return p;
            return {
                ...p,
                tracks_v1: structuredClone(tracks),
                stages: p.stages.map((s) => {
                    const trackKey = trackKeyByStageId.get(s.id);
                    return trackKey ? { ...s, track_key: trackKey } : s;
                }),
            };
        }),
    };
}
