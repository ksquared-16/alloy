/**
 * Resolve OCM outcome_status_key for a process split outcome (generic — no template imports).
 */

import type { ProcessSplitOutcomeV1 } from "@/lib/businessProcesses/processConfigTypes";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

/** Fallback disposition keys when stage membership is not configured. */
const SPLIT_OUTCOME_DEFAULT_STATUS_KEY: Record<string, string> = {
    waitlist: "waitlisted",
    enrolling: "enrolling",
    closed_withdrawn: "family_withdrew",
};

function trimKey(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

function stageForKey(process: LifecycleBuilderProcessRecord | null, stageKey: string | null): LifecycleBuilderStageRecord | null {
    if (!process || !stageKey) return null;
    return process.stages.find((s) => s.is_active && s.key === stageKey) ?? null;
}

function firstDispositionFromStage(stage: LifecycleBuilderStageRecord | null): string | null {
    if (!stage) return null;
    const membership = parseQueueMembershipV1(stage.queue_membership_v1);
    const keys = membership?.included_disposition_keys ?? [];
    for (const key of keys) {
        const t = trimKey(key);
        if (t) return t;
    }
    return null;
}

/**
 * Map a split `outcome_key` to the OCM `outcome_status_key` to persist.
 * Returns null for `no_action` or unknown skip outcomes.
 */
export function resolveDecisionSplitOutcomeStatusKey(params: {
    outcomeKey: string;
    splitOutcome?: ProcessSplitOutcomeV1 | null;
    process?: LifecycleBuilderProcessRecord | null;
}): string | null {
    const outcomeKey = trimKey(params.outcomeKey);
    if (!outcomeKey || outcomeKey === "no_action") return null;

    const targetStageKey = trimKey(params.splitOutcome?.target_stage_key);
    if (targetStageKey) {
        const stage = stageForKey(params.process ?? null, targetStageKey);
        const membership = parseQueueMembershipV1(stage?.queue_membership_v1);
        const dispositionKeys = membership?.included_disposition_keys ?? [];
        const preferredDefault = SPLIT_OUTCOME_DEFAULT_STATUS_KEY[outcomeKey];
        if (preferredDefault && dispositionKeys.includes(preferredDefault)) {
            return preferredDefault;
        }
        const fromMembership = firstDispositionFromStage(stage);
        if (fromMembership) return fromMembership;
    }

    return SPLIT_OUTCOME_DEFAULT_STATUS_KEY[outcomeKey] ?? null;
}
