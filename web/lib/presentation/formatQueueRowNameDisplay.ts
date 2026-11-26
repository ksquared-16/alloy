import type { QueueRecordNameDisplay } from "@/lib/layout/queueRecordLayoutV3";

/** Person / child / family name refKeys that support first-name display formatting. */
export const QUEUE_ROW_NAME_FIELD_KEYS = [
    "customer.display_name",
    "queue_row.subject_label",
    "person.primary_contact_name",
    "child.name",
    "sibling.names",
] as const;

export type QueueRowNameFieldKey = (typeof QUEUE_ROW_NAME_FIELD_KEYS)[number];

const LIST_NAME_FIELD_KEYS = new Set<string>(["sibling.names"]);

export function isQueueRowNameFieldKey(fieldKey: string): fieldKey is QueueRowNameFieldKey {
    return (QUEUE_ROW_NAME_FIELD_KEYS as readonly string[]).includes(fieldKey.trim());
}

function firstNameFromFullName(fullName: string): string {
    const trimmed = fullName.trim();
    if (!trimmed) return trimmed;
    return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Apply queue row name display option after the raw value is resolved. */
export function formatQueueRowNameDisplay(
    value: string,
    mode: QueueRecordNameDisplay | undefined,
    fieldKey?: string,
): string {
    const trimmed = value.trim();
    if (!trimmed || !mode || mode === "full_name") return trimmed;
    if (fieldKey && LIST_NAME_FIELD_KEYS.has(fieldKey.trim())) {
        return trimmed
            .split(",")
            .map((part) => firstNameFromFullName(part))
            .filter(Boolean)
            .join(", ");
    }
    return firstNameFromFullName(trimmed);
}
