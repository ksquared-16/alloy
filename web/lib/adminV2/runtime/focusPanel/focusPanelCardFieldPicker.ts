/**
 * Focus Panel summary-card field picker — canonical provider assembly.
 *
 * Card-level and nested Identity pickers share the same focus_panel provider source.
 */

import type { AvailableField } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import type { AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { focusPanelProvidersForNamespaces } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import { childrenEvidenceRefIsOfferable } from "@/lib/adminV2/runtime/focusPanel/children/childrenEvidenceAuthoring";
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

/**
 * Cards that answer for what they can RESOLVE, not merely for a namespace.
 *
 * Namespace membership says which entity owns a field; it does not say that this
 * card can render it. Children offered 25 options and could resolve 15 — the
 * other 10 were household aggregates, canonical enrollment refs whose only
 * resolvers were their `child.*` aliases, and placeholders that answer null by
 * construction. The gate lives beside the card's own resolvers so the two cannot
 * drift apart again.
 */
const CARD_OFFERABLE_REF: Partial<Record<FocusPanelCardKey, (refKey: string) => boolean>> = {
    children: childrenEvidenceRefIsOfferable,
};

export function availableFieldsForFocusPanelCard(
    cardKey: FocusPanelCardKey,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AvailableField[] {
    const namespaces = CARD_NAMESPACE_BY_KEY[cardKey] ?? ["opportunity", "person", "child", "inquiry_child"];
    const offerable = CARD_OFFERABLE_REF[cardKey];
    return focusPanelProvidersForNamespaces(namespaces, tenantFieldDefinitions)
        .filter((provider) => (offerable ? offerable(provider.refKey) : true))
        .map(providerToAvailableField);
}
