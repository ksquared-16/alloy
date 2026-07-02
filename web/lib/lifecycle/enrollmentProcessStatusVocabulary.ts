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
    /**
     * @deprecated Stage is no longer derived from status — it is the persisted
     * `stage_key` column (S4 status collapse). Retained as an empty string only
     * to preserve the type shape for existing consumers; do NOT read it as a
     * status→stage mapping.
     */
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

/**
 * Collapsed family case durable statuses on opportunities (S4).
 * Durable truth only: open | closed. Operational progress lives on Stage + Work.
 */
export const ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY: EnrollmentStatusVocabularyRow[] = [
    { status_key: "open", status_label: "Open", sort_order: 10, stage_key: "", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "closed", status_label: "Closed", sort_order: 20, stage_key: "", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY, terminal: true },
];

/**
 * Collapsed child enrollment disposition statuses on OCM (S4).
 * null (in-process) | waitlisted | enrolling | enrolled | withdrawn | not_enrolling.
 */
export const ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY: EnrollmentStatusVocabularyRow[] = [
    { status_key: "waitlisted", status_label: "Waitlisted", sort_order: 10, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "enrolling", status_label: "Enrolling", sort_order: 20, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "enrolled", status_label: "Enrolled", sort_order: 30, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "withdrawn", status_label: "Withdrawn", sort_order: 40, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
    { status_key: "not_enrolling", status_label: "Not Enrolling", sort_order: 50, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
];

/**
 * @deprecated Status no longer maps to a single stage (S4). Stage is the persisted
 * `stage_key` column. This returns the full vocabulary for the entity (stage filter
 * is meaningless now) and exists only for back-compat of callers that expected a list.
 */
export function enrollmentStatusVocabularyForStage(
    _stageKey: string,
    entityType: EnrollmentStatusVocabularyEntity
): EnrollmentStatusVocabularyRow[] {
    return entityType === "opportunities"
        ? [...ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY]
        : [...ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY];
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
        entity_scope: row.entity_type === "opportunities" ? "family_case" : "enrollment_track",
        active: row.active !== false,
        ...(row.terminal ? { terminal: true } : {}),
        seed_source: "enrollment_alignment_status_collapse_v1",
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
