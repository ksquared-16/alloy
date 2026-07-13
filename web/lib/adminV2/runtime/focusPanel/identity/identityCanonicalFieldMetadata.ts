/**
 * Identity / Focus Panel — canonical field metadata resolution.
 *
 * Labels, categories, and provider identity come from the canonical Field Platform.
 * Identity consumers filter/group/hide only — they never redefine field truth here.
 */

import type { AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import {
    assembleFocusPanelNestedProviders,
    resolveCanonicalProviderForConsumer,
} from "@/lib/fields/consumerCanonicalProviderAssembly";
import type { CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import { categoryDisplayLabel } from "@/lib/fields/fieldCatalogForSettings";
import { deriveFieldCapability } from "@/lib/fields/fieldCapabilityEngine";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type IdentityFieldRuntimeBinding = {
    providerRef: string;
    fieldRef: string;
    ownerEntity: string;
    valueKind: string;
    label: string;
    categoryKey: string;
    categoryLabel: string;
    readable: boolean;
    writable: boolean;
    isSystemField: boolean;
    optionSetRef?: string;
    provider?: CanonicalDataProvider;
};

/** Identity persisted refs that delegate metadata to a canonical provider refKey. */
const IDENTITY_PRESENTATION_METADATA_ALIASES: Readonly<Record<string, string>> = {
    "contact.first_name": "person.first_name",
    "contact.last_name": "person.last_name",
    "contact.email": "person.email",
    "contact.phone": "person.phone",
};

function metadataLookupRefKey(refKey: string): string {
    return IDENTITY_PRESENTATION_METADATA_ALIASES[refKey.trim()] ?? refKey.trim();
}

function formatFallbackLabel(refKey: string): string {
    return refKey
        .replace(/^[a-z_]+\./, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveFocusPanelProvider(
    refKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): CanonicalDataProvider | undefined {
    const lookup = metadataLookupRefKey(refKey);
    return resolveCanonicalProviderForConsumer(lookup, "focus_panel", {
        tenantFieldDefinitions,
    });
}

export function resolveCanonicalIdentityFieldLabel(
    refKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string {
    return resolveFocusPanelProvider(refKey, tenantFieldDefinitions)?.label ?? formatFallbackLabel(refKey);
}

export function resolveCanonicalIdentityFieldCategory(
    refKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): { categoryKey: string; categoryLabel: string } {
    const provider = resolveFocusPanelProvider(refKey, tenantFieldDefinitions);
    const categoryKey = provider?.categoryKey?.trim() || "general";
    return { categoryKey, categoryLabel: categoryDisplayLabel(categoryKey) };
}

export function focusPanelProvidersForNamespaces(
    namespaces: readonly AvailableFieldEntityNamespace[],
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): CanonicalDataProvider[] {
    const accepted = new Set(namespaces);
    return assembleFocusPanelNestedProviders({ tenantFieldDefinitions }).filter((provider) =>
        accepted.has(provider.entityNamespace as AvailableFieldEntityNamespace),
    );
}

export function isFocusPanelFieldKnown(
    refKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): boolean {
    return Boolean(resolveFocusPanelProvider(refKey, tenantFieldDefinitions));
}

function optionSetRefFromProvider(provider: CanonicalDataProvider | undefined): string | undefined {
    if (!provider) return undefined;
    if (provider.fieldType === "select" || provider.fieldType === "multiselect" || provider.valueType === "choice") {
        return provider.refKey;
    }
    return undefined;
}

/** Derive runtime read/write capability from canonical provider + focus_panel surface gate. */
export function resolveIdentityFieldRuntimeBinding(
    refKey: string,
    options?: {
        tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
        presentationWritable?: boolean;
    },
): IdentityFieldRuntimeBinding {
    const fieldRef = refKey.trim();
    const provider = resolveFocusPanelProvider(fieldRef, options?.tenantFieldDefinitions);
    const { categoryKey, categoryLabel } = resolveCanonicalIdentityFieldCategory(fieldRef, options?.tenantFieldDefinitions);
    const label = provider?.label ?? formatFallbackLabel(fieldRef);
    const ownerEntity = provider?.entityNamespace ?? (fieldRef.includes(".") ? fieldRef.slice(0, fieldRef.indexOf(".")) : "opportunity");
    const valueKind = provider?.fieldType ?? provider?.valueType ?? "text";
    const capability = provider
        ? deriveFieldCapability("focus_panel", {
              entity_type: ownerEntity,
              field_key: fieldRef.includes(".") ? fieldRef.slice(fieldRef.indexOf(".") + 1) : fieldRef,
              refKey: fieldRef,
              field_type: provider.fieldType,
              label: provider.label,
              is_system: provider.isSystem,
              is_active: true,
              is_platform_native: provider.kind === "platform_field",
              is_computed: provider.kind === "calculated_field" || provider.kind === "runtime_signal",
          })
        : null;
    const readable = capability?.status !== "unavailable";
    const writable =
        options?.presentationWritable === true
        && readable
        && capability?.status === "available"
        && provider?.kind !== "calculated_field"
        && provider?.kind !== "runtime_signal";
    return {
        providerRef: fieldRef,
        fieldRef,
        ownerEntity,
        valueKind,
        label,
        categoryKey,
        categoryLabel,
        readable,
        writable,
        isSystemField: provider?.isSystem ?? false,
        optionSetRef: optionSetRefFromProvider(provider),
        provider,
    };
}
