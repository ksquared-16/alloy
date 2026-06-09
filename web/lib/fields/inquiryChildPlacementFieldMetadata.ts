/**
 * Inquiry child (OCM) placement field metadata — location → program → room cascade.
 * Consumed by layout runtime, field_definitions.config, and create/intake forms.
 *
 * @see docs/sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md §4.5
 */

import { normalizeRefKeyOnRead, parseLayoutRefKey } from "@/lib/layout/layoutRefKeyAliases";
import type { InquiryChildNativeOcmFieldKey } from "@/lib/fields/inquiryChildFieldRegistry";

export type PlacementOptionSource =
    | "locations"
    | "programs_for_location"
    | "rooms_for_location_program"
    | "option_set";

export type InquiryChildPlacementFieldMetadata = {
    ocm_field_key: InquiryChildNativeOcmFieldKey;
    control_type: "select";
    option_source: PlacementOptionSource;
    depends_on_field_key?: InquiryChildNativeOcmFieldKey;
    option_set_key?: string;
    entity_scope: "inquiry_child";
};

export const INQUIRY_CHILD_PLACEMENT_FIELD_METADATA: Record<
    InquiryChildNativeOcmFieldKey,
    InquiryChildPlacementFieldMetadata | undefined
> = {
    location_id: {
        ocm_field_key: "location_id",
        control_type: "select",
        option_source: "locations",
        entity_scope: "inquiry_child",
    },
    desired_program_type: {
        ocm_field_key: "desired_program_type",
        control_type: "select",
        option_source: "programs_for_location",
        depends_on_field_key: "location_id",
        entity_scope: "inquiry_child",
    },
    desired_program_category_id: undefined,
    program_room_cohort_key: {
        ocm_field_key: "program_room_cohort_key",
        control_type: "select",
        option_source: "rooms_for_location_program",
        depends_on_field_key: "desired_program_type",
        entity_scope: "inquiry_child",
    },
    desired_schedule_type: {
        ocm_field_key: "desired_schedule_type",
        control_type: "select",
        option_source: "option_set",
        option_set_key: "childcare_schedule_type",
        entity_scope: "inquiry_child",
    },
    desired_start_date: undefined,
    outcome_status_key: undefined,
    notes: undefined,
};

export function inquiryChildPlacementMetadataForOcmFieldKey(
    fieldKey: string,
): InquiryChildPlacementFieldMetadata | null {
    const k = fieldKey.trim() as InquiryChildNativeOcmFieldKey;
    return INQUIRY_CHILD_PLACEMENT_FIELD_METADATA[k] ?? null;
}

export function inquiryChildPlacementMetadataForRefKey(refKey: string): InquiryChildPlacementFieldMetadata | null {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    const { entityKey, fieldKey } = parseLayoutRefKey(normalized);
    if (entityKey !== "inquiry_child") return null;
    return inquiryChildPlacementMetadataForOcmFieldKey(fieldKey);
}

export function inquiryChildOcmFieldKeyFromLayoutRefKey(refKey: string): InquiryChildNativeOcmFieldKey | null {
    const meta = inquiryChildPlacementMetadataForRefKey(refKey);
    return meta?.ocm_field_key ?? null;
}

export function layoutRefKeyForInquiryChildOcmField(ocmFieldKey: InquiryChildNativeOcmFieldKey): string {
    return `inquiry_child.${ocmFieldKey}`;
}
