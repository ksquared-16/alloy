/**
 * Queue Row Builder — item library catalog (zones, fields, widgets).
 * Registry refKeys only — no fabricated fields.
 */

import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import {
    buildQueueRecordWidgetPickerCatalog,
    QUEUE_RECORD_WIDGET_PICKER_EXCLUSIONS,
} from "@/lib/layout/queueRecordLayoutAllowList";
import {
    availableFieldsForZone,
    type AvailableField,
} from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type QueueRowLibraryZoneKey = (typeof QUEUE_RECORD_LAYOUT_ZONES)[number];

export type QueueRowLibraryZoneItem = { kind: "zone"; zoneKey: QueueRowLibraryZoneKey; label: string };

export type QueueRowLibraryFieldItem = {
    kind: "field";
    zoneKey: QueueRowLibraryZoneKey;
    fieldKey: string;
    label: string;
    isSystemField: boolean;
    category: QueueRowLibraryCategoryKey;
};

export type QueueRowLibraryWidgetItem = {
    kind: "widget";
    zoneKey: QueueRowLibraryZoneKey;
    widgetKey: string;
    label: string;
    description?: string;
    category: QueueRowLibraryCategoryKey;
};

export type QueueRowLibraryItem = QueueRowLibraryZoneItem | QueueRowLibraryFieldItem | QueueRowLibraryWidgetItem;

export type QueueRowLibraryCategoryKey =
    | "family_parents"
    | "child"
    | "status"
    | "tour"
    | "waitlist_placement"
    | "operational";

export type QueueRowLibraryCategory = {
    key: QueueRowLibraryCategoryKey;
    label: string;
    items: Array<QueueRowLibraryFieldItem | QueueRowLibraryWidgetItem>;
};

const ZONE_OPERATOR_LABELS: Record<QueueRowLibraryZoneKey, string> = {
    household: "Family / Parents",
    children: "Child",
    status: "Status",
    attention: "Attention",
    date_event: "Dates",
    actions: "Actions",
};

const LIBRARY_CATEGORY_ORDER: QueueRowLibraryCategoryKey[] = [
    "family_parents",
    "child",
    "status",
    "tour",
    "waitlist_placement",
    "operational",
];

const LIBRARY_CATEGORY_LABELS: Record<QueueRowLibraryCategoryKey, string> = {
    family_parents: "Family / Parents",
    child: "Child",
    status: "Status",
    tour: "Tour",
    waitlist_placement: "Waitlist / Placement",
    operational: "Operational",
};

const FIELD_LIBRARY_LABELS: Record<string, string> = {
    "customer.display_name": "Family name",
    "queue_row.subject_label": "Family name",
    "person.primary_contact_name": "Primary parent",
    "person.phone": "Phone",
    "person.email": "Email",
    "child.name": "Child name",
    "child.date_of_birth": "Age / DOB",
    "child.status": "Child status",
    "child.start_date": "Desired start date",
    "inquiry_child.program": "Program interest",
    "inquiry_child.program_category": "Program preference",
    "inquiry_child.schedule_type": "Schedule type",
    "child.room": "Room",
    "queue_row.stage_label": "Stage",
    "opportunity.status_label": "Status pill",
    "opportunity.attention_reason": "Follow-up needed",
    "queue_row.next_best_action_label": "Readiness",
    "opportunity.next_step": "Next action",
    "opportunity.tour_date": "Tour date",
    "opportunity.location": "Location / room",
    "queue_row.work_summary": "Tasks",
    "queue_row.group_count_label": "Grouped count",
    "waitlist.positionLabel": "Waitlist rank",
    "waitlist.tierLabel": "Child priority",
    "waitlist.priorityLabel": "Child priority",
    "waitlist.waitSince": "Wait since",
    "waitlist.siblingContext": "Sibling context",
    "overrides.flags": "Placement adjustment",
};

const WIDGET_LIBRARY_LABELS: Record<string, string> = {
    attention: "Attention",
    current_work: "Tasks",
    follow_ups: "Follow-up needed",
    activity_timeline: "Last activity",
};

const FIELD_CATEGORY: Record<string, QueueRowLibraryCategoryKey> = {
    "customer.display_name": "family_parents",
    "queue_row.subject_label": "family_parents",
    "person.primary_contact_name": "family_parents",
    "person.phone": "family_parents",
    "person.email": "family_parents",
    "child.name": "child",
    "child.date_of_birth": "child",
    "child.status": "child",
    "child.start_date": "child",
    "inquiry_child.program": "child",
    "inquiry_child.schedule_type": "child",
    "child.room": "child",
    "queue_row.stage_label": "status",
    "opportunity.status_label": "status",
    "opportunity.attention_reason": "status",
    "queue_row.next_best_action_label": "status",
    "opportunity.location": "status",
    "queue_row.group_count_label": "status",
    "opportunity.tour_date": "tour",
    "queue_row.work_summary": "operational",
    "opportunity.next_step": "operational",
    "waitlist.positionLabel": "waitlist_placement",
    "waitlist.tierLabel": "waitlist_placement",
    "waitlist.priorityLabel": "waitlist_placement",
    "waitlist.waitSince": "waitlist_placement",
    "waitlist.siblingContext": "waitlist_placement",
    "inquiry_child.program_category": "waitlist_placement",
    "overrides.flags": "waitlist_placement",
};

const WIDGET_CATEGORY: Record<string, QueueRowLibraryCategoryKey> = {
    attention: "status",
    follow_ups: "status",
    current_work: "operational",
    activity_timeline: "operational",
};

const WIDGET_ZONE: Record<string, QueueRowLibraryZoneKey> = {
    attention: "attention",
    current_work: "attention",
    follow_ups: "attention",
    activity_timeline: "attention",
};

const ZONE_DEFAULT_CATEGORY: Partial<Record<QueueRowLibraryZoneKey, QueueRowLibraryCategoryKey>> = {
    household: "family_parents",
    children: "child",
    status: "status",
    attention: "operational",
    date_event: "tour",
};

export function queueRowZoneLabel(zoneKey: QueueRowLibraryZoneKey): string {
    return ZONE_OPERATOR_LABELS[zoneKey] ?? zoneKey;
}

function fieldCategory(fieldKey: string, zoneKey: QueueRowLibraryZoneKey): QueueRowLibraryCategoryKey {
    return FIELD_CATEGORY[fieldKey] ?? ZONE_DEFAULT_CATEGORY[zoneKey] ?? "operational";
}

export function buildQueueRowLibraryCatalog(args: {
    isWaitlist: boolean;
    inRowZoneKeys: readonly QueueRowLibraryZoneKey[];
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
}): QueueRowLibraryItem[] {
    const inRow = new Set(args.inRowZoneKeys);
    const items: QueueRowLibraryItem[] = [];

    for (const zoneKey of QUEUE_RECORD_LAYOUT_ZONES) {
        if (zoneKey === "actions") continue;
        if (!inRow.has(zoneKey)) {
            items.push({ kind: "zone", zoneKey, label: queueRowZoneLabel(zoneKey) });
        }
        for (const field of availableFieldsForZone(zoneKey, args.isWaitlist, args.tenantFieldDefinitions)) {
            items.push(fieldItem(zoneKey, field));
        }
    }

    for (const widget of buildQueueRecordWidgetPickerCatalog()) {
        const zoneKey = WIDGET_ZONE[widget.widgetKey] ?? "attention";
        items.push({
            kind: "widget",
            zoneKey,
            widgetKey: widget.widgetKey,
            label: WIDGET_LIBRARY_LABELS[widget.widgetKey] ?? widget.label,
            description: widget.description ?? QUEUE_RECORD_WIDGET_PICKER_EXCLUSIONS[widget.widgetKey],
            category: WIDGET_CATEGORY[widget.widgetKey] ?? "operational",
        });
    }

    return items;
}

function fieldItem(zoneKey: QueueRowLibraryZoneKey, field: AvailableField): QueueRowLibraryFieldItem {
    return {
        kind: "field",
        zoneKey,
        fieldKey: field.key,
        label: FIELD_LIBRARY_LABELS[field.key] ?? field.label,
        isSystemField: field.isSystemField,
        category: fieldCategory(field.key, zoneKey),
    };
}

export function filterLibraryForTargetZone(
    items: readonly QueueRowLibraryItem[],
    targetZone: QueueRowLibraryZoneKey | null,
): QueueRowLibraryItem[] {
    if (!targetZone) return [...items];
    return items.filter((item) => item.zoneKey === targetZone || item.kind === "zone");
}

export function libraryItemsByCategory(items: readonly QueueRowLibraryItem[]): QueueRowLibraryCategory[] {
    const buckets = new Map<QueueRowLibraryCategoryKey, Array<QueueRowLibraryFieldItem | QueueRowLibraryWidgetItem>>();
    for (const item of items) {
        if (item.kind === "zone") continue;
        const list = buckets.get(item.category) ?? [];
        list.push(item);
        buckets.set(item.category, list);
    }
    return LIBRARY_CATEGORY_ORDER.filter((key) => (buckets.get(key)?.length ?? 0) > 0).map((key) => ({
        key,
        label: LIBRARY_CATEGORY_LABELS[key],
        items: buckets.get(key) ?? [],
    }));
}
