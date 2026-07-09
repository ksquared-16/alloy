/**
 * Universal Composition Model — Field Availability Adapter.
 *
 * Answers the builder question: "What fields are available for this evidence group?"
 *
 * ## Availability model (V3 doctrine §5)
 *
 * A group's available fields = **platform starter fields ∪ tenant custom fields**
 * whose entity namespace ∈ the group's `acceptedNamespaces`:
 *   - **Platform starter fields** come from the group's `defaultFieldKeys`, resolved
 *     against the static `QUEUE_FIELD_CATALOG` in this file. This is the floor.
 *   - **Tenant custom fields** are merged in at query time from
 *     `buildTenantLayoutCatalogFields(defs, surface)` and filtered by the group's
 *     `acceptedNamespaces` — so an operator-created field (Preferred Language,
 *     Pickup Code, Employer…) appears in every compatible group automatically,
 *     because the EVIDENCE GROUP knows compatible namespaces, not because a
 *     component hardcodes the field.
 *
 * `defaultFieldKeys` is a **seed list, never the availability boundary.** Callers
 * that omit `tenantFieldDefinitions` get starter fields only (back-compat).
 *
 * ## Publish validation
 *
 * A published config referencing a tenant refKey must also pass the queue-row
 * validator allow-list. `isTenantLayoutFieldRefKeyAllowed` (tenantLayoutFieldPickerCatalog)
 * is the seam the validator OR-s in; see queueRecordValidatorAllowList.
 *
 * @see compositionEvidenceGroupRegistry.ts (group → namespaces + seed keys)
 * @see web/lib/layout/tenantLayoutFieldPickerCatalog.ts (tenant catalog machinery)
 * @see docs/platform/operator/experience-builder-v3-universal-surface-composition.md §5
 */

import type { CompositionEvidenceGroupDef } from "@/lib/adminV2/settings/surfaces/compositionEvidenceGroupRegistry";
import { evidenceGroupsForZone } from "@/lib/adminV2/settings/surfaces/compositionEvidenceGroupRegistry";
import {
    buildTenantLayoutCatalogFields,
    type TenantFieldDefinitionRow,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";

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
    "person.date_of_birth": { label: "Date of Birth", namespace: "person", hint: "date" },
    "person.role_label": { label: "Role", namespace: "person" },
    "person.address_line": { label: "Address", namespace: "person" },
    "contact.first_name": { label: "First name", namespace: "person" },
    "contact.last_name": { label: "Last name", namespace: "person" },
    "contact.email": { label: "Email", namespace: "person", hint: "link" },
    "contact.phone": { label: "Phone", namespace: "person", hint: "link" },
    // opportunity
    "opportunity.status_label": { label: "Status", namespace: "opportunity", hint: "status_pill" },
    "opportunity.location": { label: "Location", namespace: "opportunity" },
    "opportunity.attention_reason": { label: "Attention Reason", namespace: "opportunity" },
    "opportunity.next_step": { label: "Next Step", namespace: "opportunity" },
    "opportunity.tour_date": { label: "Tour Date", namespace: "opportunity", hint: "date" },
    // child
    "child.name": { label: "Child Name", namespace: "child" },
    "child.first_name": { label: "First Name", namespace: "child" },
    "child.last_name": { label: "Last Name", namespace: "child" },
    "child.preferred_name": { label: "Preferred Name", namespace: "child" },
    "child.nickname": { label: "Nickname", namespace: "child" },
    "child.display_name": { label: "Display Name", namespace: "child" },
    "children.count": { label: "Children count", namespace: "child", hint: "compact_list" },
    "children.names": { label: "Children names", namespace: "child", hint: "compact_list" },
    "children.summary": { label: "Children summary", namespace: "child", hint: "compact_list" },
    "child.date_of_birth": { label: "Date of Birth", namespace: "child", hint: "date" },
    "child.dob_age": { label: "Age", namespace: "child" },
    "child.age": { label: "Age", namespace: "child" },
    "child.age_band": { label: "Age Band", namespace: "child" },
    "child.status": { label: "Child Status", namespace: "child", hint: "status_pill" },
    "child.room": { label: "Room", namespace: "child" },
    "child.location": { label: "Campus / Location", namespace: "child" },
    "child.start_date": { label: "Desired Start Date", namespace: "child", hint: "date" },
    "child.desired_start_date": { label: "Desired Start", namespace: "child", hint: "date" },
    "child.medical_summary": { label: "Medical", namespace: "child" },
    "child.documents_summary": { label: "Documents", namespace: "child" },
    "child.pickup_summary": { label: "Pickup", namespace: "child" },
    "child.notes_summary": { label: "Notes", namespace: "child" },
    "child.communications_summary": { label: "Communications", namespace: "child" },
    "child.readiness_summary": { label: "Readiness", namespace: "child" },
    // inquiry_child
    "inquiry_child.program": { label: "Program", namespace: "inquiry_child" },
    "inquiry_child.schedule_type": { label: "Schedule Type", namespace: "inquiry_child" },
    "inquiry_child.desired_schedule_type": { label: "Desired Schedule", namespace: "inquiry_child" },
    "inquiry_child.program_category": { label: "Program Category", namespace: "inquiry_child" },
    // waitlist computed (available on waitlist queue rows)
    "waitlist.positionLabel": { label: "Waitlist Position", namespace: "queue_row", hint: "status_pill" },
    "waitlist.tierLabel": { label: "Priority Tier", namespace: "queue_row", hint: "status_pill" },
    "waitlist.waitSince": { label: "Wait Since", namespace: "queue_row", hint: "date" },
    "waitlist.siblingContext": { label: "Sibling Context", namespace: "queue_row" },
    "sibling.names": { label: "Sibling Names", namespace: "queue_row" },
    "sibling.count": { label: "Sibling Count", namespace: "queue_row" },
    "sibling.enrolled": { label: "Sibling Enrolled", namespace: "queue_row" },
    "sibling.waitlisted": { label: "Sibling Waitlisted", namespace: "queue_row" },
    "sibling.location": { label: "Sibling Location", namespace: "queue_row" },
    "sibling.program": { label: "Sibling Program", namespace: "queue_row" },
    "household.otherChildren": { label: "Other Children", namespace: "queue_row" },
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

// ── Custom-field availability by namespace (V3 doctrine §5) ─────────────────────

/**
 * Derive a composition namespace from a canonical namespaced refKey prefix
 * (e.g. `person.preferred_language` → `person`). The tenant catalog already
 * normalizes `customer_member.*` → `child.*` when building refKeys, so the
 * prefix is authoritative.
 */
function namespaceFromRefKey(refKey: string): AvailableFieldEntityNamespace | null {
    const dot = refKey.indexOf(".");
    if (dot < 0) return null;
    const prefix = refKey.slice(0, dot);
    switch (prefix) {
        case "opportunity":
        case "person":
        case "customer":
        case "inquiry_child":
        case "child":
            return prefix;
        default:
            return null;
    }
}

/** Map a tenant catalog field to an AvailableField (isSystemField=false). */
function tenantCatalogFieldToAvailable(field: LayoutCatalogField): AvailableField | null {
    const namespace = namespaceFromRefKey(field.refKey);
    if (!namespace) return null;
    return {
        key: field.refKey,
        label: field.fieldLabel,
        entityNamespace: namespace,
        isSystemField: false,
    };
}

/**
 * Tenant custom fields available to a specific group, filtered by the group's
 * `acceptedNamespaces`. This is the heart of V3 field availability: a group is
 * offered a custom field because the group ACCEPTS the field's namespace — not
 * because any component hardcodes the field.
 *
 * Returns [] when no tenant defs are supplied (back-compat) or when the group
 * declares no accepted namespaces.
 */
function tenantFieldsForGroup(
    group: CompositionEvidenceGroupDef,
    isWaitlist: boolean,
    tenantFieldDefinitions: readonly TenantFieldDefinitionRow[] | undefined,
): AvailableField[] {
    if (!tenantFieldDefinitions || tenantFieldDefinitions.length === 0) return [];
    const accepted = group.acceptedNamespaces;
    if (!accepted || accepted.length === 0) return [];
    const acceptedSet = new Set<AvailableFieldEntityNamespace>(accepted);
    const surface = isWaitlist ? "waitlist_queue_row" : "pipeline_queue_row";
    const catalogFields = buildTenantLayoutCatalogFields(tenantFieldDefinitions, surface);
    const seededKeys = new Set(group.defaultFieldKeys);
    const out: AvailableField[] = [];
    for (const cf of catalogFields) {
        const available = tenantCatalogFieldToAvailable(cf);
        if (!available) continue;
        if (!acceptedSet.has(available.entityNamespace)) continue;
        if (seededKeys.has(available.key)) continue; // already a platform default
        out.push(available);
    }
    return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Available composition fields for an arbitrary set of accepted namespaces —
 * used by nested surface groups (Children Surface, Financial Configuration
 * Surface) which are NOT queue zones but still declare `acceptedNamespaces`.
 *
 * Returns platform starter fields (from `QUEUE_FIELD_CATALOG`) whose namespace is
 * accepted, PLUS tenant custom fields whose namespace is accepted. Never
 * fabricates a field — only real platform + real tenant fields are returned, so
 * a group with no compatible real fields returns an empty list (honest empty
 * state, no fake payers/invoices/estimates).
 */
export function availableFieldsForNamespaces(
    namespaces: readonly AvailableFieldEntityNamespace[],
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AvailableField[] {
    const acceptedSet = new Set(namespaces);
    const out: AvailableField[] = [];
    const seen = new Set<string>();
    // Platform starter fields whose namespace is accepted.
    for (const key of Object.keys(QUEUE_FIELD_CATALOG)) {
        const field = resolveQueueField(key);
        if (acceptedSet.has(field.entityNamespace) && !seen.has(field.key)) {
            seen.add(field.key);
            out.push(field);
        }
    }
    // Tenant custom fields whose namespace is accepted.
    if (tenantFieldDefinitions && tenantFieldDefinitions.length > 0) {
        const catalogFields = buildTenantLayoutCatalogFields(tenantFieldDefinitions, "pipeline_queue_row");
        for (const cf of catalogFields) {
            const available = tenantCatalogFieldToAvailable(cf);
            if (!available) continue;
            if (acceptedSet.has(available.entityNamespace) && !seen.has(available.key)) {
                seen.add(available.key);
                out.push(available);
            }
        }
    }
    return out;
}

/**
 * Return the available composition fields for a specific evidence group within a zone.
 *
 * Platform starter fields (`defaultFieldKeys`) PLUS any operator-created custom
 * fields whose namespace ∈ the group's `acceptedNamespaces` (V3 doctrine §5).
 * When `tenantFieldDefinitions` is omitted, behaves as before (starter fields only).
 */
export function availableFieldsForGroup(
    zone: string,
    groupKey: string,
    isWaitlist = false,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AvailableField[] {
    const groups = evidenceGroupsForZone(zone, isWaitlist);
    const group = groups.find((g) => g.key === groupKey);
    if (!group) return [];
    return [
        ...group.defaultFieldKeys.map(resolveQueueField),
        ...tenantFieldsForGroup(group, isWaitlist, tenantFieldDefinitions),
    ];
}

/**
 * Return all available composition fields for a zone — flat, across all groups.
 * Platform starter fields plus namespace-compatible tenant custom fields.
 */
export function availableFieldsForZone(
    zone: string,
    isWaitlist = false,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AvailableField[] {
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
        for (const tenantField of tenantFieldsForGroup(group, isWaitlist, tenantFieldDefinitions)) {
            if (!seen.has(tenantField.key)) {
                seen.add(tenantField.key);
                fields.push(tenantField);
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
 * Each group's `availableFields` = platform starter fields ∪ namespace-compatible
 * tenant custom fields (V3 doctrine §5).
 */
export function namedEvidenceGroupsForZone(
    zone: string,
    isWaitlist = false,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): NamedEvidenceGroup[] {
    const groups = evidenceGroupsForZone(zone, isWaitlist);
    return groups.map(
        (g: CompositionEvidenceGroupDef): NamedEvidenceGroup => ({
            key: g.key,
            label: g.label,
            purpose: g.purpose,
            availableFields: [
                ...g.defaultFieldKeys.map(resolveQueueField),
                ...tenantFieldsForGroup(g, isWaitlist, tenantFieldDefinitions),
            ],
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
