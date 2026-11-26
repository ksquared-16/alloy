/**
 * Shared field picker context catalog — operator labels and context groups.
 *
 * Single source for context group labels, field display labels, picker visibility,
 * and refKey classification across drawer and queue row composers.
 *
 * Invariant: picker-visible refs ⊆ surface validator allow-list (enforced per surface).
 */

import { applyChildcareCatalogLabel } from "@/lib/layout/childcareLayoutFieldCatalog";
import { contactRolePickerRefKeys } from "@/lib/layout/layoutEditorContactRoles";
import { manifestEntryForRefKey } from "@/lib/layout/platformFieldResolutionManifest";
import { inquiryChildPickerFieldLabel, parseRefKey } from "@/lib/layout/fieldCatalog";
import { isWaitlistOnlyFieldKey } from "@/lib/layout/runtime/queueWaitlistPlacementField";

export type FieldPickerSurface =
    | "opportunity_drawer"
    | "person_drawer"
    | "child_drawer"
    | "pipeline_queue_row"
    | "waitlist_queue_row";

export type FieldPickerContextKey =
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

export type FieldPickerContextGroupDef = {
    contextKey: FieldPickerContextKey;
    entityKey: string;
    entityLabel: string;
    groupDescription?: string;
};

/** Operator-facing context groups — shared between queue row and drawer pickers. */
export const FIELD_PICKER_CONTEXT_GROUP_DEFS: readonly FieldPickerContextGroupDef[] = [
    {
        contextKey: "lead_enrollment",
        entityKey: "lead_enrollment",
        entityLabel: "Lead / Enrollment",
        groupDescription: "Enrollment record and lead-level fields",
    },
    {
        contextKey: "candidate_child",
        entityKey: "candidate_child",
        entityLabel: "Candidate / Child",
        groupDescription: "Child or waitlist candidate identity and enrollment participation",
    },
    {
        contextKey: "primary_contact",
        entityKey: "primary_contact",
        entityLabel: "Primary Contact",
        groupDescription: "Primary contact name, phone, email, and designation",
    },
    {
        contextKey: "secondary_contact",
        entityKey: "contact_secondary",
        entityLabel: "Secondary Contact",
        groupDescription: "Additional associated contact fields",
    },
    {
        contextKey: "billing_contact",
        entityKey: "contact_billing",
        entityLabel: "Billing Contact",
        groupDescription: "Billing and payer contact fields when present",
    },
    {
        contextKey: "emergency_contact",
        entityKey: "contact_emergency",
        entityLabel: "Emergency Contact",
        groupDescription: "Emergency contact fields when present",
    },
    {
        contextKey: "household_shared",
        entityKey: "household_shared",
        entityLabel: "Household / Shared",
        groupDescription: "Household display name and shared mailing context",
    },
    {
        contextKey: "status_lifecycle",
        entityKey: "status_lifecycle",
        entityLabel: "Status / Lifecycle",
        groupDescription: "Pipeline stage, status, and lifecycle presentation",
    },
    {
        contextKey: "waitlist_placement",
        entityKey: "waitlist_placement",
        entityLabel: "Waitlist / Placement",
        groupDescription: "Waitlist position, tier, priority, overrides, and sibling context",
    },
    {
        contextKey: "activity_work",
        entityKey: "activity_work",
        entityLabel: "Activity / Work",
        groupDescription: "Current work, attention, next step, and queue row activity summaries",
    },
    {
        contextKey: "system",
        entityKey: "system",
        entityLabel: "System",
        groupDescription: "Advanced identifiers and system metadata",
    },
] as const;

export const FIELD_PICKER_CONTEXT_ORDER: FieldPickerContextKey[] = FIELD_PICKER_CONTEXT_GROUP_DEFS.map(
    (g) => g.contextKey,
);

export const FIELD_PICKER_CONTEXT_LABELS: Record<FieldPickerContextKey, string> = Object.fromEntries(
    FIELD_PICKER_CONTEXT_GROUP_DEFS.map((g) => [g.contextKey, g.entityLabel]),
) as Record<FieldPickerContextKey, string>;

export const FIELD_PICKER_CONTEXT_DESCRIPTIONS: Partial<Record<FieldPickerContextKey, string>> = Object.fromEntries(
    FIELD_PICKER_CONTEXT_GROUP_DEFS.flatMap((g) =>
        g.groupDescription ? ([[g.contextKey, g.groupDescription]] as const) : [],
    ),
);

/** Queue display projections and queue-only refs — operator labels not in childcare starter catalog. */
export const FIELD_PICKER_QUEUE_LABEL_OVERRIDES: Record<string, string> = {
    "opportunity.location": "Site / Location",
    "opportunity.status_label": "Status",
    "opportunity.status_key": "Status",
    "opportunity.attention_reason": "Attention reason",
    "opportunity.next_step": "Next step",
    "opportunity.tour_date": "Tour date",
    status_key: "Status",
    next_step: "Next step",
    last_activity: "Last activity",
    last_activity_at: "Last activity date",
    last_activity_summary: "Last activity summary",
    "child.name": "Child full name",
    "child.display_name": "Child full name",
    "child.age_band": "Age",
    "child.program": "Program",
    "child.status": "Status",
    "child.location": "Location",
    "child.room": "Room",
    "child.start_date": "Desired start date",
    "customer.display_name": "Household name",
    "customer.name": "Household name",
    "waitlist.positionLabel": "Waitlist position",
    "waitlist.tierLabel": "Tier",
    "waitlist.priorityLabel": "Priority",
    "waitlist.waitSince": "Waitlisted since",
    "waitlist.siblingContext": "Sibling context",
    "sibling.names": "Sibling names",
    "sibling.count": "Sibling count",
    "sibling.enrolled": "Sibling enrolled",
    "sibling.waitlisted": "Sibling waitlisted",
    "sibling.location": "Sibling location",
    "sibling.program": "Sibling program",
    "household.otherChildren": "Other children",
    "overrides.flags": "Overrides",
    "overrides.reason": "Override reason",
    candidateId: "Candidate ID",
    "queue_row.subject_label": "Subject focus",
    "queue_row.stage_label": "Stage label",
    "queue_row.group_count_label": "Group count",
    "queue_row.work_summary": "Work summary",
    "queue_row.next_best_action_label": "Next best action",
};

/** Backend / link infrastructure refs — hidden from operator pickers (validator may still accept). */
export const FIELD_PICKER_HIDDEN_BACKEND_REFS = new Set<string>([
    "opportunity.primary_person_id",
    "person.id",
    "child.id",
    "inquiry_child.location_id",
    "opportunity.id",
    "customer.id",
    "work_unit_id",
]);

const PRIMARY_CONTACT_REFS = new Set([
    ...contactRolePickerRefKeys("primary"),
    "person.is_primary_contact",
    "household.primaryContactName",
]);

const SECONDARY_CONTACT_REFS = new Set(contactRolePickerRefKeys("secondary"));
const BILLING_CONTACT_REFS = new Set(contactRolePickerRefKeys("billing"));
const EMERGENCY_CONTACT_REFS = new Set(contactRolePickerRefKeys("emergency"));

function humanizeToken(token: string): string {
    return token
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function isQueueSurface(surface: FieldPickerSurface): boolean {
    return surface === "pipeline_queue_row" || surface === "waitlist_queue_row";
}

/** True when refKey is a backend id / FK — not shown in operator pickers. */
export function isFieldPickerBackendOnlyRef(refKey: string): boolean {
    const key = refKey.trim();
    if (!key) return true;
    if (FIELD_PICKER_HIDDEN_BACKEND_REFS.has(key)) return true;

    const fieldKey = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
    if (fieldKey === "id" || fieldKey === "org_id") return true;
    if (fieldKey.endsWith("_id") || fieldKey.endsWith("_uuid")) return true;
    return false;
}

/** Whether a ref should appear in operator-facing Add Field pickers for the surface. */
export function isFieldPickerOperatorVisible(refKey: string, surface: FieldPickerSurface): boolean {
    const key = refKey.trim();
    if (!key) return false;
    if (isQueueSurface(surface) && isFieldPickerBackendOnlyRef(key)) return false;
    return true;
}

/**
 * Operator-facing label for any layout field refKey.
 * Uses childcare catalog → manifest → surface overrides → humanize.
 */
export function resolveFieldPickerLabel(refKey: string, surface?: FieldPickerSurface): string {
    const trimmed = refKey.trim();
    if (!trimmed) return "Field";

    if (surface && isQueueSurface(surface)) {
        const queueOverride = FIELD_PICKER_QUEUE_LABEL_OVERRIDES[trimmed];
        if (queueOverride) return queueOverride;
    }

    const catalog = applyChildcareCatalogLabel({ refKey: trimmed, fieldLabel: trimmed });
    if (catalog.fieldLabel && catalog.fieldLabel !== trimmed) return catalog.fieldLabel;

    const manifest = manifestEntryForRefKey(trimmed);
    if (manifest?.label) {
        const parsed = parseRefKey(trimmed);
        if (parsed.entityKey === "inquiry_child") {
            return inquiryChildPickerFieldLabel(parsed.fieldKey, manifest.label);
        }
        return manifest.label;
    }

    const parsed = parseRefKey(trimmed);
    if (parsed.entityKey === "inquiry_child") {
        return inquiryChildPickerFieldLabel(parsed.fieldKey, humanizeToken(parsed.fieldKey));
    }

    const dot = trimmed.lastIndexOf(".");
    if (dot > 0) return humanizeToken(trimmed.slice(dot + 1));
    return humanizeToken(trimmed);
}

export type ClassifyFieldPickerContextOptions = {
    surface: FieldPickerSurface;
    isWaitlist?: boolean;
};

/** Classify a field ref into an operator context group. */
export function classifyFieldPickerContext(
    refKey: string,
    options: ClassifyFieldPickerContextOptions,
): FieldPickerContextKey | null {
    const key = refKey.trim();
    if (!key) return null;

    const isWaitlist = options.isWaitlist ?? options.surface === "waitlist_queue_row";

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

    if (key.startsWith("customer.") || key.startsWith("household.") || key.startsWith("location.household_")) {
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

    if (/\.id$|created_at|updated_at|record_id/i.test(key)) return "system";

    if (key.startsWith("opportunity.")) return "lead_enrollment";

    return "lead_enrollment";
}
