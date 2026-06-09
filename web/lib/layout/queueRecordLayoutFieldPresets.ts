import type { LayoutCondition } from "@/lib/layout/layoutV2";

export const QUEUE_RECORD_FIELD_CONDITION_PRESETS: { key: string; label: string; cond?: LayoutCondition }[] = [
    { key: "", label: "Always" },
    { key: "sec_contact", label: "If secondary contact exists", cond: { type: "exists", path: "person.secondary_contact_name" } },
    { key: "primary_contact", label: "If primary contact exists", cond: { type: "exists", path: "person.primary_contact_name" } },
    { key: "tour_exists", label: "If tour date exists", cond: { type: "exists", path: "opportunity.tour_date" } },
    { key: "tour_scheduled", label: "If tour = scheduled", cond: { type: "equals", path: "opportunity.tour_status", value: "scheduled" } },
];

export function queueRecordFieldConditionKey(cond?: LayoutCondition): string {
    if (!cond) return "";
    return (
        QUEUE_RECORD_FIELD_CONDITION_PRESETS.find((p) => p.cond && JSON.stringify(p.cond) === JSON.stringify(cond))?.key ??
        "custom"
    );
}
