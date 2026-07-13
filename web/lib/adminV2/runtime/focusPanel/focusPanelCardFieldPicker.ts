/**
 * Focus Panel summary-card field picker — canonical provider assembly.
 *
 * Card-level and nested Identity pickers share the same focus_panel provider source.
 */

import type { AvailableField } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import type { AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { focusPanelProvidersForNamespaces } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const CARD_NAMESPACE_BY_KEY: Partial<Record<FocusPanelCardKey, readonly AvailableFieldEntityNamespace[]>> = {
    household: ["person", "customer", "child", "inquiry_child", "opportunity"],
    children: ["child", "inquiry_child"],
    current_work: ["opportunity", "queue_row"],
    readiness_kpi: ["opportunity", "child"],
    communications: ["opportunity", "person"],
    timeline: ["opportunity"],
};

function providerToAvailableField(provider: {
    refKey: string;
    label: string;
    entityNamespace: string;
    categoryKey?: string;
    displayHint?: AvailableField["displayHint"];
    isSystem: boolean;
}): AvailableField {
    return {
        key: provider.refKey,
        label: provider.label,
        entityNamespace: provider.entityNamespace as AvailableFieldEntityNamespace,
        categoryKey: provider.categoryKey,
        displayHint: provider.displayHint,
        isSystemField: provider.isSystem,
    };
}

export function availableFieldsForFocusPanelCard(
    cardKey: FocusPanelCardKey,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AvailableField[] {
    const namespaces = CARD_NAMESPACE_BY_KEY[cardKey] ?? ["opportunity", "person", "child", "inquiry_child"];
    return focusPanelProvidersForNamespaces(namespaces, tenantFieldDefinitions).map(providerToAvailableField);
}
