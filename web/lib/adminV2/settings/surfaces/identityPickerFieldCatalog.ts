/**
 * Canonical identity field picker — Settings Fields catalog semantics for Focus Panel composers.
 *
 * Source: canonical data providers (focus_panel consumer) grouped by configured field category.
 */

import { platformCategoryLabel } from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import type { AvailableField, AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { assembleFocusPanelNestedProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { canonicalPickerIdentityForRefKey } from "@/lib/fields/canonicalProviderDedup";

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
};

export type IdentityPickerFieldOption = AvailableField & {
    categoryKey: string;
    categoryLabel: string;
    selectable: boolean;
    readOnlyDerived?: boolean;
};

export type IdentityPickerCategory = {
    key: string;
    label: string;
    fields: IdentityPickerFieldOption[];
};

function hubEntityForNamespace(namespace: AvailableFieldEntityNamespace): string | undefined {
    switch (namespace) {
        case "child":
        case "inquiry_child":
            return "inquiry_child";
        case "person":
        case "person_child_relationship":
            return "person";
        case "customer":
            return "customer";
        case "opportunity":
            return "opportunity";
        default:
            return undefined;
    }
}

function normalizeSelectableRef(refKey: string): string {
    const aliased = CANONICAL_REF_ALIASES[refKey] ?? refKey;
    return canonicalPickerIdentityForRefKey(aliased);
}

/** Build category-grouped picker options for identity surfaces. */
export function identityPickerCategoriesForNamespaces(args: {
    namespaces: readonly AvailableFieldEntityNamespace[];
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    excludeKeys?: ReadonlySet<string>;
    isWaitlist?: boolean;
}): IdentityPickerCategory[] {
    const accepted = new Set(args.namespaces);
    const exclude = args.excludeKeys ?? new Set<string>();
    const providers = assembleFocusPanelNestedProviders({
        isWaitlist: args.isWaitlist ?? false,
        tenantFieldDefinitions: args.tenantFieldDefinitions,
    }).filter((provider) => accepted.has(provider.entityNamespace as AvailableFieldEntityNamespace));

    const byCategory = new Map<string, IdentityPickerFieldOption[]>();
    const seenLabelsByCategory = new Map<string, Set<string>>();
    const byCanonicalIdentity = new Map<string, IdentityPickerFieldOption>();

    for (const provider of providers) {
        const canonicalRef = normalizeSelectableRef(provider.refKey);
        const categoryKey = provider.categoryKey?.trim() || "general";
        const hubEntity = hubEntityForNamespace(provider.entityNamespace as AvailableFieldEntityNamespace);
        const categoryLabel = platformCategoryLabel(categoryKey, hubEntity);

        const readOnlyDerived =
            NON_SELECTABLE_DERIVED_REFS.has(provider.refKey)
            || READ_ONLY_PROJECTION_REFS.has(provider.refKey)
            || provider.kind === "calculated_field";
        const selectable = !readOnlyDerived && !exclude.has(canonicalRef) && !exclude.has(provider.refKey);

        const option: IdentityPickerFieldOption = {
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

    return [...byCategory.entries()]
        .map(([key, fields]) => ({
            key,
            label: fields[0]?.categoryLabel ?? platformCategoryLabel(key),
            fields: fields
                .filter((field) => field.selectable)
                .sort((a, b) => a.label.localeCompare(b.label)),
        }))
        .filter((category) => category.fields.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Flat selectable field list (canonical catalog). */
export function identityPickerFieldsForNamespaces(
    args: Parameters<typeof identityPickerCategoriesForNamespaces>[0],
): IdentityPickerFieldOption[] {
    return identityPickerCategoriesForNamespaces(args).flatMap((category) => category.fields);
}
