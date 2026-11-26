/**
 * Whether lifecycle stage work should close after an outcome is recorded.
 * Success and terminal non-success close; retry outcomes keep the work intent open.
 * Leaving the stage is terminal too — work cannot be retried in a stage the record has left.
 */

import { outcomeRulesForKey, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type CloseWorkAfterStageOutcomeReason = "success" | "terminal" | "retry";

export type CloseWorkAfterStageOutcomeDecision = {
    shouldClose: boolean;
    reason: CloseWorkAfterStageOutcomeReason;
};

const TERMINAL_FAMILY_CASE_STATUS_KEYS = new Set(["closed"]);

const TERMINAL_CHILD_DISPOSITION_KEYS = new Set(["enrolled", "withdrawn"]);

function trimKey(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const t = raw.trim().toLowerCase();
    return t || null;
}

function isTerminalOutcomeTarget(target: {
    kind: string;
    status_key?: string | null;
    disposition_key?: string | null;
}): boolean {
    /*
     * WORK CANNOT BE RETRIED IN A STAGE THE RECORD HAS LEFT.
     *
     * Terminality was read only from the two status-moving targets, so an outcome whose configured
     * consequence is `move_to_stage` fell through to "retry" and its work stayed open. Measured on
     * staging: Tour's two completion outcomes are `successful: null` with a single
     * `move_to_stage → tour_transition_2` target, so recording "Tour Completed — Interested"
     * executed the move, provisioned the Decision entry work — and left Conduct Tour open at Tour.
     *
     * That state is not merely untidy. The open work belongs to a stage nobody is standing in, so
     * nothing will ever resolve it, and as prior-stage open work it permanently blocks
     * `tour_transition_2` — the very exit the outcome had just performed.
     *
     * The authored vocabulary already separates the two cases, which is why this can be decided
     * from the target kind alone: an outcome that means "stay and try again" is configured
     * `no_movement` (Tour's Awaiting Family Response and No Show both are), and one that means
     * "leave" is configured `move_to_stage`. Leaving is terminal for the work of the stage departed.
     */
    if (target.kind === "move_to_stage") return true;
    if (target.kind === "update_family_case_status") {
        const statusKey = trimKey(target.status_key);
        return statusKey != null && TERMINAL_FAMILY_CASE_STATUS_KEYS.has(statusKey);
    }
    if (target.kind === "update_child_enrollment_status") {
        const dispositionKey = trimKey(target.disposition_key);
        return dispositionKey != null && TERMINAL_CHILD_DISPOSITION_KEYS.has(dispositionKey);
    }
    return false;
}

function hasTerminalOutcomeMovement(plan: StageOperatingPlanV1, outcomeKey: string): boolean {
    for (const rule of outcomeRulesForKey(plan, outcomeKey)) {
        for (const target of rule.targets) {
            if (isTerminalOutcomeTarget(target)) return true;
        }
    }
    return false;
}

export function shouldCloseWorkAfterStageOutcome(
    plan: StageOperatingPlanV1,
    outcomeKey: string,
): CloseWorkAfterStageOutcomeDecision {
    const key = outcomeKey.trim();
    const outcome = plan.outcomes.find((o) => o.outcome_key === key);
    if (!outcome) {
        return { shouldClose: false, reason: "retry" };
    }

    if (outcome.successful === true) {
        return { shouldClose: true, reason: "success" };
    }

    if (hasTerminalOutcomeMovement(plan, key)) {
        return { shouldClose: true, reason: "terminal" };
    }

    return { shouldClose: false, reason: "retry" };
}
