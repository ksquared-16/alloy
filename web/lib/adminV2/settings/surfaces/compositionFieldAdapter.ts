/**
 * Universal Composition Model — Field Availability Adapter.
 *
 * Answers the builder question: "What fields are available for this evidence group?"
 *
 * The adapter bridges two field systems:
 *   1. Queue Row refKey system (e.g. "person.phone", "child.name") — sourced from
 *      `defaultLeadQueueLayoutV3()` and the childcare field catalog.
 *   2. Focus Panel concept path system (e.g. "Enrollment → Primary Contact → Phone")
 *      — sourced from `CONCEPT_TREE` in `focusPanelConceptCatalog.ts`.
 *
 * Both are rooted on the same business entities. The adapter normalizes the
 * registry's `defaultFieldKeys` and adds display labels from the catalog.
 *
 * @see compositionEvidenceGroupRegistry.ts (canonical group → field key maps)
 * @see docs/platform/operator/experience-builder-universal-composition-model.md
 */

import type { CompositionEvidenceGroupDef } from "@/lib/adminV2/settings/surfaces/compositionEvidenceGroupRegistry";
import { evidenceGroupsForZone } from "@/lib/adminV2/settings/surfaces/compositionEvidenceGroupRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * One field available for a composition group as returned by the adapter.
 * Builders use this to populate "add field" pickers.
 */
export type AvailableField = {
    /** The refKey or concept path that identifies this field. */
    key: string;
    /** Display label for the builder UI. */
    label: string;
    /** Which entity namespace this field reads from. */
    entityNamespace: AvailableFieldEntityNamespace;
    /** Rendered hint (how the runtime should display this). */
    displayHint?: AvailableFieldDisplayHint;
    /** True if this field is a core system field (not tenant-custom). */
    isSystemField: boolean;
};

export type AvailableFieldEntityNamespace =
    | "opportunity"
    | "customer"
    | "person"
    | "child"
    | "inquiry_child"
    | "queue_row"
    | "concept";

export type AvailableFieldDisplayHint = "text" | "status_pill" | "date" | "money" | "link" | "compact_list";

/**
 * A named evidence group with its available fields — returned by the adapter
 * for the builder inspector.
 */
export type NamedEvidenceGroup = {
    key: string;
    label: string;
    purpose?: string;
    availableFields: AvailableField[];
};

// ── Static field catalog ───────────────────────────────────────────────────────

/**
 * Canonical field definitions for the queue row field system (refKey namespace).
 * These correspond to the fields that appear in `defaultLeadQueueLayoutV3()` and
 * are handled by `OperationalQueueRecordRow`.
 *
 * New fields added to the queue layout config should also appear here so the
 * builder can label them correctly.
 */
const QUEUE_FIELD_CATALOG: Record<string, { label: string; namespace: AvailableFieldEntityNamespace; hint?: AvailableFieldDisplayHint }> = {
    // customer
    "customer.display_name": { label: "Household Name", namespace: "customer" },
    // queue_row computed
    "queue_row.subject_label": { label: "Subject Label", namespace: "queue_row" },
    "queue_row.stage_label": { label: "Stage", namespace: "queue_row" },
    "queue_row.group_count_label": { label: "Group Count", namespace: "queue_row" },
    "queue_row.work_summary": { label: "Work Summary", namespace: "queue_row" },
    "queue_row.next_best_action_label": { label: "Next Best Action", namespace: "queue_row" },
    // person
    "person.primary_contact_name": { label: "Primary Contact Name", namespace: "person" },
    "person.phone": { label: "Phone", namespace: "person", hint: "link" },
    "person.email": { label: "Email", namespace: "person", hint: "link" },
    // opportunity
    "opportunity.status_label": { label: "Status", namespace: "opportunity", hint: "status_pill" },
    "opportunity.location": { label: "Location", namespace: "opportunity" },
    "opportunity.attention_reason": { label: "Attention Reason", namespace: "opportunity" },
    "opportunity.next_step": { label: "Next Step", namespace: "opportunity" },
    "opportunity.tour_date": { label: "Tour Date", namespace: "opportunity", hint: "date" },
    // child
    "child.name": { label: "Child Name", namespace: "child" },
    "child.date_of_birth": { label: "Date of Birth", namespace: "child", hint: "date" },
    "child.status": { label: "Child Status", namespace: "child", hint: "status_pill" },
    "child.room": { label: "Room", namespace: "child" },
    "child.desired_start_date": { label: "Desired Start Date", namespace: "child", hint: "date" },
    // inquiry_child
    "inquiry_child.program": { label: "Program", namespace: "inquiry_child" },
    "inquiry_child.desired_schedule_type": { label: "Schedule Type", namespace: "inquiry_child" },
    "inquiry_child.desired_program_category": { label: "Program Category", namespace: "inquiry_child" },
};

/**
 * Resolve a queue field key to an `AvailableField`.
 * Falls back to a synthesized definition when not in the static catalog —
 * this handles tenant custom fields that use the same refKey format.
 */
function resolveQueueField(key: string): AvailableField {
    const entry = QUEUE_FIELD_CATALOG[key];
    if (entry) {
        return {
            key,
            label: entry.label,
            entityNamespace: entry.namespace,
            displayHint: entry.hint,
            isSystemField: true,
        };
    }
    // Synthesize from the refKey: "entity.field_name" → "Field Name"
    const dotIndex = key.indexOf(".");
    const rawLabel = dotIndex >= 0 ? key.slice(dotIndex + 1) : key;
    const label = rawLabel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const rawNs = dotIndex >= 0 ? key.slice(0, dotIndex) : "opportunity";
    const namespace = rawNs as AvailableFieldEntityNamespace;
    return { key, label, entityNamespace: namespace, isSystemField: false };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return all available fields for a queue zone evidence group, by group key.
 * Includes the group's `defaultFieldKeys` plus any tenant-catalog fields for
 * the same entity namespace (future — currently returns defaults only).
 */
export function availableFieldsForGroup(
    zone: string,
    groupKey: string,
    isWaitlist = false,
): AvailableField[] {
    const groups = evidenceGroupsForZone(zone, isWaitlist);
    const group = groups.find((g) => g.key === groupKey);
    if (!group) return [];
    return group.defaultFieldKeys.map(resolveQueueField);
}

/**
 * Return all available fields for a queue zone — flat, across all groups.
 * Used by bulk pickers when the group structure is not needed.
 */
export function availableFieldsForZone(zone: string, isWaitlist = false): AvailableField[] {
    const groups = evidenceGroupsForZone(zone, isWaitlist);
    const seen = new Set<string>();
    const fields: AvailableField[] = [];
    for (const group of groups) {
        for (const key of group.defaultFieldKeys) {
            if (!seen.has(key)) {
                seen.add(key);
                fields.push(resolveQueueField(key));
            }
        }
    }
    return fields;
}

/**
 * Return named evidence groups with their available fields for a queue zone.
 * This is the primary adapter function — used by the builder inspector to render
 * the "Evidence Groups" section with per-field toggles.
 */
export function namedEvidenceGroupsForZone(
    zone: string,
    isWaitlist = false,
): NamedEvidenceGroup[] {
    const groups = evidenceGroupsForZone(zone, isWaitlist);
    return groups.map(
        (g: CompositionEvidenceGroupDef): NamedEvidenceGroup => ({
            key: g.key,
            label: g.label,
            purpose: g.purpose,
            availableFields: g.defaultFieldKeys.map(resolveQueueField),
        }),
    );
}

/**
 * Check whether a field key is available for a specific zone (entity namespace match).
 * Used by the builder to validate config before publishing.
 */
export function isFieldAvailableForZone(fieldKey: string, zone: string, isWaitlist = false): boolean {
    const fields = availableFieldsForZone(zone, isWaitlist);
    return fields.some((f) => f.key === fieldKey);
}
