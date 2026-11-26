/**
 * Repair transitions that close a family case onto a stage the process does not have.
 *
 * ## The defect
 *
 * `lead`, `tour` and `decision` each declare a "Close as Lost" exit to `closed_lost`, and no such
 * stage exists in the payload's stage list. Publication reports it twice over — the destination is
 * unknown, and a stage that does not exist declares no grain, so the movement cannot be checked
 * either. Any republish is blocked until it is resolved.
 *
 * ## Why the stage is not created
 *
 * Because "lost" was never a position. The family status vocabulary has exactly two values, `open`
 * and `closed`, and the product already records WHY a case closed as a durable close reason on the
 * case: `mark_lost` maps to `{ status_key: "closed", close_reason_key: "lost" }`, and the shipped
 * mapping notes there is deliberately no "won" status either, because enrolment success is
 * child-grain. Stage is operational position; the close reason is the business truth.
 *
 * So the repair moves the destination to the family terminal stage the process actually has, and
 * makes sure the reason survives that move. Repointing alone would silently erase the distinction
 * between a case closed because the child enrolled and a case closed because the family was lost —
 * which is the one thing this must not do.
 *
 * ## Fails closed
 *
 * If the process has no resolvable family terminal stage, nothing is changed and the reason is
 * reported. Inventing a destination would be the same class of error as inventing the stage.
 */

import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { mapOpportunityRecordActionToPatch } from "@/lib/recordChrome/opportunityRecordActionMap";
import type { StageOutcomeRuleTargetV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { enrollmentStageMembership } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

/** The durable family status a terminal family stage carries. */
const FAMILY_CLOSED_STATUS_KEY = "closed" as const;

export type ClosedLostCorrection = { readonly process_key: string; readonly change: string };

export type ClosedLostCorrectionResult = {
    readonly builder: LifecycleBuilderV1;
    readonly corrections: ClosedLostCorrection[];
    /** Reasons a needed repair could NOT be made. Non-empty means do not publish. */
    readonly refusals: ClosedLostCorrection[];
    readonly alreadyCorrect: boolean;
};

/** The canonical close a "lost" exit must preserve, taken from the shipped action mapping. */
function lostClosePatch(): { status_key: string; close_reason_key: string } | null {
    const patch = mapOpportunityRecordActionToPatch("mark_lost");
    const status_key = patch?.status_key?.trim();
    const close_reason_key = patch?.close_reason_key?.trim();
    return status_key && close_reason_key ? { status_key, close_reason_key } : null;
}

/**
 * The family terminal stage this process actually has.
 *
 * Resolved from the canonical durable-state vocabulary rather than by naming a stage or by shape.
 * A stage is the family terminal when it is active, declares family grain, and the vocabulary says
 * a record sitting in it carries the family `closed` status.
 *
 * AN EARLIER VERSION GUESSED, and the guess was dangerous: it accepted "an active family-grain
 * stage with no outgoing transitions", which on the drifted payload matches `enrolling` — the
 * child's Enrollment stage, mis-declared family and declaring no exits. Lost family cases would
 * have been closed onto the stage where children do their paperwork. Shape is not identity.
 */
function resolveFamilyTerminalStage(process: LifecycleBuilderProcessRecord): string | null {
    const terminal = process.stages.find((s) => {
        if (!s.is_active) return false;
        const declaredFamily =
            s.grain === "family" || s.stage_operating_plan_v1?.journey_segment === "family";
        if (!declaredFamily) return false;
        const membership = enrollmentStageMembership(s.key);
        return membership?.grain === "family"
            && membership.states.some((state) => state.key === FAMILY_CLOSED_STATUS_KEY);
    });
    return terminal?.key ?? null;
}

function correctProcess(
    process: LifecycleBuilderProcessRecord,
    corrections: ClosedLostCorrection[],
    refusals: ClosedLostCorrection[],
): LifecycleBuilderProcessRecord {
    const active = new Set(process.stages.filter((s) => s.is_active).map((s) => s.key));

    // Only exits that CLOSE and point at a stage this process does not have.
    const broken = new Map<string, string>(); // transition_ref -> missing destination
    for (const stage of process.stages) {
        for (const exit of stage.stage_operating_plan_v1?.outgoing_transitions ?? []) {
            const closes = exit.closes_record === true || (exit.status_key ?? "").trim() === "closed";
            if (closes && !active.has(exit.target_stage_key)) broken.set(exit.transition_ref, exit.target_stage_key);
        }
    }
    if (!broken.size) return process;

    const terminal = resolveFamilyTerminalStage(process);
    if (!terminal) {
        refusals.push({
            process_key: process.key,
            change:
                `${broken.size} closing exit(s) point at a stage this process does not have `
                + `(${[...new Set(broken.values())].join(", ")}), and no family terminal stage could be `
                + `resolved to send them to instead. Nothing was changed.`,
        });
        return process;
    }

    const patch = lostClosePatch();
    if (!patch) {
        refusals.push({
            process_key: process.key,
            change: "the canonical lost-close mapping is unavailable, so the close reason could not be preserved",
        });
        return process;
    }

    const stages = process.stages.map((stage) => {
        const plan = stage.stage_operating_plan_v1;
        if (!plan) return stage;
        const exits = plan.outgoing_transitions ?? [];
        const mine = exits.filter((e) => broken.has(e.transition_ref));
        if (!mine.length) return stage;

        for (const exit of mine) {
            corrections.push({
                process_key: process.key,
                change:
                    `${stage.key}: "${exit.label ?? exit.transition_ref}" pointed at absent stage `
                    + `"${broken.get(exit.transition_ref)}" -> "${terminal}", with the case closed as `
                    + `${patch.close_reason_key} so the distinction survives the move`,
            });
        }
        const refs = new Set(mine.map((e) => e.transition_ref));

        /*
         * The reason has to ride on the outcome, not the transition: `StageOutgoingTransitionV1`
         * carries `status_key` and `closes_record` but no `close_reason_key`. Only
         * `update_family_case_status` accepts one, so the rule gains that target where it lacks it.
         * Without this, repointing would close every lost case as an ordinary closure.
         */
        const outcome_rules = (plan.outcome_rules ?? []).map((rule) => {
            const usesBrokenExit = (rule.targets ?? []).some(
                (t) => t.kind === "move_to_stage" && typeof t.transition_ref === "string" && refs.has(t.transition_ref),
            );
            if (!usesBrokenExit) return rule;
            const alreadyRecordsReason = (rule.targets ?? []).some(
                (t) => t.kind === "update_family_case_status" && (t.close_reason_key ?? "").trim(),
            );
            if (alreadyRecordsReason) return rule;
            const reasonTarget = {
                kind: "update_family_case_status",
                status_key: patch.status_key,
                close_reason_key: patch.close_reason_key,
            } as StageOutcomeRuleTargetV1;
            // Before the movement, so the case carries its reason even if the move is refused.
            return { ...rule, targets: [reasonTarget, ...(rule.targets ?? [])] };
        });

        return {
            ...stage,
            stage_operating_plan_v1: {
                ...plan,
                outcome_rules,
                outgoing_transitions: exits.map((e) =>
                    broken.has(e.transition_ref) ? { ...e, target_stage_key: terminal } : e,
                ),
            },
        };
    });

    return { ...process, stages };
}

export function correctInvalidClosedLostTargets(builder: LifecycleBuilderV1): ClosedLostCorrectionResult {
    const corrections: ClosedLostCorrection[] = [];
    const refusals: ClosedLostCorrection[] = [];
    const processes = builder.processes.map((p) => correctProcess(p, corrections, refusals));
    return {
        builder: { ...builder, processes },
        corrections,
        refusals,
        alreadyCorrect: corrections.length === 0 && refusals.length === 0,
    };
}
