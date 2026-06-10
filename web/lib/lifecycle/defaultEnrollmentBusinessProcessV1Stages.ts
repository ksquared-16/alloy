/**
 * Enrollment Business Process V1 — 13 operator-facing process stages (family + child journeys).
 * Used when creating new enrollment processes via the builder (no seed scripts).
 */

import { randomUUID } from "crypto";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

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

export const ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_KEYS = new Set<string>(
    ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS.map((s) => s.key),
);

/** Builder stage records for a new Enrollment Process V1. */
export function defaultEnrollmentBusinessProcessV1Stages(): LifecycleBuilderStageRecord[] {
    return ENROLLMENT_BUSINESS_PROCESS_V1_STAGE_SPECS.map((spec, index) => ({
        id: randomUUID(),
        key: spec.key,
        label: spec.label,
        sort_order: index,
        is_active: true,
    }));
}
