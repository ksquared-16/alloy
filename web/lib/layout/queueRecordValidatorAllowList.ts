/**
 * Queue row v3 — validator allow-list (single source of truth).
 *
 * Field refs must be resolvable on queue row runtime records
 * (`buildOpportunityQueueRowRecordFromPreview`, queue context enrichment,
 * child repeater rows). Picker-visible refs are derived from this list only.
 *
 * Invariant: VISIBLE_QUEUE_PICKER_REFS(layoutKind) ⊆ VALIDATOR_ALLOWED_QUEUE_REFS(layoutKind)
 */

import {
    collectRefKeysFromQueueRecordLayoutV3,
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { contactRoleFieldRefs } from "@/lib/layout/layoutEditorContactRoles";
import { WAITLIST_PLACEMENT_FIELD_KEYS } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import { validateRefKeyForWrite } from "@/lib/layout/layoutRefKeyAliases";

/** Pipeline anchor + presentation fields from queue preview / context enrichment. */
const PIPELINE_QUEUE_ROW_ANCHOR_FIELD_REFS = [
    "customer.display_name",
    "customer.name",
    "person.primary_contact_name",
    "person.primary_phone",
    "person.primary_email",
    "person.phone",
    "person.email",
    "person.id",
    "person.is_primary_contact",
    "opportunity.primary_person_id",
    "opportunity.status_key",
    "opportunity.status_label",
    "opportunity.location",
    "opportunity.attention_reason",
    "opportunity.next_step",
    "opportunity.tour_date",
    "status_key",
    "next_step",
    "last_activity",
    "last_activity_at",
    "last_activity_summary",
    "queue_row.subject_label",
    "queue_row.stage_label",
    "queue_row.group_count_label",
    "queue_row.work_summary",
    "queue_row.next_best_action_label",
] as const;

/** Contact role display refs overlayable on queue row records when present. */
function queueContactRoleDisplayRefs(): string[] {
    const primary = contactRoleFieldRefs("primary");
    const secondary = contactRoleFieldRefs("secondary");
    const billing = contactRoleFieldRefs("billing");
    const emergency = contactRoleFieldRefs("emergency");
    return [
        primary.name,
        primary.email,
        primary.phone,
        secondary.name,
        secondary.email,
        secondary.phone,
        billing.name,
        billing.email,
        billing.phone,
        emergency.name,
        emergency.email,
        emergency.phone,
        "person.secondary_contact_name",
        "person.secondary_phone",
        "person.secondary_email",
        "person.billing_contact_name",
        "person.billing_contact_phone",
        "person.billing_contact_email",
        "person.emergency_contact_name",
        "person.emergency_contact_phone",
        "person.emergency_contact_email",
    ];
}

/** Child / inquiry_child refs on queue repeater rows and preview children. */
const PIPELINE_QUEUE_CHILD_REPEATER_FIELD_REFS = [
    "child.id",
    "child.name",
    "child.display_name",
    "child.age_band",
    "child.program",
    "child.status",
    "child.location",
    "child.date_of_birth",
    "child.start_date",
    "child.room",
    "inquiry_child.program",
    "inquiry_child.program_category_id",
    "inquiry_child.schedule_type",
    "inquiry_child.start_date",
    "inquiry_child.location_id",
    "inquiry_child.program_room_cohort_key",
    "inquiry_child.outcome_status_key",
    "inquiry_child.notes",
] as const;

/** Waitlist candidate anchor fields from placement waitlist preview builder. */
const WAITLIST_QUEUE_ROW_ANCHOR_FIELD_REFS = [
    ...PIPELINE_QUEUE_ROW_ANCHOR_FIELD_REFS,
    "child.start_date",
    ...WAITLIST_PLACEMENT_FIELD_KEYS,
    "candidateId",
] as const;

function mergeUniqueSorted(...sets: readonly (readonly string[])[]): readonly string[] {
    const merged = new Set<string>();
    for (const set of sets) {
        for (const key of set) merged.add(key);
    }
    return [...merged].sort();
}

function buildPipelineQueueRecordValidatorFieldRefKeys(): readonly string[] {
    return mergeUniqueSorted(
        PIPELINE_QUEUE_ROW_ANCHOR_FIELD_REFS,
        PIPELINE_QUEUE_CHILD_REPEATER_FIELD_REFS,
        queueContactRoleDisplayRefs(),
        collectRefKeysFromQueueRecordLayoutV3(defaultLeadQueueLayoutV3()),
    );
}

function buildWaitlistQueueRecordValidatorFieldRefKeys(): readonly string[] {
    return mergeUniqueSorted(
        WAITLIST_QUEUE_ROW_ANCHOR_FIELD_REFS,
        PIPELINE_QUEUE_CHILD_REPEATER_FIELD_REFS,
        queueContactRoleDisplayRefs(),
        collectRefKeysFromQueueRecordLayoutV3(defaultWaitlistQueueLayoutV3()),
    );
}

export const PIPELINE_QUEUE_RECORD_VALIDATOR_FIELD_REFS = buildPipelineQueueRecordValidatorFieldRefKeys();
export const WAITLIST_QUEUE_RECORD_VALIDATOR_FIELD_REFS = buildWaitlistQueueRecordValidatorFieldRefKeys();

export type QueueRecordLayoutKind = "pipeline" | "waitlist";

export function queueRecordLayoutKind(isWaitlist: boolean): QueueRecordLayoutKind {
    return isWaitlist ? "waitlist" : "pipeline";
}

/** Validator allow-list for pipeline or waitlist queue row layouts. */
export function validatorAllowedQueueRecordFieldRefKeys(isWaitlist = false): readonly string[] {
    return isWaitlist ? WAITLIST_QUEUE_RECORD_VALIDATOR_FIELD_REFS : PIPELINE_QUEUE_RECORD_VALIDATOR_FIELD_REFS;
}

export function isValidatorAllowedQueueRecordFieldRefKey(refKey: string, isWaitlist = false): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;
    const writeGuard = validateRefKeyForWrite(trimmed);
    if (!writeGuard.ok) return false;
    return validatorAllowedQueueRecordFieldRefKeys(isWaitlist).includes(trimmed);
}
