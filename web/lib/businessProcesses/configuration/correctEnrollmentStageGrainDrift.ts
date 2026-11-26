/**
 * Repair one specific published drift: the child's Enrollment stage declared family-grain.
 *
 * ## What this is, and what it is deliberately not
 *
 * This is a TARGETED REPAIR of a known configuration defect in already-published tenant payloads,
 * not a runtime invariant and not a general "make this process canonical" pass. It names stage keys,
 * which runtime code must never do — and that is legitimate here for the same reason a data
 * migration names columns: it is repairing THESE rows, once, not deciding what any process must
 * contain. The general rule lives in publish validation as `process_entry_stage_grain_mismatch` and
 * `child_completion_unreachable`, expressed from grain and configured movement.
 *
 * ## The drift
 *
 *   enrolling   stage metadata `grain: "child"`, operating plan `journey_segment: "family"`
 *               tracks_v1 sends children here; queue membership counts enrollment_tracks by
 *               ocm_site; `entry_points_v1.by_intent.enrollment_start` points here
 *   enrollment  a LEGACY stage key the product already migrates forward (see
 *               `detectBuilderStageTransition`, `enrollmentStatusTransitionDestinations`). Where it
 *               survives it holds the child completion outcome that `enrolling` should own, and
 *               movement targets naming it dangle because the stage list does not contain it.
 *
 * Everything except that one plan declaration agreed the stage was child grain, and
 * `resolveStageGrain` ranks a stage's own plan above its metadata — so the single wrong declaration
 * won and nothing surfaced the disagreement.
 *
 * ## What it changes, and nothing else
 *
 * The corrected plan comes from `defaultStageOperatingPlanForEnrollmentStage("enrolling")` rather
 * than a literal written here, so the repair and the shipped template cannot drift apart.
 *
 * Every edit is CONDITIONAL on finding the defect. A payload already correct is returned with an
 * empty change list and an unchanged checksum, which is what makes it safe to run against a tenant
 * another lane may have already fixed.
 */

import {
    type LifecycleBuilderProcessRecord,
    type LifecycleBuilderStageRecord,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { ENROLLMENT_START_ENTRY_INTENT } from "@/lib/lifecycle/processEntryPointsV1";
import type { StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** The canonical child Enrollment-in-progress stage. */
export const CHILD_ENROLLMENT_STAGE_KEY = "enrolling" as const;
/** Migration-compatibility only. The product already maps this key forward to `enrolling`. */
export const LEGACY_ENROLLMENT_STAGE_KEY = "enrollment" as const;

export type DriftCorrection = {
    readonly process_key: string;
    readonly change: string;
};

export type DriftCorrectionResult = {
    readonly builder: LifecycleBuilderV1;
    readonly corrections: DriftCorrection[];
    /** True when the input already carried none of the defect. */
    readonly alreadyCorrect: boolean;
};

function movesToStage(target: StageOutcomeRuleTargetV1, stageKey: string): boolean {
    return target.kind === "move_to_stage" && target.stage_key === stageKey;
}

function correctProcess(
    process: LifecycleBuilderProcessRecord,
    corrections: DriftCorrection[],
): LifecycleBuilderProcessRecord {
    const note = (change: string) => corrections.push({ process_key: process.key, change });

    const hasEnrolling = process.stages.some((s) => s.key === CHILD_ENROLLMENT_STAGE_KEY);
    // Nothing to repair in a process that does not have the stage this defect is about.
    if (!hasEnrolling) return process;

    const canonicalPlan = defaultStageOperatingPlanForEnrollmentStage(CHILD_ENROLLMENT_STAGE_KEY);
    if (!canonicalPlan) return process;

    const stages: LifecycleBuilderStageRecord[] = process.stages.map((stage) => {
        /*
         * THE CHILD STAGE. Its plan is replaced wholesale rather than patched field by field: the
         * defect is not one wrong value but a plan describing the wrong journey — family packet
         * chasing where the child's Enrollment execution belongs. Patching `journey_segment` alone
         * would leave a child-grain stage whose only outcomes are `packet_sent` / `packet_pending`
         * and still no way to complete an enrollment.
         */
        if (stage.key === CHILD_ENROLLMENT_STAGE_KEY) {
            const segment = stage.stage_operating_plan_v1?.journey_segment;
            if (segment === "child" && stage.grain === "child") return stage;
            note(
                `enrolling: operating plan journey_segment ${JSON.stringify(segment ?? null)} -> "child", `
                + `plan replaced with the canonical child Enrollment plan (owns enrollment_complete)`,
            );
            return {
                ...stage,
                grain: "child",
                stage_operating_plan_v1: structuredClone(canonicalPlan),
            };
        }

        /*
         * THE LEGACY STAGE, where a payload still carries one. Deactivated rather than deleted:
         * `is_active: false` is what "absent from active stage membership" means in this model, and
         * removing the row outright would erase the record that the tenant once had it.
         */
        if (stage.key === LEGACY_ENROLLMENT_STAGE_KEY && stage.is_active) {
            note(`enrollment: legacy stage deactivated (its completion outcome now lives on enrolling)`);
            return { ...stage, is_active: false };
        }

        /*
         * ANY STAGE pointing movement at the legacy key. In the deployed shape this is the waitlist
         * spot-offer rule, whose target names a stage the process does not contain at all — so a
         * child offered a spot moved nowhere. Repointed at the canonical child stage, which is
         * where that rule always meant to send them.
         */
        const plan = stage.stage_operating_plan_v1;
        if (!plan?.outcome_rules?.length) return stage;
        let touched = false;
        const outcome_rules = plan.outcome_rules.map((rule) => {
            if (!(rule.targets ?? []).some((t) => movesToStage(t, LEGACY_ENROLLMENT_STAGE_KEY))) return rule;
            touched = true;
            note(
                `${stage.key}: outcome "${rule.when_outcome_key}" moved to the legacy `
                + `"${LEGACY_ENROLLMENT_STAGE_KEY}" stage -> "${CHILD_ENROLLMENT_STAGE_KEY}"`,
            );
            return {
                ...rule,
                targets: (rule.targets ?? []).map((t) =>
                    movesToStage(t, LEGACY_ENROLLMENT_STAGE_KEY)
                        ? { ...t, stage_key: CHILD_ENROLLMENT_STAGE_KEY }
                        : t,
                ),
            };
        });
        return touched ? { ...stage, stage_operating_plan_v1: { ...plan, outcome_rules } } : stage;
    });

    /*
     * THE FAMILY DECISION. A family-grain stage may not move the Opportunity onto the child's
     * stage. The child handoff itself is untouched — `enter_child_enrollment` stays, and it names no
     * stage, so it resolves through the declared entry intent exactly as Start Enrollment does.
     */
    const withFamilyDecisionFixed = stages.map((stage) => {
        const plan = stage.stage_operating_plan_v1;
        if (!plan || plan.journey_segment !== "family") return stage;

        const exits = plan.outgoing_transitions ?? [];
        const crossGrainExits = new Set(
            exits
                .filter((t) => t.target_stage_key === CHILD_ENROLLMENT_STAGE_KEY)
                .map((t) => t.transition_ref),
        );
        const carriesCrossGrainMove = (plan.outcome_rules ?? []).some((rule) =>
            (rule.targets ?? []).some((target) => {
                if (target.kind !== "move_to_stage") return false;
                return (
                    target.stage_key === CHILD_ENROLLMENT_STAGE_KEY
                    || (typeof target.transition_ref === "string" && crossGrainExits.has(target.transition_ref))
                );
            }),
        );
        if (!crossGrainExits.size && !carriesCrossGrainMove) return stage;

        note(
            `${stage.key}: family-grain stage no longer moves the family case onto the child stage `
            + `"${CHILD_ENROLLMENT_STAGE_KEY}" (${crossGrainExits.size} exit path(s) removed)`,
        );
        const outcome_rules = (plan.outcome_rules ?? []).map((rule) => {
            const kept = (rule.targets ?? []).filter((target) => {
                if (target.kind !== "move_to_stage") return true;
                return !(
                    target.stage_key === CHILD_ENROLLMENT_STAGE_KEY
                    || (typeof target.transition_ref === "string" && crossGrainExits.has(target.transition_ref))
                );
            });
            // A rule left with no targets would silently do nothing; say "stay put" explicitly.
            return kept.length === (rule.targets ?? []).length
                ? rule
                : { ...rule, targets: kept.length ? kept : [{ kind: "no_movement" as const }] };
        });
        return {
            ...stage,
            stage_operating_plan_v1: {
                ...plan,
                outcome_rules,
                outgoing_transitions: exits.filter(
                    (t) => t.target_stage_key !== CHILD_ENROLLMENT_STAGE_KEY,
                ),
            },
        };
    });

    /*
     * THE ENTRY INTENT. Asserted, not repointed: it already names `enrolling` wherever it is
     * authored. A payload that predates `entry_points_v1` has nothing declared, and a child journey
     * cannot begin without one, so the declaration is added.
     */
    const declared = process.entry_points_v1?.by_intent?.[ENROLLMENT_START_ENTRY_INTENT];
    let entry_points_v1 = process.entry_points_v1;
    if (declared !== CHILD_ENROLLMENT_STAGE_KEY) {
        note(
            `entry_points_v1.by_intent.${ENROLLMENT_START_ENTRY_INTENT}: `
            + `${JSON.stringify(declared ?? null)} -> "${CHILD_ENROLLMENT_STAGE_KEY}"`,
        );
        entry_points_v1 = {
            version: 1,
            by_intent: {
                ...(process.entry_points_v1?.by_intent ?? {}),
                [ENROLLMENT_START_ENTRY_INTENT]: CHILD_ENROLLMENT_STAGE_KEY,
            },
        };
    }

    return { ...process, stages: withFamilyDecisionFixed, ...(entry_points_v1 ? { entry_points_v1 } : {}) };
}

export function correctEnrollmentStageGrainDrift(builder: LifecycleBuilderV1): DriftCorrectionResult {
    const corrections: DriftCorrection[] = [];
    const processes = builder.processes.map((process) => correctProcess(process, corrections));
    return {
        builder: { ...builder, processes },
        corrections,
        alreadyCorrect: corrections.length === 0,
    };
}
