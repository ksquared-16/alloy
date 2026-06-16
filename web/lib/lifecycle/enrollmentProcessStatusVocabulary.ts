/**
 * Canonical Enrollment Business Process status vocabulary.
 * Family track → opportunities. Child track → opportunity_customer_members.
 */

import {
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

export type EnrollmentStatusVocabularyEntity = "opportunities" | "opportunity_customer_members";

export type EnrollmentStatusVocabularyRow = {
    status_key: string;
    status_label: string;
    sort_order: number;
    stage_key: string;
    entity_type: EnrollmentStatusVocabularyEntity;
    track_key: typeof ENROLLMENT_TRACK_FAMILY_KEY | typeof ENROLLMENT_TRACK_CHILD_KEY;
    active?: boolean;
    terminal?: boolean;
};

export const ENROLLMENT_GENERIC_OPPORTUNITY_CASE_KEYS = new Set([
    "open",
    "closed",
    "inactive",
    "archived",
]);

/** Family / lead pipeline statuses on opportunities — stage rollups only. */
export const ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY: EnrollmentStatusVocabularyRow[] = [
    { status_key: "new_inquiry", status_label: "New Lead", sort_order: 5, stage_key: "lead", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "needs_qualification", status_label: "Contacting", sort_order: 10, stage_key: "lead", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "qualified", status_label: "Qualified", sort_order: 15, stage_key: "qualification", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "tour_requested", status_label: "Tour Requested", sort_order: 20, stage_key: "tour_scheduled", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "tour_scheduled", status_label: "Tour Scheduled", sort_order: 25, stage_key: "tour_scheduled", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "tour_completed", status_label: "Tour Completed", sort_order: 30, stage_key: "tour_completed", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "tour_no_show", status_label: "Tour No-Show", sort_order: 32, stage_key: "tour_completed", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "decision_pending", status_label: "Decision Pending", sort_order: 35, stage_key: "decision_pending", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "lost", status_label: "Lost", sort_order: 50, stage_key: "closed", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY, terminal: true },
    { status_key: "withdrawn", status_label: "Withdrawn", sort_order: 55, stage_key: "closed", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY, terminal: true },
    { status_key: "not_a_fit", status_label: "Not a Fit", sort_order: 60, stage_key: "closed", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY, terminal: true },
    { status_key: "aged_out", status_label: "No Longer Eligible", sort_order: 65, stage_key: "closed", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY, terminal: true },
    { status_key: "not_enrolling", status_label: "Closed", sort_order: 70, stage_key: "closed", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY, terminal: true },
];

/** Child inquiry / enrollment disposition statuses on OCM. */
export const ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY: EnrollmentStatusVocabularyRow[] = [
    { status_key: "waitlisted", status_label: "Waitlisted", sort_order: 20, stage_key: "waitlist", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "offer_pending", status_label: "Offer Pending", sort_order: 22, stage_key: "waitlist", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "waitlist_paused", status_label: "Waitlist Paused", sort_order: 24, stage_key: "waitlist", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "enrolling", status_label: "Enrolling", sort_order: 30, stage_key: "enrolling", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "registration_pending", status_label: "Registration Pending", sort_order: 32, stage_key: "enrolling", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "paperwork_pending", status_label: "Documents Pending", sort_order: 34, stage_key: "enrolling", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "start_date_scheduled", status_label: "Future Start", sort_order: 36, stage_key: "enrolling", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "enrolled", status_label: "Enrolled", sort_order: 40, stage_key: "enrolled", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "withdrawn", status_label: "Withdrawn", sort_order: 50, stage_key: "closed_withdrawn", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
    { status_key: "family_withdrew", status_label: "Family Withdrew", sort_order: 52, stage_key: "closed_withdrawn", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
    { status_key: "not_moving_forward", status_label: "Not Moving Forward", sort_order: 54, stage_key: "closed_withdrawn", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
    { status_key: "aged_out", status_label: "No Longer Eligible", sort_order: 56, stage_key: "closed_withdrawn", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
    { status_key: "not_enrolling", status_label: "Closed", sort_order: 58, stage_key: "closed_withdrawn", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
];

export function enrollmentStatusVocabularyForStage(
    stageKey: string,
    entityType: EnrollmentStatusVocabularyEntity
): EnrollmentStatusVocabularyRow[] {
    const sk = stageKey.trim();
    const source =
        entityType === "opportunities"
            ? ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY
            : ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY;
    return source.filter((r) => r.stage_key === sk);
}

export function enrollmentStatusVocabularyMetadata(
    row: EnrollmentStatusVocabularyRow
): Record<string, unknown> {
    const layer =
        row.entity_type === "opportunities" ? "enrollment_process" : "enrollment_disposition";
    return {
        alloy_layer: layer,
        status_settings_category: "enrollment_statuses",
        process_key: ENROLLMENT_PROCESS_KEY,
        track_key: row.track_key,
        stage_key: row.stage_key,
        process_stage_key: row.stage_key,
        entity_scope: row.entity_type === "opportunities" ? "family_case" : "enrollment_track",
        active: row.active !== false,
        ...(row.terminal ? { terminal: true } : {}),
        seed_source: "enrollment_process_status_vocabulary_v1",
    };
}

export function isGenericEnrollmentCaseContainerStatus(
    statusKey: string,
    metadata: Record<string, unknown> | null | undefined
): boolean {
    if (!ENROLLMENT_GENERIC_OPPORTUNITY_CASE_KEYS.has(statusKey.trim())) return false;
    if (!metadata || typeof metadata !== "object") return true;
    const layer = metadata.alloy_layer;
    return layer == null || layer === "case_status";
}
