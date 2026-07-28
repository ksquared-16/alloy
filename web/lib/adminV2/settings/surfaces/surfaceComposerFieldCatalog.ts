/**
 * Shared Surface Composer field catalog — one assembly for Focus Panel, Queue Row,
 * Header, and future composers.
 *
 * Category organization comes from configured field section keys (/fields), not from
 * namespaces or hardcoded groupDefs. Namespaces only gate provider applicability.
 */

import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import {
    FIELD_SECTION_DISPLAY_ORDER,
    categoryDisplayLabel,
} from "@/lib/fields/fieldCatalogForSettings";
import { resolveFieldsSectionLabel } from "@/lib/fields/fieldsConfigurationModel";
import type { AvailableField, AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { assembleFocusPanelNestedProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { canonicalPickerIdentityForRefKey } from "@/lib/fields/canonicalProviderDedup";
import {
    COMPUTED_DISPLAY_OFFERED_REFS,
    isIdentityFieldOfferedInPicker,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldPickerParity";

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

function categorySortIndex(key: string): number {
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
    // Prefer Fields-page operator labels over Configuration hub seeds ("Identity" etc.).
    return resolveFieldsSectionLabel(key, []) || categoryDisplayLabel(key);
}

/**
 * Applicable fields grouped by configured category for a composer subject.
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
    const accepted = new Set(args.namespaces);
    const exclude = args.excludeKeys ?? new Set<string>();
    const providers = assembleFocusPanelNestedProviders({
        isWaitlist: args.isWaitlist ?? false,
        tenantFieldDefinitions: args.tenantFieldDefinitions,
    }).filter((provider) => accepted.has(provider.entityNamespace as AvailableFieldEntityNamespace));

    const byCategory = new Map<string, SurfaceComposerFieldOption[]>();
    const seenLabelsByCategory = new Map<string, Set<string>>();
    const byCanonicalIdentity = new Map<string, SurfaceComposerFieldOption>();

    for (const provider of providers) {
        const canonicalRef = normalizeSelectableRef(provider.refKey);
        const categoryKey = provider.categoryKey?.trim() || "general";
        const categoryLabel = labelForCategoryKey(categoryKey, args.sectionRegistry);

        const readOnlyDerived =
            NON_SELECTABLE_DERIVED_REFS.has(provider.refKey)
            || READ_ONLY_PROJECTION_REFS.has(provider.refKey)
            || provider.kind === "calculated_field"
            || COMPUTED_DISPLAY_OFFERED_REFS.has(canonicalRef);
        // Computed display fields remain selectable (display-only); other derived refs stay hidden.
        const computedDisplayOffered = COMPUTED_DISPLAY_OFFERED_REFS.has(canonicalRef);
        const parityAllows = isIdentityFieldOfferedInPicker(canonicalRef, args.namespaces);
        const selectable =
            parityAllows
            && (computedDisplayOffered || !readOnlyDerived)
            && !exclude.has(canonicalRef)
            && !exclude.has(provider.refKey);

        const option: SurfaceComposerFieldOption = {
            key: canonicalRef,
            label: provider.label,
            entityNamespace: provider.entityNamespace as AvailableFieldEntityNamespace,
            displayHint: provider.displayHint,
            isSystemField: provider.isSystem,
            categoryKey,
            categoryLabel,
            selectable,
            readOnlyDerived: readOnlyDerived || undefined,
        };

        const existing = byCanonicalIdentity.get(canonicalRef);
        if (!existing) {
            byCanonicalIdentity.set(canonicalRef, option);
            continue;
        }
        const existingIsCanonical = existing.key === canonicalRef;
        const incomingIsCanonical = provider.refKey === canonicalRef;
        if (!existingIsCanonical && incomingIsCanonical) {
            byCanonicalIdentity.set(canonicalRef, option);
        }
    }

    for (const option of byCanonicalIdentity.values()) {
        if (!option.selectable) continue;
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
            fields: fields
                .filter((field) => field.selectable)
                .sort((a, b) => a.label.localeCompare(b.label)),
        }))
        .filter((category) => category.fields.length > 0)
        .sort(
            (a, b) =>
                categorySortIndex(a.key) - categorySortIndex(b.key)
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
