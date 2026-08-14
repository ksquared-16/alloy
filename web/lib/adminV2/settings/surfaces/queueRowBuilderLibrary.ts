/**
 * Queue Row Builder — item library catalog (zones, fields, widgets).
 * Registry refKeys only — no fabricated fields.
 */

import { QUEUE_RECORD_LAYOUT_ZONES } from "@/lib/layout/surfaceLayoutRegistry";
import {
    availableFieldsForZone,
    type AvailableField,
} from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { WAITLIST_PLACEMENT_FIELD_KEYS } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import {
    buildUnavailableSiblingLibraryEntries,
    isWaitlistCandidateGrainSiblingFieldKey,
} from "@/lib/layout/runtime/queueRowSiblingFieldRegistry";
import { buildUnavailableChildProfileLibraryEntries } from "@/lib/layout/runtime/queueRowChildProfileFieldRegistry";
import { isCompactRowEffectiveFieldKey } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import type { QueueRowSubjectFocusUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";

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

export type QueueRowLibraryUnavailableItem = {
    kind: "unavailable";
    fieldKey: string;
    label: string;
    reason: string;
    category: QueueRowLibraryCategoryKey;
};

export type QueueRowLibraryPickableItem =
    | QueueRowLibraryFieldItem
    | QueueRowLibraryWidgetItem;

export type QueueRowLibraryItem =
    | QueueRowLibraryZoneItem
    | QueueRowLibraryPickableItem
    | QueueRowLibraryUnavailableItem;

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
    items: Array<QueueRowLibraryPickableItem | QueueRowLibraryUnavailableItem>;
};

const ZONE_OPERATOR_LABELS: Record<QueueRowLibraryZoneKey, string> = {
    household: "Family",
    children: "Child",
    status: "Status",
    attention: "Attention",
    date_event: "Tour",
    actions: "Tasks",
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
    family_parents: "Identity",
    child: "Child",
    status: "Status",
    tour: "Tour",
    waitlist_placement: "Waitlist",
    operational: "Tasks",
};

const FIELD_LIBRARY_LABELS: Record<string, string> = {
    "customer.display_name": "Family name",
    "queue_row.subject_label": "Family name",
    "person.primary_contact_name": "Primary parent",
    "person.phone": "Phone",
    "person.email": "Email",
    "child.name": "Child name",
    children: "Children",
    "children.count": "Children count",
    "children.names": "Children names",
    "children.summary": "Children summary",
    "child.date_of_birth": "Date of birth",
    "child.gender": "Gender",
    "child.dob_age": "Age",
    "child.age": "Age",
    "child.age_band": "Age band",
    "child.status": "Child status",
    "child.start_date": "Desired start date",
    "child.location": "Campus / location",
    "inquiry_child.program": "Program",
    "inquiry_child.program_category": "Program",
    "inquiry_child.schedule_type": "Schedule",
    "child.room": "Room",
    "queue_row.stage_label": "Stage",
    "opportunity.status_label": "Status pill",
    "opportunity.attention_reason": "Follow-up needed",
    "queue_row.next_best_action_label": "Readiness",
    "opportunity.next_step": "Next step",
    "opportunity.tour_date": "Tour date",
    "opportunity.location": "Location / room",
    "queue_row.work_summary": "Current work",
    "queue_row.group_count_label": "Grouped count",
    "waitlist.positionLabel": "Waitlist position",
    "waitlist.tierLabel": "Child priority",
    "waitlist.priorityLabel": "Child priority",
    "waitlist.waitSince": "Wait since",
    "waitlist.siblingContext": "Sibling context",
    "sibling.names": "Sibling names",
    "sibling.count": "Sibling count",
    "sibling.enrolled": "Sibling enrolled",
    "sibling.waitlisted": "Sibling waitlisted",
    "sibling.location": "Sibling location",
    "sibling.program": "Sibling program",
    "household.otherChildren": "Other children",
    "overrides.flags": "Placement adjustment",
};

/** Unavailable sibling placeholders — derived from placeholder catalog minus resolver-backed keys. */
export const QUEUE_ROW_UNAVAILABLE_SIBLING_LIBRARY: readonly QueueRowLibraryUnavailableItem[] =
    buildUnavailableSiblingLibraryEntries();

/** Unavailable child profile placeholders — registered fields without queue row resolvers. */
export const QUEUE_ROW_UNAVAILABLE_CHILD_PROFILE_LIBRARY: readonly QueueRowLibraryUnavailableItem[] =
    buildUnavailableChildProfileLibraryEntries();

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
    children: "child",
    "children.count": "child",
    "children.names": "child",
    "children.summary": "child",
    "child.date_of_birth": "child",
    "child.gender": "child",
    "child.dob_age": "child",
    "child.age": "child",
    "child.age_band": "child",
    "child.status": "child",
    "child.start_date": "child",
    "child.location": "child",
    "inquiry_child.program": "child",
    "inquiry_child.schedule_type": "child",
    "child.room": "child",
    "waitlist.siblingContext": "child",
    "sibling.names": "child",
    "sibling.count": "child",
    "sibling.enrolled": "child",
    "sibling.waitlisted": "child",
    "sibling.location": "child",
    "sibling.program": "child",
    "household.otherChildren": "child",
    "queue_row.stage_label": "status",
    "opportunity.status_label": "status",
    "opportunity.attention_reason": "status",
    "queue_row.next_best_action_label": "child",
    "opportunity.location": "child",
    "queue_row.group_count_label": "status",
    "opportunity.tour_date": "tour",
    "queue_row.work_summary": "operational",
    "opportunity.next_step": "operational",
    "waitlist.positionLabel": "waitlist_placement",
    "waitlist.tierLabel": "waitlist_placement",
    "waitlist.priorityLabel": "waitlist_placement",
    "waitlist.waitSince": "waitlist_placement",
    "inquiry_child.program_category": "child",
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

function fieldCategory(fieldKey: string, zoneKey: QueueRowLibraryZoneKey, categoryKey?: string): QueueRowLibraryCategoryKey {
    if (categoryKey) {
        const normalized = categoryKey.trim().toLowerCase();
        if (normalized.includes("child") || normalized === "child_profile" || normalized === "program") return "child";
        if (normalized.includes("identity") || normalized.includes("contact")) return "family_parents";
        if (normalized.includes("status") || normalized.includes("lifecycle")) return "status";
        if (normalized.includes("tour") || normalized.includes("enrollment")) return "tour";
        if (normalized.includes("waitlist")) return "waitlist_placement";
    }
    return FIELD_CATEGORY[fieldKey] ?? ZONE_DEFAULT_CATEGORY[zoneKey] ?? "operational";
}

function fieldItem(zoneKey: QueueRowLibraryZoneKey, field: AvailableField): QueueRowLibraryFieldItem {
    return {
        kind: "field",
        zoneKey,
        fieldKey: field.key,
        label: FIELD_LIBRARY_LABELS[field.key] ?? field.label,
        isSystemField: field.isSystemField,
        category: fieldCategory(field.key, zoneKey, field.categoryKey),
    };
}

export function buildQueueRowLibraryCatalog(args: {
    isWaitlist: boolean;
    includeWaitlistFields?: boolean;
    inRowZoneKeys: readonly QueueRowLibraryZoneKey[];
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
}): QueueRowLibraryItem[] {
    const includeWaitlist = args.isWaitlist || args.includeWaitlistFields === true;
    const inRow = new Set(args.inRowZoneKeys);
    const items: QueueRowLibraryItem[] = [];
    const seenFieldKeys = new Set<string>();

    for (const zoneKey of QUEUE_RECORD_LAYOUT_ZONES) {
        if (zoneKey === "actions") continue;
        if (!inRow.has(zoneKey)) {
            items.push({ kind: "zone", zoneKey, label: queueRowZoneLabel(zoneKey) });
        }
        for (const field of availableFieldsForZone(zoneKey, args.isWaitlist, args.tenantFieldDefinitions)) {
            if (seenFieldKeys.has(field.key)) continue;
            // Picker shows only fields the CondensedQueueRow can actually render.
            if (!isCompactRowEffectiveFieldKey(field.key)) continue;
            seenFieldKeys.add(field.key);
            items.push(fieldItem(zoneKey, field));
        }
        if (zoneKey === "children") {
            for (const key of [
                "children.count",
                "children.names",
                "children.summary",
                "child.room",
            ] as const) {
                if (seenFieldKeys.has(key)) continue;
                if (!isCompactRowEffectiveFieldKey(key)) continue;
                seenFieldKeys.add(key);
                items.push({
                    kind: "field",
                    zoneKey,
                    fieldKey: key,
                    label: FIELD_LIBRARY_LABELS[key] ?? key,
                    isSystemField: true,
                    category: "child",
                });
            }
        }
        if (includeWaitlist && !args.isWaitlist) {
            for (const field of supplementalWaitlistFields(zoneKey, args.tenantFieldDefinitions)) {
                if (seenFieldKeys.has(field.key)) continue;
                if (!isCompactRowEffectiveFieldKey(field.key)) continue;
                seenFieldKeys.add(field.key);
                items.push(fieldItem(zoneKey, field));
            }
        }
    }

    // Widgets are not CondensedQueueRow-effective — omit from the operator picker entirely.
    // Publish already rejects non-compact fields; the picker must match runtime capability.

    if (!args.isWaitlist) {
        // Pipeline: omit waitlist-candidate sibling fields (do not gray them — hide entirely).
        return items.filter(
            (item) =>
                !(item.kind === "field" && isWaitlistCandidateGrainSiblingFieldKey(item.fieldKey)),
        );
    }

    return items;
}

function supplementalWaitlistFields(
    zoneKey: QueueRowLibraryZoneKey,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AvailableField[] {
    const waitlistFields = availableFieldsForZone(zoneKey, true, tenantFieldDefinitions);
    const pipelineKeys = new Set(availableFieldsForZone(zoneKey, false, tenantFieldDefinitions).map((f) => f.key));
    return waitlistFields.filter(
        (f) =>
            !isWaitlistCandidateGrainSiblingFieldKey(f.key) &&
            (WAITLIST_PLACEMENT_FIELD_KEYS.includes(f.key as (typeof WAITLIST_PLACEMENT_FIELD_KEYS)[number]) ||
                !pipelineKeys.has(f.key)),
    );
}

/** Library is slot-driven — no zone filtering. */
export function filterLibraryForTargetZone(
    items: readonly QueueRowLibraryItem[],
    _targetZone: QueueRowLibraryZoneKey | null,
): QueueRowLibraryItem[] {
    return [...items];
}

const ROW_FOCUS_CATEGORY_PRIORITY: Record<QueueRowSubjectFocusUi, QueueRowLibraryCategoryKey[]> = {
    family: ["family_parents", "child", "status", "tour", "waitlist_placement", "operational"],
    child: ["child", "family_parents", "waitlist_placement", "status", "tour", "operational"],
};

export function prioritizeLibraryForRowFocus(
    categories: readonly QueueRowLibraryCategory[],
    rowFocus: QueueRowSubjectFocusUi,
): QueueRowLibraryCategory[] {
    const order = ROW_FOCUS_CATEGORY_PRIORITY[rowFocus];
    const rank = (key: QueueRowLibraryCategoryKey) => {
        const idx = order.indexOf(key);
        return idx === -1 ? order.length : idx;
    };
    return [...categories].sort((a, b) => rank(a.key) - rank(b.key));
}

export function filterLibraryBySearch(
    items: readonly QueueRowLibraryItem[],
    query: string,
): QueueRowLibraryItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...items];
    return items.filter((item) => {
        if (item.kind === "zone") return item.label.toLowerCase().includes(q);
        if (item.kind === "unavailable") {
            return item.label.toLowerCase().includes(q) || item.fieldKey.toLowerCase().includes(q);
        }
        const key = item.kind === "field" ? item.fieldKey : item.widgetKey;
        return item.label.toLowerCase().includes(q) || key.toLowerCase().includes(q);
    });
}

export function libraryItemsByCategory(items: readonly QueueRowLibraryItem[]): QueueRowLibraryCategory[] {
    const buckets = new Map<
        QueueRowLibraryCategoryKey,
        Array<QueueRowLibraryPickableItem | QueueRowLibraryUnavailableItem>
    >();
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
