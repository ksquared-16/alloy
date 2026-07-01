/**
 * Legacy enrollment compat bridge — documented exception.
 *
 * Generic queue runtime may call this ONLY when resolving membership for a
 * known enrollment process stage that lacks explicit queue_membership_v1,
 * or when legacy env-flag child-grain lanes need queue-key fallbacks.
 * New processes should configure membership in the builder.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_STAGE_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStageBindings";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const LEGACY_CANONICAL_KEY_TO_STAGE: Map<string, string> = (() => {
    const m = new Map<string, string>();
    for (const stage of Object.keys(ENROLLMENT_STAGE_STATUS_KEYS) as LifecycleOperatorStage[]) {
        for (const key of ENROLLMENT_STAGE_STATUS_KEYS[stage]) {
            if (!m.has(key)) m.set(key, stage);
        }
    }
    return m;
})();

/** Granular tour / decision builder stages (V2 stage model). */
const LEGACY_GRANULAR_STATUS_TO_STAGE: Record<string, string> = {
    tour_requested: "tour_scheduled",
    tour_scheduled: "tour_scheduled",
    tour_completed: "tour_completed",
    tour_no_show: "tour_scheduled",
    follow_up_attempted: "tour_completed",
    decision_pending: "decision_pending",
};

/** Legacy status_key → builder stage when metadata has no process_stage_key. */
export function legacyCanonicalProcessStageForStatusKey(statusKey: string): string | null {
    return LEGACY_CANONICAL_KEY_TO_STAGE.get(statusKey.trim()) ?? null;
}

/** Granular status_key → builder stage when coarse legacy bucket is not configured. */
export function legacyGranularProcessStageForStatusKey(statusKey: string): string | null {
    return LEGACY_GRANULAR_STATUS_TO_STAGE[statusKey.trim()] ?? null;
}

/** Legacy OCM disposition keys when builder membership has no explicit rollups. */
const LEGACY_OCM_DISPOSITION_BY_STAGE: Record<string, readonly string[]> = {
    tour: [
        "tour_requested",
        "tour_scheduled",
        "tour_completed",
        "decision_pending",
        "follow_up_attempted",
        "tour_no_show",
    ],
    tour_scheduled: ["tour_requested", "tour_scheduled", "tour_completed", "decision_pending"],
    tour_completed: ["tour_completed", "decision_pending"],
    enrolling: [
        "registration_pending",
        "paperwork_pending",
        "start_date_scheduled",
        "enrolling",
        "ready_to_enroll",
    ],
    enrollment: [
        "registration_pending",
        "paperwork_pending",
        "start_date_scheduled",
        "enrolling",
    ],
    offered_spot: ["offer_pending"],
    future_start: ["start_date_scheduled"],
    enrolled: ["enrolled"],
    waitlist: ["waitlisted", "waitlist_paused"],
};

export function legacyOcmDispositionKeysForStage(stageKey: string): readonly string[] {
    const key = stageKey.trim();
    return LEGACY_OCM_DISPOSITION_BY_STAGE[key] ?? [];
}

/** Legacy env-flag queue key → builder stage (child-grain lanes only). */
const LEGACY_QUEUE_KEY_TO_STAGE: Record<string, string> = {
    tours: "tour",
    tours_follow_up: "tour",
    enrollment_offers: "enrolling",
    enrollment_completed: "enrolled",
};

export function legacyProcessStageKeyForQueueKey(queueKey: string): string | null {
    return LEGACY_QUEUE_KEY_TO_STAGE[queueKey.trim()] ?? null;
}

const LEGACY_STAGE_LABELS: Record<string, string> = {
    tour: "Tour",
    enrolling: "Enrolling",
    enrollment: "Enrolling",
    enrolled: "Enrolled",
    waitlist: "Waitlist",
};

export function legacyProcessStageLabel(stageKey: string): string {
    const key = stageKey.trim();
    return LEGACY_STAGE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type LegacyChildTrackLaneContext = {
    enabled: true;
    queueKey: string;
    stageKey: string;
    stageLabel: string;
    dispositionKeys: readonly string[];
};

/** Child-grain env flag fallback — enrollment queue keys only. */
export function legacyChildTrackLaneForQueueKey(queueKey: string): LegacyChildTrackLaneContext | null {
    const stageKey = legacyProcessStageKeyForQueueKey(queueKey);
    if (!stageKey) return null;
    const dispositionKeys = legacyOcmDispositionKeysForStage(stageKey);
    if (!dispositionKeys.length) return null;
    return {
        enabled: true,
        queueKey: queueKey.trim(),
        stageKey,
        stageLabel: legacyProcessStageLabel(stageKey),
        dispositionKeys,
    };
}

/** Template-only operating plan default for enrollment process stages. */
export function legacyEnrollmentOperatingPlanDefault(stageKey: string): StageOperatingPlanV1 | null {
    return defaultStageOperatingPlanForEnrollmentStage(stageKey);
}

export function enrollmentQueueMembershipLegacyFallback(
    stageKey: string,
    processKey: string,
): QueueMembershipV1 | null {
    if (processKey.trim() !== ENROLLMENT_PROCESS_KEY) return null;
    return defaultEnrollmentQueueMembershipForStage(stageKey);
}

/** Legacy enrollment pipeline queue key aliases — not used for non-enrollment processes. */
const ENROLLMENT_PIPELINE_QUEUE_ALIASES: Record<string, readonly string[]> = {
    lead: ["leads", "new_leads", "new_inquiries", "lead", "new_lead"],
    qualification: ["qualification"],
    tour: ["tours", "tours_follow_up"],
    decision: ["decision", "decision_pending"],
    closed: ["closed", "closed_lost"],
    waitlist: ["waitlist"],
    enrolling: ["enrollment_offers", "enrollment"],
    enrollment: ["enrollment_offers"],
    enrolled: ["enrollment_completed"],
    closed_withdrawn: ["withdrawn"],
};

export function enrollmentPipelineQueueKeyAliases(
    lifecycleKey: string,
    stageKey: string,
): readonly string[] {
    if (lifecycleKey.trim() !== ENROLLMENT_PROCESS_KEY) return [];
    return ENROLLMENT_PIPELINE_QUEUE_ALIASES[stageKey.trim()] ?? [];
}
