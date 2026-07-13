/**
 * Legacy business-concept → canonical refKey compatibility (read/reconcile only).
 *
 * Published summary-card configs may still store concept paths. This module maps them
 * to canonical refKeys at reconciliation boundaries — it must not power active pickers.
 */

import type { FocusPanelCardField } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { isFocusPanelFieldKnown } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

/** Legacy concept path → canonical refKey. */
export const LEGACY_CONCEPT_TO_REF_KEY: Readonly<Record<string, string>> = {
    "Enrollment → Primary Contact → Name": "person.primary_contact_name",
    "Enrollment → Primary Contact → Phone": "person.primary_phone",
    "Enrollment → Primary Contact → Email": "person.primary_email",
    "Enrollment → Primary Contact → Address": "person.address_line",
    "Enrollment → Primary Contact → City": "person.address_line",
    "Enrollment → Primary Contact → State": "person.address_line",
    "Enrollment → Primary Contact → ZIP": "person.address_line",
    "Enrollment → Secondary Contact → Name": "person.secondary_contact_name",
    "Enrollment → Secondary Contact → Phone": "person.secondary_phone",
    "Enrollment → Secondary Contact → Email": "person.secondary_email",
    "Enrollment → Children → Summary": "children",
    "Enrollment → Children → Count": "children.count",
    "Enrollment → Children → Name": "child.first_name",
    "Enrollment → Children → Age": "child.date_of_birth",
    "Enrollment → Children → Status": "child.status",
    "Enrollment → Children → Current Room": "child.room",
    "Enrollment → Children → Program": "inquiry_child.program",
    "Enrollment → Children → Room": "child.room",
    "Enrollment → Children → Schedule": "inquiry_child.schedule_type",
    "Enrollment → Children → Teacher": "child.room",
    "Enrollment → Children → Desired Start": "child.start_date",
    "Enrollment → Program → Name": "inquiry_child.program",
    "Enrollment → Program → Schedule": "inquiry_child.schedule_type",
    "Enrollment → Program → Desired Start": "child.start_date",
    "Enrollment → Program → Room": "child.room",
    "Enrollment → Program → Location": "opportunity.location",
    "Enrollment → Stage & Status → Stage": "queue_row.stage_label",
    "Enrollment → Stage & Status → Status": "opportunity.status_label",
    "Enrollment → Stage & Status → Location": "opportunity.location",
};

export function legacyConceptToRefKey(concept: string | null | undefined): string | null {
    const trimmed = concept?.trim();
    if (!trimmed) return null;
    return LEGACY_CONCEPT_TO_REF_KEY[trimmed] ?? null;
}

export function effectiveCardFieldRefKey(field: FocusPanelCardField): string | null {
    if (field.refKey?.trim()) return field.refKey.trim();
    return legacyConceptToRefKey(field.concept);
}

/** Reconcile legacy concept-only card fields to carry canonical refKeys (non-destructive). */
export function reconcileCardFieldToCanonicalRef(field: FocusPanelCardField): FocusPanelCardField {
    if (field.refKey?.trim()) return field;
    const refKey = legacyConceptToRefKey(field.concept);
    if (!refKey) return field;
    return { ...field, refKey };
}

export type FocusPanelCardFieldResolutionState = "resolved" | "unavailable" | "deleted";

/** Builder/runtime resolution state for a persisted card field ref. */
export function focusPanelCardFieldResolutionState(
    field: FocusPanelCardField,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): FocusPanelCardFieldResolutionState {
    const refKey = effectiveCardFieldRefKey(field);
    if (!refKey) return "unavailable";
    if (isFocusPanelFieldKnown(refKey, tenantFieldDefinitions)) return "resolved";
    const tenantKey = refKey.includes(".") ? refKey.slice(refKey.indexOf(".") + 1) : refKey;
    const tenantDef = tenantFieldDefinitions?.find(
        (def) =>
            def.field_key === tenantKey
            && (def.entity_type === "customer_member"
                ? refKey.startsWith("child.")
                : `${def.entity_type}.${def.field_key}` === refKey),
    );
    if (tenantDef && tenantDef.is_active === false) return "deleted";
    return "unavailable";
}
