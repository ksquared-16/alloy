/**
 * Whether lifecycle stage work should close after an outcome is recorded.
 * Success and terminal non-success close; retry outcomes keep the work intent open.
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
