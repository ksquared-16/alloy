/**
 * Shared Surface Composer field catalog — one assembly for Focus Panel, Queue Row,
 * Header, and future composers.
 *
 * Source of truth for categories + fields: Settings → Fields catalog
 * (`buildSettingsFieldCatalogEntries`), not a hardcoded provider allowlist.
 * Namespaces only gate which hub entities apply. Soft exclusions remove known
 * aliases / context-invalid refs.
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import {
    buildSettingsFieldCatalogEntries,
    FIELD_SECTION_DISPLAY_ORDER,
    categoryDisplayLabel,
    hubEntityApiTypes,
    type SettingsFieldCatalogEntry,
    type SettingsHubEntityKey,
} from "@/lib/fields/fieldCatalogForSettings";
import { resolveFieldsSectionLabel } from "@/lib/fields/fieldsConfigurationModel";
import type { AvailableField, AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { canonicalPickerIdentityForRefKey } from "@/lib/fields/canonicalProviderDedup";
import {
    COMPUTED_DISPLAY_OFFERED_REFS,
    RELATIONSHIP_SCOPED_DISPLAY_REFS,
    UNSUPPORTED_IDENTITY_PICKER_REFS,
    isIdentityFieldOfferedInPicker,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldPickerParity";
import { resolveIdentityFieldEditContract } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldEditContract";
import { CHILDCARE_STARTER_FIELD_CATALOG } from "@/lib/layout/childcareLayoutFieldCatalog";

/** Derived display fields — not selectable as independent editable identity fields. */
const NON_SELECTABLE_DERIVED_REFS = new Set<string>([
    "child.name",
    "child.display_name",
    "person.primary_contact_name",
]);

/** Lifecycle/process projections — read-only when exposed; stage is never invented here. */
const READ_ONLY_PROJECTION_REFS = new Set<string>([
    "inquiry_child.outcome_status_label",
    "inquiry_child.outcome_status_key",
]);

/** Collapse ambiguous duplicate aliases to one canonical selectable ref per storage concept. */
const CANONICAL_REF_ALIASES: Record<string, string> = {
    "inquiry_child.program_category_label": "inquiry_child.program",
    "person.address_line": "person.address_line1",
    "person.address": "person.address_line1",
    "contact.address_line": "person.address_line1",
    "contact.address_line1": "person.address_line1",
    "contact.address_line2": "person.address_line2",
    "contact.address": "person.address_line1",
    "person.dob": "person.date_of_birth",
    "contact.date_of_birth": "person.date_of_birth",
    "contact.dob": "person.date_of_birth",
    "child.dob": "child.date_of_birth",
};

export const SURFACE_COMPOSER_SHOW_ALL_KEY = "__show_all__";

export type SurfaceComposerFieldOption = AvailableField & {
    categoryKey: string;
    categoryLabel: string;
    selectable: boolean;
    readOnlyDerived?: boolean;
};

export type SurfaceComposerCategory = {
    key: string;
    label: string;
    fields: SurfaceComposerFieldOption[];
};

function normalizeSelectableRef(refKey: string): string {
    const aliased = CANONICAL_REF_ALIASES[refKey] ?? refKey;
    return canonicalPickerIdentityForRefKey(aliased);
}

function categorySortIndex(key: string, sectionRegistry?: readonly FieldSectionRegistryRow[]): number {
    if (sectionRegistry?.length) {
        const row = sectionRegistry.find((r) => r.section_key === key);
        if (row) return row.sort_order;
    }
    const idx = (FIELD_SECTION_DISPLAY_ORDER as readonly string[]).indexOf(key);
    return idx >= 0 ? idx : 10_000;
}

function labelForCategoryKey(
    key: string,
    sectionRegistry?: readonly FieldSectionRegistryRow[],
): string {
    if (sectionRegistry?.length) {
        return resolveFieldsSectionLabel(key, sectionRegistry);
    }
    return resolveFieldsSectionLabel(key, []) || categoryDisplayLabel(key);
}

/** Map composer namespaces → Settings → Fields hub entities. */
export function hubEntitiesForPickerNamespaces(
    namespaces: readonly AvailableFieldEntityNamespace[],
): SettingsHubEntityKey[] {
    const hubs = new Set<SettingsHubEntityKey>();
    for (const ns of namespaces) {
        switch (ns) {
            case "person":
                hubs.add("person");
                break;
            case "child":
            case "inquiry_child":
                hubs.add("inquiry_child");
                break;
            case "customer":
                hubs.add("customer");
                break;
            case "opportunity":
            case "queue_row":
                hubs.add("opportunity");
                break;
            case "concept":
            case "person_child_relationship":
                // No dedicated Settings hub — relationship fields come from person hub when present.
                break;
            default:
                break;
        }
    }
    return [...hubs];
}

function tenantRowsToFieldDefs(rows: readonly TenantFieldDefinitionRow[]): FieldDef[] {
    return rows.map((row) => ({
        id: `tenant:${row.entity_type}:${row.field_key}`,
        org_id: row.org_id ?? "",
        entity_type: row.entity_type,
        field_key: row.field_key,
        field_type: row.field_type,
        label: row.label,
        description: null,
        is_system: row.is_system,
        is_required: false,
        is_active: row.is_active !== false,
        is_visible_in_form: true,
        is_visible_in_drawer: row.is_visible_in_drawer !== false,
        is_visible_in_table: true,
        is_filterable: false,
        is_sortable: false,
        section_key: row.section_key ?? null,
        sort_order: 0,
        placeholder: null,
        help_text: null,
        config: row.config ?? null,
        is_visible_in_public_booking: false,
        created_at: "",
        updated_at: "",
    }));
}

function entryNamespace(refKey: string): string {
    const dot = refKey.indexOf(".");
    return dot >= 0 ? refKey.slice(0, dot) : refKey;
}

function toAvailableNamespace(ns: string): AvailableFieldEntityNamespace {
    if (ns === "contact") return "person";
    if (ns === "customer_member") return "child";
    if (
        ns === "opportunity"
        || ns === "customer"
        || ns === "person"
        || ns === "child"
        || ns === "inquiry_child"
        || ns === "queue_row"
        || ns === "concept"
        || ns === "person_child_relationship"
    ) {
        return ns;
    }
    return "concept";
}

function entryMatchesNamespaces(
    entry: SettingsFieldCatalogEntry,
    namespaces: ReadonlySet<string>,
): boolean {
    const ns = entryNamespace(entry.refKey);
    if (namespaces.has(ns)) return true;
    // contact.* often aliases person storage on /fields person hub
    if (ns === "contact" && namespaces.has("person")) return true;
    if (ns === "child" && (namespaces.has("child") || namespaces.has("customer_member"))) return true;
    if (ns === "customer_member" && namespaces.has("child")) return true;
    return false;
}

/**
 * Enrollment-detail inquiry_child facts (Requested Days, Preferred Weekdays, …)
 * live in the childcare starter catalog on participation metadata — not native OCM
 * columns — so Settings → Fields alone omits them. Merge them when Children /
 * inquiry_child namespaces are in scope so Focus Panel Add-field can place them.
 */
function enrollmentDetailCatalogEntriesForNamespaces(
    namespaces: readonly AvailableFieldEntityNamespace[],
): SettingsFieldCatalogEntry[] {
    const wantsInquiryChild = namespaces.some((ns) => ns === "inquiry_child" || ns === "child");
    if (!wantsInquiryChild) return [];
    const out: SettingsFieldCatalogEntry[] = [];
    for (const entry of CHILDCARE_STARTER_FIELD_CATALOG) {
        if (!entry.enrollmentDetail || !entry.refKey.startsWith("inquiry_child.")) continue;
        // Native OCM columns (program, schedule, start_date, …) already come from Settings.
        // Only participation `field_values` facts are missing from that catalog.
        if (entry.storageColumn !== "field_values") continue;
        out.push({
            id: `childcare-enrollment-detail:${entry.refKey}`,
            ownership: "platform",
            refKey: entry.refKey,
            label: entry.pickerLabel,
            field_type: entry.fieldType,
            section_key: "enrollment",
            entity_type: "inquiry_child",
            storage_line: entry.storagePath,
            editable: true,
            configurable: true,
        });
    }
    return out;
}

function buildFieldsCatalogEntriesForNamespaces(args: {
    namespaces: readonly AvailableFieldEntityNamespace[];
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
}): SettingsFieldCatalogEntry[] {
    const customFields = tenantRowsToFieldDefs(args.tenantFieldDefinitions ?? []);
    const hubs = hubEntitiesForPickerNamespaces(args.namespaces);
    const byRef = new Map<string, SettingsFieldCatalogEntry>();
    for (const hub of hubs) {
        for (const entry of buildSettingsFieldCatalogEntries({
            hubEntity: hub,
            entityTypes: hubEntityApiTypes(hub),
            customFields,
        })) {
            if (!byRef.has(entry.refKey)) byRef.set(entry.refKey, entry);
        }
    }
    for (const entry of enrollmentDetailCatalogEntriesForNamespaces(args.namespaces)) {
        // Prefer Settings native labels when present; otherwise offer enrollment-detail.
        if (!byRef.has(entry.refKey)) byRef.set(entry.refKey, entry);
    }
    return [...byRef.values()];
}

/**
 * Applicable fields grouped by configured /fields category for a composer subject.
 * Only categories with ≥1 applicable field are returned (plus optional Show all).
 */
export function assembleSurfaceComposerFieldCatalog(args: {
    namespaces: readonly AvailableFieldEntityNamespace[];
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    sectionRegistry?: readonly FieldSectionRegistryRow[];
    excludeKeys?: ReadonlySet<string>;
    isWaitlist?: boolean;
    includeShowAll?: boolean;
}): SurfaceComposerCategory[] {
    void args.isWaitlist;
    const accepted = new Set(args.namespaces as readonly string[]);
    const exclude = args.excludeKeys ?? new Set<string>();
    const catalogEntries = buildFieldsCatalogEntriesForNamespaces({
        namespaces: args.namespaces,
        tenantFieldDefinitions: args.tenantFieldDefinitions,
    }).filter((entry) => entryMatchesNamespaces(entry, accepted));

    const byCategory = new Map<string, SurfaceComposerFieldOption[]>();
    const seenLabelsByCategory = new Map<string, Set<string>>();
    const byCanonicalIdentity = new Map<string, SurfaceComposerFieldOption>();

    for (const entry of catalogEntries) {
        const canonicalRef = normalizeSelectableRef(entry.refKey);
        if (UNSUPPORTED_IDENTITY_PICKER_REFS.has(canonicalRef)) continue;
        if (UNSUPPORTED_IDENTITY_PICKER_REFS.has(entry.refKey)) continue;
        if (!isIdentityFieldOfferedInPicker(canonicalRef, args.namespaces)) continue;

        const categoryKey = entry.section_key?.trim() || "general";
        const categoryLabel = labelForCategoryKey(categoryKey, args.sectionRegistry);
        const edit = resolveIdentityFieldEditContract(canonicalRef);
        const readOnlyDerived =
            NON_SELECTABLE_DERIVED_REFS.has(entry.refKey)
            || NON_SELECTABLE_DERIVED_REFS.has(canonicalRef)
            || READ_ONLY_PROJECTION_REFS.has(entry.refKey)
            || READ_ONLY_PROJECTION_REFS.has(canonicalRef)
            || entry.ownership === "computed"
            || COMPUTED_DISPLAY_OFFERED_REFS.has(canonicalRef)
            || edit.reason === "computed"
            || RELATIONSHIP_SCOPED_DISPLAY_REFS.has(canonicalRef);
        const computedDisplayOffered =
            COMPUTED_DISPLAY_OFFERED_REFS.has(canonicalRef) || entry.ownership === "computed";
        const selectable =
            (computedDisplayOffered || !NON_SELECTABLE_DERIVED_REFS.has(canonicalRef))
            && !NON_SELECTABLE_DERIVED_REFS.has(entry.refKey)
            && !exclude.has(canonicalRef)
            && !exclude.has(entry.refKey);

        if (!selectable) continue;

        const option: SurfaceComposerFieldOption = {
            key: canonicalRef,
            label: entry.label,
            entityNamespace: toAvailableNamespace(entryNamespace(canonicalRef)),
            displayHint: undefined,
            isSystemField: entry.ownership !== "custom",
            categoryKey,
            categoryLabel,
            selectable: true,
            readOnlyDerived: readOnlyDerived || undefined,
        };

        const existing = byCanonicalIdentity.get(canonicalRef);
        if (!existing) {
            byCanonicalIdentity.set(canonicalRef, option);
            continue;
        }
        // Prefer the entry whose ref already matches the canonical identity.
        if (existing.key !== canonicalRef && entry.refKey === canonicalRef) {
            byCanonicalIdentity.set(canonicalRef, option);
        }
    }

    for (const option of byCanonicalIdentity.values()) {
        const labelKey = option.label.trim().toLowerCase();
        const seenLabels = seenLabelsByCategory.get(option.categoryKey) ?? new Set<string>();
        if (seenLabels.has(labelKey)) continue;
        seenLabels.add(labelKey);
        seenLabelsByCategory.set(option.categoryKey, seenLabels);
        const bucket = byCategory.get(option.categoryKey) ?? [];
        bucket.push(option);
        byCategory.set(option.categoryKey, bucket);
    }

    const categories = [...byCategory.entries()]
        .map(([key, fields]) => ({
            key,
            label: fields[0]?.categoryLabel ?? labelForCategoryKey(key, args.sectionRegistry),
            fields: fields.sort((a, b) => a.label.localeCompare(b.label)),
        }))
        .filter((category) => category.fields.length > 0)
        .sort(
            (a, b) =>
                categorySortIndex(a.key, args.sectionRegistry) - categorySortIndex(b.key, args.sectionRegistry)
                || a.label.localeCompare(b.label),
        );

    if (args.includeShowAll !== false && categories.length > 0) {
        const allFields = categories.flatMap((category) => category.fields);
        return [
            {
                key: SURFACE_COMPOSER_SHOW_ALL_KEY,
                label: "Show all",
                fields: allFields,
            },
            ...categories,
        ];
    }

    return categories;
}
