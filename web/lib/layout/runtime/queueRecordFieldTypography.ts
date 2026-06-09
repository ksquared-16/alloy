/**
 * Queue record field typography — maps layout display settings to runtime CSS tiers.
 */

import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";

export type QueueRecordTypographyTier = "primary" | "secondary" | "muted" | "caption" | "title";

export function resolveQueueRecordTypographyTier(field: QueueRecordFieldConfig): QueueRecordTypographyTier {
    if (field.emphasis === "title") return "title";

    const key = field.fieldKey.toLowerCase();
    if (key === "person.primary_contact_name") return "primary";
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
    if (field.fieldKey === "person.primary_contact_name") return "queue-record-field--primary-contact";
    if (field.fieldKey === "child.date_of_birth" || field.fieldKey === "child.dob") return "queue-record-field--child-dob";
    if (field.fieldKey === "child.name" || field.fieldKey === "child.display_name") return "queue-record-field--child-name";
    if (field.fieldKey.startsWith("child.")) return "queue-record-field--child-field";
    return "";
}
