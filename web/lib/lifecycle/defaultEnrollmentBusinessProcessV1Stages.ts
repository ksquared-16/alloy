/**
 * @deprecated Enrollment Business Process V1 — replaced by businessProcessTemplates.
 */

import { buildEnrollmentTemplateStageRecords } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { ENROLLMENT_TEMPLATE_STAGE_KEYS } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

/** @deprecated */
export const ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS = [
    { key: "new_lead", label: "New Lead" },
    { key: "contacting", label: "Contacting" },
    { key: "qualification", label: "Qualification" },
    { key: "tour_scheduled", label: "Tour Scheduled" },
    { key: "tour_completed", label: "Tour Completed" },
    { key: "decision_pending", label: "Decision Pending" },
    { key: "closed_lost", label: "Closed Lost" },
    { key: "waitlist", label: "Waitlist" },
    { key: "offered_spot", label: "Offered Spot" },
    { key: "enrolling", label: "Enrolling" },
    { key: "future_start", label: "Future Start" },
    { key: "enrolled", label: "Enrolled" },
    { key: "withdrawn", label: "Withdrawn" },
] as const;

export type EnrollmentBusinessProcessV1StageKey =
    (typeof ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS)[number]["key"];

export const ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_KEYS = ENROLLMENT_TEMPLATE_STAGE_KEYS;

/** @deprecated */
export function defaultEnrollmentBusinessProcessV1Stages(): LifecycleBuilderStageRecord[] {
    return buildEnrollmentTemplateStageRecords();
}
