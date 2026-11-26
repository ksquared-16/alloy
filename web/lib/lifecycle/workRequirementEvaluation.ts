/**
 * IS THE REQUIRED WORK DONE — asked of the canonical work runtime, never re-derived.
 *
 * A stage could already require a field or a form before leaving, with full timing, enforcement and
 * per-transition scoping. It could not require WORK. So `conduct_tour` could be marked required and
 * primary on the Tour stage and an operator could still move the record on without ever resolving
 * it: the work was real, the requirement model simply had no way to reference it.
 *
 * ── WHY THIS IS NOT A SECOND COMPLETION ENGINE ──
 *
 * Everything here reads `StageWorkItemProjection.state`, which the stage work runtime already
 * produces for a subject. Nothing in this module inspects tasks, attempts, outcome rows or
 * `completed_at` arithmetic to form its own opinion about doneness. If the work runtime says
 * `completed`, the requirement is satisfied; if it says anything else, it is not. A second engine
 * would eventually disagree with the first, and the operator would be told their work was both
 * finished and blocking.
 *
 * ── WHY A BLANKET RULE WOULD HAVE BEEN WRONG ──
 *
 * "All required work blocks every stage exit" is the obvious rule and it breaks the product:
 * Lead → Waitlist is a legitimate move while Lead's own Contact Family work is still required and
 * unfinished. Requirements block an exit only where CONFIGURATION says that work is required for
 * THAT transition, which is why this delegates scoping to `requirementAppliesToTransition` — the
 * same predicate field rules use — rather than deciding for itself.
 *
 * Pure. No I/O, no clock. The caller brings the stage's requirements and the work projection.
 */

import {
    requirementAppliesToTransition,
    type TransitionScopedRequirement,
} from "@/lib/lifecycle/requirementTimingEvaluation";
import type { RequirementEnforcement, RequirementEvaluationMoment } from "@/lib/lifecycle/requirementTimingTypes";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

/** The work runtime's own vocabulary for "this is finished". */
const COMPLETED_STATE = "completed";

export type WorkRequirementStatus = {
    readonly requirement_id: string;
    readonly work_template_key: string;
    /** The operator-facing name of the work, from the runtime — never from the requirement. */
    readonly label: string | null;
    readonly satisfied: boolean;
    readonly enforcement: RequirementEnforcement;
    /**
     * True when this requirement, at this moment, must stop the movement.
     *
     * Separate from `satisfied` because enforcement is a different question from completeness: an
     * `attention` requirement can be unsatisfied and still let the operator through, which is a
     * real configuration and not a weaker version of blocking.
     */
    readonly blocking: boolean;
    /**
     * Why it is unsatisfied, in the operator's terms. Null when satisfied.
     *
     * `work_never_started` and `work_open` are deliberately different: one means the stage never
     * produced the work at all — usually a configuration gap the operator needs to see rather than
     * a task they can go and do — and the other means it exists and is waiting for them.
     */
    readonly reason: "work_open" | "work_never_started" | null;
};

export type WorkRequirementEvaluation = {
    readonly statuses: readonly WorkRequirementStatus[];
    /** True when nothing blocking is outstanding — the movement may proceed. */
    readonly allowed: boolean;
    readonly blockers: readonly WorkRequirementStatus[];
};

/** Default when a requirement does not state one. Matches the field-rule evaluator's posture. */
const DEFAULT_ENFORCEMENT: RequirementEnforcement = "blocking";

function workItemsOf(runtime: StageWorkRuntimeProjection | null | undefined): StageWorkItemProjection[] {
    if (!runtime) return [];
    return [...(runtime.primary ? [runtime.primary] : []), ...runtime.additional];
}

/**
 * Whether this requirement is in scope for the moment being evaluated.
 *
 * A `transition` moment consults the authored transition scoping. `stage_exit_progress` — the
 * read-only "what would stop me leaving" projection — deliberately includes every stage_exit
 * requirement regardless of transition, because it is answering about the stage rather than about
 * one particular way out of it.
 */
function requirementInScope(
    requirement: StageRequirementV1,
    moment: RequirementEvaluationMoment,
): boolean {
    const scoping: TransitionScopedRequirement = {
        timing: requirement.timing,
        applies_to_transition_keys: requirement.applies_to_transition_keys,
        excluded_transition_keys: requirement.excluded_transition_keys,
    };
    switch (moment.kind) {
        case "transition":
            return requirementAppliesToTransition(scoping, moment);
        case "stage_exit_progress": {
            const timings = requirement.timing;
            if (timings == null) return false;
            return Array.isArray(timings) ? timings.includes("stage_exit") : timings === "stage_exit";
        }
        default:
            // Work requirements are a stage-exit concern. Other moments own other questions.
            return false;
    }
}

/**
 * Evaluate every work-backed requirement on a stage against the canonical work runtime.
 *
 * Requirements of other kinds are ignored rather than failed: this module answers for `work` only,
 * and the field and form evaluators answer for theirs. A caller that needs the whole picture asks
 * each owner, which is what keeps one kind's semantics out of another's.
 */
export function evaluateWorkRequirements(params: {
    requirements: readonly StageRequirementV1[];
    workRuntime: StageWorkRuntimeProjection | null | undefined;
    moment: RequirementEvaluationMoment;
}): WorkRequirementEvaluation {
    const items = workItemsOf(params.workRuntime);
    const byTemplateKey = new Map(items.map((item) => [item.template_key, item]));
    const statuses: WorkRequirementStatus[] = [];

    for (const requirement of params.requirements) {
        if (requirement.ref.kind !== "work") continue;
        // `recommended` is advice, not a requirement — it never gates a movement.
        if (requirement.level === "recommended") continue;
        if (!requirementInScope(requirement, params.moment)) continue;

        const templateKey = requirement.ref.work_template_key;
        const item = byTemplateKey.get(templateKey) ?? null;
        const satisfied = item?.state === COMPLETED_STATE;
        const enforcement = requirement.enforcement ?? DEFAULT_ENFORCEMENT;

        statuses.push({
            requirement_id: requirement.requirement_id,
            work_template_key: templateKey,
            label: item?.label ?? null,
            satisfied,
            enforcement,
            blocking: !satisfied && enforcement === "blocking",
            reason: satisfied ? null : item ? "work_open" : "work_never_started",
        });
    }

    const blockers = statuses.filter((s) => s.blocking);
    return { statuses, allowed: blockers.length === 0, blockers };
}

/**
 * One operator-facing sentence for a blocked movement.
 *
 * Names the work by the runtime's own label when there is one, because that is the words the
 * operator just saw on the card. A requirement whose work was never instantiated says so plainly —
 * telling someone to "complete Conduct Tour" when no such work exists would send them looking for a
 * button that is not there.
 */
export function explainWorkRequirementBlockers(blockers: readonly WorkRequirementStatus[]): string | null {
    if (!blockers.length) return null;
    const parts = blockers.map((b) => {
        const name = b.label ?? b.work_template_key;
        return b.reason === "work_never_started" ?
                `“${name}” is required before leaving this stage, but it has not been started.`
            :   `“${name}” is required before leaving this stage and is not complete yet.`;
    });
    return parts.join(" ");
}
