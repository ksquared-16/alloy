/**
 * Queue row composer — context-first field picker (not scope-isolated).
 *
 * Column scope controls repeat/resolve behavior; Add Field shows all validator-
 * allowed contexts. Picker refs are generated from `queueRecordValidatorAllowList`
 * with labels resolved from the opportunities field catalog only (legacy zone
 * catalogs are never merged into v3 picker options).
 *
 * Invariant: pickerVisibleRefs ⊆ validatorAllowedQueueRecordFieldRefKeys
 */

import type { LayoutCatalogField, LayoutCatalogGroup, LayoutCatalogWidget } from "@/lib/layout/fieldCatalog";
import { GLOBAL_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import { buildQueueRecordWidgetPickerCatalog } from "@/lib/layout/queueRecordLayoutAllowList";
import { assertChildScopedFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";
import { applyChildcareCatalogLabel } from "@/lib/layout/childcareLayoutFieldCatalog";
import { contactRolePickerRefKeys } from "@/lib/layout/layoutEditorContactRoles";
import { isWaitlistOnlyFieldKey } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import {
    validatorAllowedQueueRecordFieldRefKeys,
} from "@/lib/layout/queueRecordValidatorAllowList";

export type QueueRecordFieldContextKey =
    | "lead_enrollment"
    | "candidate_child"
    | "primary_contact"
    | "secondary_contact"
    | "billing_contact"
    | "emergency_contact"
    | "household_shared"
    | "status_lifecycle"
    | "waitlist_placement"
    | "activity_work"
    | "system";

const QUEUE_FIELD_CONTEXT_ORDER: QueueRecordFieldContextKey[] = [
    "lead_enrollment",
    "candidate_child",
    "primary_contact",
    "secondary_contact",
    "billing_contact",
    "emergency_contact",
    "household_shared",
    "status_lifecycle",
    "waitlist_placement",
    "activity_work",
    "system",
];

const QUEUE_FIELD_CONTEXT_LABELS: Record<QueueRecordFieldContextKey, string> = {
    lead_enrollment: "Lead / Enrollment",
    candidate_child: "Candidate / Child",
    primary_contact: "Primary Contact",
    secondary_contact: "Secondary Contact",
    billing_contact: "Billing Contact",
    emergency_contact: "Emergency Contact",
    household_shared: "Household / Shared",
    status_lifecycle: "Status / Lifecycle",
    waitlist_placement: "Waitlist / Placement",
    activity_work: "Activity / Work",
    system: "System",
};

const QUEUE_FIELD_CONTEXT_DESCRIPTIONS: Partial<Record<QueueRecordFieldContextKey, string>> = {
    lead_enrollment: "Enrollment record and lead-level fields on the queue row",
    candidate_child: "Child or waitlist candidate identity and enrollment participation",
    primary_contact: "Primary contact name, phone, email, and designation",
    household_shared: "Household display name and shared mailing context — not individual contact addresses",
    waitlist_placement: "Waitlist position, tier, priority, overrides, and sibling context",
    activity_work: "Current work, attention, next step, and queue row activity summaries",
};

const PRIMARY_CONTACT_REFS = new Set([
    ...contactRolePickerRefKeys("primary"),
    "person.is_primary_contact",
    "household.primaryContactName",
]);

const SECONDARY_CONTACT_REFS = new Set(contactRolePickerRefKeys("secondary"));
const BILLING_CONTACT_REFS = new Set(contactRolePickerRefKeys("billing"));
const EMERGENCY_CONTACT_REFS = new Set(contactRolePickerRefKeys("emergency"));

const QUEUE_FIELD_FALLBACK_LABELS: Record<string, string> = {
    "queue_row.subject_label": "Subject focus",
    "queue_row.stage_label": "Stage label",
    "queue_row.group_count_label": "Group count",
    "queue_row.work_summary": "Work summary",
    "queue_row.next_best_action_label": "Next best action",
    "waitlist.positionLabel": "Position",
    "waitlist.tierLabel": "Priority tier",
    "waitlist.priorityLabel": "Priority",
    "waitlist.waitSince": "Waitlisted since",
    "waitlist.siblingContext": "Sibling context",
    "overrides.flags": "Override flags",
    "overrides.reason": "Override reason",
    "customer.display_name": "Household display name",
    "person.primary_contact_name": "Primary contact name",
    "person.primary_phone": "Primary phone",
    "person.primary_email": "Primary email",
    "opportunity.status_label": "Status label",
    "opportunity.attention_reason": "Attention reason",
    "opportunity.next_step": "Next step",
    candidateId: "Candidate ID",
};

/** Classify a queue row field ref into an operator context group. */
export function classifyQueueRecordFieldContext(
    refKey: string,
    isWaitlist: boolean,
): QueueRecordFieldContextKey | null {
    const key = refKey.trim();
    if (!key) return null;

    if (isWaitlistOnlyFieldKey(key) || key.startsWith("waitlist.") || key.startsWith("overrides.")) {
        return isWaitlist ? "waitlist_placement" : null;
    }

    if (PRIMARY_CONTACT_REFS.has(key) || (key.startsWith("person.primary_") && !key.includes("address"))) {
        return "primary_contact";
    }
    if (SECONDARY_CONTACT_REFS.has(key) || key.startsWith("person.secondary_")) return "secondary_contact";
    if (BILLING_CONTACT_REFS.has(key) || key.startsWith("person.billing_")) return "billing_contact";
    if (EMERGENCY_CONTACT_REFS.has(key) || key.startsWith("person.emergency_")) return "emergency_contact";

    if (key.startsWith("child.") || key.startsWith("inquiry_child.") || key === "candidateId") {
        return "candidate_child";
    }

    if (
        key.startsWith("customer.")
        || key.startsWith("household.")
        || key.startsWith("location.household_")
    ) {
        return "household_shared";
    }

    if (
        key.startsWith("queue_row.")
        || /attention|next_step|current_work|last_activity|work_summary|next_best_action/.test(key)
    ) {
        return "activity_work";
    }

    if (
        /(?:^|\.)(?:status|lifecycle|stage|disposition|tour_status|attention)(?:_key|_label|_name)?$/i.test(key)
        && !key.startsWith("waitlist.")
    ) {
        return "status_lifecycle";
    }

    if (key.startsWith("person.")) return "primary_contact";

    if (/\.id$|created_at|updated_at|record_id|candidateId/i.test(key)) return "system";

    if (key.startsWith("opportunity.")) return "lead_enrollment";

    return "lead_enrollment";
}

function indexCatalogFieldsByRefKey(groups: LayoutCatalogGroup[]): Map<string, LayoutCatalogField> {
    const byRef = new Map<string, LayoutCatalogField>();
    for (const group of groups) {
        for (const field of group.fields) {
            if (!byRef.has(field.refKey)) byRef.set(field.refKey, field);
        }
    }
    return byRef;
}

function catalogFieldForRefKey(refKey: string, labelByRef: Map<string, LayoutCatalogField>): LayoutCatalogField {
    const fromCatalog = labelByRef.get(refKey);
    if (fromCatalog) {
        const labeled = applyChildcareCatalogLabel(fromCatalog);
        return { ...labeled, fieldLabel: labeled.fieldLabel || labeled.refKey };
    }
    const [entityKey, ...rest] = refKey.split(".");
    const fallbackLabel = QUEUE_FIELD_FALLBACK_LABELS[refKey] ?? refKey;
    return applyChildcareCatalogLabel({
        entityKey: entityKey ?? "opportunity",
        entityLabel: entityKey ?? "opportunity",
        fieldKey: rest.join(".") || refKey,
        fieldLabel: fallbackLabel,
        fieldType: "text",
        refKey,
    });
}

export type QueueRecordPickerBlockFilter = "field_group" | "repeated_record_block" | "widget";

export type BuildQueueRecordPickerCatalogOptions = {
    isWaitlist: boolean;
    /** Label source only — field refs come from validator allow-list. */
    labelCatalogGroups?: LayoutCatalogGroup[];
    widgetCatalog?: readonly LayoutCatalogWidget[];
    /** Only repeated child blocks narrow picker fields; column scope never does. */
    blockFilter?: QueueRecordPickerBlockFilter;
    relationshipKey?: string;
};

/** Build full queue row picker catalog — never filtered by column scope. */
export function buildQueueRecordPickerCatalog(options: BuildQueueRecordPickerCatalogOptions): {
    groups: LayoutCatalogGroup[];
    widgets: LayoutCatalogWidget[];
    fieldCount: number;
    widgetCount: number;
    layoutKindLabel: string;
} {
    const labelGroups = options.labelCatalogGroups ?? [];
    const groups = buildQueueRecordFieldPickerGroups(labelGroups, options.isWaitlist, {
        blockFilter: options.blockFilter,
        relationshipKey: options.relationshipKey ?? "children",
    });
    const widgets = buildQueueRecordWidgetPickerCatalog(options.widgetCatalog ?? GLOBAL_WIDGET_CATALOG);
    const fieldCount = groups.reduce((sum, g) => sum + g.fields.length, 0);
    return {
        groups,
        widgets,
        fieldCount,
        widgetCount: widgets.length,
        layoutKindLabel: options.isWaitlist ? "Waitlist queue row" : "Pipeline queue row",
    };
}

/**
 * Build picker fields from validator allow-list + opportunities catalog labels.
 */
export function buildQueueRecordPickerFieldsFromAllowList(
    labelCatalogGroups: LayoutCatalogGroup[],
    isWaitlist: boolean,
    options?: Pick<BuildQueueRecordPickerCatalogOptions, "blockFilter" | "relationshipKey">,
): LayoutCatalogField[] {
    const labelByRef = indexCatalogFieldsByRefKey(labelCatalogGroups);
    const childBlockOnly = options?.blockFilter === "repeated_record_block";
    const relationshipKey = options?.relationshipKey ?? "children";
    return validatorAllowedQueueRecordFieldRefKeys(isWaitlist).flatMap((refKey) => {
        if (childBlockOnly && !assertChildScopedFieldKey(refKey, relationshipKey)) return [];
        const context = classifyQueueRecordFieldContext(refKey, isWaitlist);
        if (!context) return [];
        const field = catalogFieldForRefKey(refKey, labelByRef);
        return [{ ...field, entityLabel: QUEUE_FIELD_CONTEXT_LABELS[context] }];
    });
}

/**
 * Build context-first picker groups for queue row Add Field.
 * Independent of column scope — only repeated_record_block narrows fields.
 */
export function buildQueueRecordFieldPickerGroups(
    rawGroups: LayoutCatalogGroup[],
    isWaitlist: boolean,
    options?: Pick<BuildQueueRecordPickerCatalogOptions, "blockFilter" | "relationshipKey">,
): LayoutCatalogGroup[] {
    const fields = buildQueueRecordPickerFieldsFromAllowList(rawGroups, isWaitlist, options);
    const buckets = new Map<QueueRecordFieldContextKey, LayoutCatalogField[]>();

    for (const field of fields) {
        const context = classifyQueueRecordFieldContext(field.refKey, isWaitlist);
        if (!context) continue;
        const bucket = buckets.get(context) ?? [];
        bucket.push(field);
        buckets.set(context, bucket);
    }

    return QUEUE_FIELD_CONTEXT_ORDER.flatMap((contextKey) => {
        const groupFields = buckets.get(contextKey);
        if (!groupFields?.length) return [];
        groupFields.sort((a, b) => a.fieldLabel.localeCompare(b.fieldLabel));
        return [
            {
                entityKey: contextKey,
                entityLabel: QUEUE_FIELD_CONTEXT_LABELS[contextKey],
                groupDescription: QUEUE_FIELD_CONTEXT_DESCRIPTIONS[contextKey],
                fields: groupFields,
            },
        ];
    });
}

/** Flat list of all queue-safe picker fields (for cross-group search). */
export function flattenQueueRecordFieldPickerFields(groups: LayoutCatalogGroup[]): LayoutCatalogField[] {
    return groups.flatMap((g) =>
        g.fields.map((f) => ({
            ...f,
            entityLabel: g.entityLabel,
        })),
    );
}

/** Picker-visible ref keys — must be subset of validator allow-list. */
export function queueRecordPickerVisibleRefKeys(
    labelCatalogGroups: LayoutCatalogGroup[],
    isWaitlist: boolean,
    options?: Pick<BuildQueueRecordPickerCatalogOptions, "blockFilter" | "relationshipKey">,
): string[] {
    return buildQueueRecordPickerFieldsFromAllowList(labelCatalogGroups, isWaitlist, options).map((f) => f.refKey);
}
