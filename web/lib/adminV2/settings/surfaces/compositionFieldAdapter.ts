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
    filterCanonicalDataProviders,
    findCanonicalDataProvider,
} from "@/lib/fields/canonicalDataProviderRegistry";
import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
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

// ── Canonical provider adapter (replaces static QUEUE_FIELD_CATALOG) ───────────

function providerToAvailableField(provider: CanonicalDataProvider): AvailableField {
    return {
        key: provider.refKey,
        label: provider.label,
        entityNamespace: provider.entityNamespace as AvailableFieldEntityNamespace,
        displayHint: provider.displayHint,
        isSystemField: provider.isSystem,
    };
}

/**
 * Resolve a queue field key to an `AvailableField` via the canonical provider catalog.
 *
 * Known providers → fully resolved with label + hint from provider metadata.
 * Unknown keys → synthesized label; `isSystemField: false` marks unrecognized refs
 * (legacy configs may still resolve through compatibility layer at publish time).
 */
function resolveQueueField(key: string, tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[]): AvailableField {
    const provider = findCanonicalDataProvider(key, { tenantFieldDefinitions });
    if (provider) {
        return providerToAvailableField(provider);
    }
    const dotIndex = key.indexOf(".");
    const rawLabel = dotIndex >= 0 ? key.slice(dotIndex + 1) : key;
    const label = rawLabel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const rawNs = dotIndex >= 0 ? key.slice(0, dotIndex) : "opportunity";
    const namespace = rawNs as AvailableFieldEntityNamespace;
    return { key, label, entityNamespace: namespace, isSystemField: false };
}

function pickerProvidersForNamespaces(
    namespaces: readonly AvailableFieldEntityNamespace[],
    isWaitlist: boolean,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): CanonicalDataProvider[] {
    const acceptedSet = new Set(namespaces);
    return filterCanonicalDataProviders({
        consumer: "queue_row",
        isWaitlist,
        tenantFieldDefinitions,
    }).filter((provider) => acceptedSet.has(provider.entityNamespace as AvailableFieldEntityNamespace));
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
    isWaitlist = false,
): AvailableField[] {
    const providers = pickerProvidersForNamespaces(namespaces, isWaitlist, tenantFieldDefinitions);
    const seen = new Set<string>();
    const out: AvailableField[] = [];
    for (const provider of providers) {
        if (seen.has(provider.refKey)) continue;
        seen.add(provider.refKey);
        out.push(providerToAvailableField(provider));
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
        ...group.defaultFieldKeys.map((key) => resolveQueueField(key, tenantFieldDefinitions)),
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
                fields.push(resolveQueueField(key, tenantFieldDefinitions));
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
                ...g.defaultFieldKeys.map((key) => resolveQueueField(key, tenantFieldDefinitions)),
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
