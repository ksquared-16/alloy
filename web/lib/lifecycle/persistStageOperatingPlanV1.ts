/**
 * The stage-operating-plan seed DECISION — creation-time only.
 *
 * `persistStageOperatingPlanForLifecycleStageSave` used to live here and call this decision on
 * every stage save, writing `legacyEnrollmentOperatingPlanDefault(stageKey)` into the published
 * projection whenever the key was absent. Decision D1 forbids that: code defaults are a template
 * applied at process creation, never a save-time or runtime authority. The writer is gone;
 * authoring is `applyStageOperatingPlanDraft`, which persists only what the operator submitted.
 *
 * The decision function survives because process/stage creation legitimately needs it.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { legacyEnrollmentOperatingPlanDefault } from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import {
    STAGE_OPERATING_PLAN_METADATA_KEY,
    parseStageOperatingPlanV1,
    type StageOperatingPlanV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Preserve existing tenant plans; seed only when absent, and only at creation time. */
export function operatingPlanSeedDecision(
    stageKey: string,
    container: unknown,
    processKey: string,
): { action: "seed" | "preserve" | "none"; plan: StageOperatingPlanV1 | null } {
    if (isRecord(container)) {
        const raw = container[STAGE_OPERATING_PLAN_METADATA_KEY];
        if (raw !== undefined) {
            const parsed = parseStageOperatingPlanV1(raw);
            if (parsed) return { action: "preserve", plan: parsed };
            return { action: "none", plan: null };
        }
    }
    if (processKey.trim() === ENROLLMENT_PROCESS_KEY) {
        const defaultPlan = legacyEnrollmentOperatingPlanDefault(stageKey);
        if (defaultPlan) return { action: "seed", plan: defaultPlan };
    }
    return { action: "none", plan: null };
}
