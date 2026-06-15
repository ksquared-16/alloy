/**
 * Opportunity native reference field metadata — layout runtime + field_definitions.config.
 */

import { normalizeRefKeyOnRead, parseLayoutRefKey } from "@/lib/layout/layoutRefKeyAliases";
import type { PlacementOptionSource } from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import type { OpportunityNativeReferenceFieldKey } from "@/lib/fields/opportunityFieldRegistry";

export type OpportunityReferenceFieldMetadata = {
    opportunity_field_key: OpportunityNativeReferenceFieldKey;
    control_type: "select";
    option_source: PlacementOptionSource;
    entity_scope: "opportunity";
};

export const OPPORTUNITY_REFERENCE_FIELD_METADATA: Record<
    OpportunityNativeReferenceFieldKey,
    OpportunityReferenceFieldMetadata
> = {
    location_id: {
        opportunity_field_key: "location_id",
        control_type: "select",
        option_source: "locations",
        entity_scope: "opportunity",
    },
};

export function opportunityReferenceMetadataForOpportunityFieldKey(
    fieldKey: string,
): OpportunityReferenceFieldMetadata | null {
    const k = fieldKey.trim() as OpportunityNativeReferenceFieldKey;
    return OPPORTUNITY_REFERENCE_FIELD_METADATA[k] ?? null;
}

export function opportunityReferenceMetadataForRefKey(refKey: string): OpportunityReferenceFieldMetadata | null {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    const { entityKey, fieldKey } = parseLayoutRefKey(normalized);
    if (entityKey !== "opportunity") return null;
    return opportunityReferenceMetadataForOpportunityFieldKey(fieldKey);
}

export function layoutRefKeyForOpportunityReferenceField(
    fieldKey: OpportunityNativeReferenceFieldKey,
): string {
    return `opportunity.${fieldKey}`;
}
