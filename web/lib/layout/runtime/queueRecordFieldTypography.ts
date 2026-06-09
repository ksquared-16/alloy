/**
 * Queue record field typography — maps layout display settings to runtime CSS tiers.
 */

import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";

export type QueueRecordTypographyTier = "primary" | "secondary" | "muted" | "caption" | "title";

export function resolveQueueRecordTypographyTier(field: QueueRecordFieldConfig): QueueRecordTypographyTier {
    if (field.emphasis === "title") return "title";

    const key = field.fieldKey.toLowerCase();
    if (key === "queue_row.stage_label" || key === "queue_row.group_count_label") return "caption";
    if (key === "opportunity.location") return "muted";
    if (
        key === "queue_row.work_summary"
        || key === "queue_row.next_best_action_label"
        || key === "opportunity.attention_reason"
        || key === "opportunity.next_step"
    ) {
        return "muted";
    }
    if (key === "person.primary_contact_name") return "secondary";
    if (key.startsWith("child.") && /date_of_birth|\.dob$/.test(key)) return "secondary";
    if (key.startsWith("child.")) return "primary";

    if (field.display === "phone" || field.display === "email") return "secondary";
    if (field.display === "muted") return "muted";
    if (field.display === "date") return "secondary";
    if (field.display === "pill" || field.display === "badge" || field.display === "chip") return "primary";

    return "primary";
}

export function queueRecordFieldTypographyClass(field: QueueRecordFieldConfig): string {
    const tier = resolveQueueRecordTypographyTier(field);
    return `queue-record-field--typography-${tier}`;
}

export function queueRecordFieldModifierClass(field: QueueRecordFieldConfig): string {
    if (field.fieldKey === "queue_row.stage_label") return "queue-record-field--stage-label";
    if (field.fieldKey === "queue_row.subject_label") return "queue-record-field--subject-focus";
    if (field.fieldKey === "opportunity.location") return "queue-record-field--placement-meta";
    if (
        field.fieldKey === "queue_row.work_summary"
        || field.fieldKey === "queue_row.next_best_action_label"
        || field.fieldKey === "opportunity.attention_reason"
    ) {
        return "queue-record-field--context-meta";
    }
    if (field.fieldKey === "person.primary_contact_name") return "queue-record-field--primary-contact";
    if (field.fieldKey === "child.date_of_birth" || field.fieldKey === "child.dob") return "queue-record-field--child-dob";
    if (field.fieldKey === "child.name" || field.fieldKey === "child.display_name") return "queue-record-field--child-name";
    if (field.fieldKey.startsWith("child.")) return "queue-record-field--child-field";
    return "";
}
