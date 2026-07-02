/**
 * Universal Composition Model — Field Availability Adapter (V1).
 *
 * Answers the builder question: "What fields are available for this evidence group?"
 *
 * ## V1 scope — static composition fields only
 *
 * This adapter reads ONLY the static `QUEUE_FIELD_CATALOG` defined in this file.
 * It does NOT read the real tenant field catalog (`tenantLayoutFieldPickerCatalog`,
 * `LayoutCatalogField`, `childcareLayoutFieldCatalog`) and does NOT surface
 * operator-created custom fields.
 *
 * The fields available here are a curated subset of the platform's built-in
 * queue row fields — the same fields that appear in the default lead/waitlist
 * queue layout configs. They are called "composition fields", not "all created
 * fields", to be precise about V1 scope.
 *
 * ## Deferred — V2: Dynamic custom field catalog integration
 *
 * The platform goal is: operator creates a field → it appears in compatible
 * builders automatically. That path requires:
 *   1. `tenantLayoutFieldPickerCatalog.buildTenantLayoutCatalogFields()` merged
 *      into this adapter at query time (already exists, not wired here).
 *   2. Entity-namespace compatibility check between the custom field's
 *      `entity_type` and the evidence group's namespace.
 *   3. The queue row validator allow-list auto-extended for tenant refKeys.
 *
 * Until V2, operators who create custom fields must contact platform support
 * to have refKeys added to the allow-list. The builder shows only the
 * platform-defined composition fields below.
 *
 * @see compositionEvidenceGroupRegistry.ts (canonical group → field key maps)
 * @see web/lib/layout/tenantLayoutFieldPickerCatalog.ts (V2 integration point)
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

// ── Static composition field catalog (V1) ─────────────────────────────────────

/**
 * Platform-defined composition fields for the queue row refKey namespace.
 * These are the fields that `OperationalQueueRecordRow` knows how to render
 * (backed by `QueueRecordScopedColumn` which iterates `config.columns[].blocks[].fields[]`).
 *
 * This is NOT the full tenant field catalog. Operator-created custom fields
 * are NOT included here — see the V2 deferral note in the file header.
 *
 * `isSystemField: true` for all entries here — they are platform-defined.
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
    // waitlist computed (available on waitlist queue rows)
    "waitlist.positionLabel": { label: "Waitlist Position", namespace: "queue_row", hint: "status_pill" },
    "waitlist.tierLabel": { label: "Priority Tier", namespace: "queue_row", hint: "status_pill" },
    "waitlist.waitSince": { label: "Wait Since", namespace: "queue_row", hint: "date" },
    "waitlist.siblingContext": { label: "Sibling Context", namespace: "queue_row" },
    "overrides.flags": { label: "Override Flags", namespace: "queue_row", hint: "status_pill" },
};

/**
 * Resolve a queue field key to an `AvailableField`.
 *
 * Keys in `QUEUE_FIELD_CATALOG` → fully resolved with label + hint.
 * Unknown keys → synthesized label from the refKey shape; `isSystemField: false`
 * marks these as unrecognized (they should not appear in the V1 builder UI,
 * but the synthesizer prevents hard failures if stale config references an
 * old or renamed key).
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
    // Synthesize — label from refKey shape; isSystemField=false = not in catalog
    const dotIndex = key.indexOf(".");
    const rawLabel = dotIndex >= 0 ? key.slice(dotIndex + 1) : key;
    const label = rawLabel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const rawNs = dotIndex >= 0 ? key.slice(0, dotIndex) : "opportunity";
    const namespace = rawNs as AvailableFieldEntityNamespace;
    return { key, label, entityNamespace: namespace, isSystemField: false };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the available composition fields for a specific evidence group within a zone.
 *
 * V1: returns the group's platform-defined `defaultFieldKeys` only.
 * Does NOT include operator-created custom fields (deferred to V2 — see file header).
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
 * Return all available composition fields for a zone — flat, across all groups.
 * V1: platform-defined fields only. Does not include operator-created custom fields.
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
 * Return named evidence groups with their available composition fields for a zone.
 * Primary adapter function — used by the builder inspector to render named group
 * sections with per-field toggles.
 *
 * V1: fields are platform-defined composition fields only. Custom fields deferred.
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
