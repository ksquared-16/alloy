/**
 * Resolve layout-runtime control type + option binding for a refKey.
 */

import { getOptionSetKeyFromConfig, isSelectLikeFieldType } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import {
    getDependsOnFieldKeyFromConfig,
    getOptionSourceFromConfig,
} from "@/lib/fields/fieldDefinitionPlacementConfig";
import {
    fallbackOptionSetKeyForInquiryChildField,
    type InquiryChildNativeOcmFieldKey,
} from "@/lib/fields/inquiryChildFieldRegistry";
import {
    inquiryChildPlacementMetadataForRefKey,
    type InquiryChildPlacementFieldMetadata,
    type PlacementOptionSource,
} from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import { opportunityReferenceMetadataForRefKey } from "@/lib/fields/opportunityReferenceFieldMetadata";
import { placementCascadeConfigForEntityField } from "@/lib/fields/configurablePlacementFieldCatalog";
import { resolveSelectFieldBinding } from "@/lib/fields/resolveSelectFieldBinding";
import { normalizeRefKeyOnRead, parseLayoutRefKey } from "@/lib/layout/layoutRefKeyAliases";

export type LayoutRuntimeFieldControlType = "text" | "date" | "select";

export type LayoutRuntimeFieldControlResolution = {
    controlType: LayoutRuntimeFieldControlType;
    placement?: InquiryChildPlacementFieldMetadata;
    option_source?: PlacementOptionSource;
    depends_on_field_key?: InquiryChildNativeOcmFieldKey;
    option_set_key?: string | null;
};

export function resolveLayoutRuntimeFieldControl(
    refKey: string,
    fieldDef?: {
        field_type?: string;
        config?: Record<string, unknown> | null;
    } | null,
): LayoutRuntimeFieldControlResolution {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    const { entityKey, fieldKey } = parseLayoutRefKey(normalized);
    if (normalized === "child.date_of_birth" || normalized === "inquiry_child.desired_start_date") {
        return { controlType: "date" };
    }

    const catalogCascade =
        entityKey && fieldKey ? placementCascadeConfigForEntityField(entityKey, fieldKey) : null;
    const childPlacement = inquiryChildPlacementMetadataForRefKey(refKey);
    const opportunityReference = opportunityReferenceMetadataForRefKey(refKey);
    const config = fieldDef?.config ?? null;
    const optionSource =
        getOptionSourceFromConfig(config)
        ?? catalogCascade?.option_source
        ?? childPlacement?.option_source
        ?? opportunityReference?.option_source;
    const dependsOn =
        (getDependsOnFieldKeyFromConfig(config) as InquiryChildNativeOcmFieldKey | "")
        || (catalogCascade?.depends_on_field_key as InquiryChildNativeOcmFieldKey | "")
        || childPlacement?.depends_on_field_key;

    if (optionSource && optionSource !== "option_set" && optionSource !== "enrollment_child_status") {
        return {
            controlType: "select",
            placement: childPlacement ?? undefined,
            option_source: optionSource,
            depends_on_field_key: dependsOn || childPlacement?.depends_on_field_key,
        };
    }

    if (optionSource === "enrollment_child_status") {
        return {
            controlType: "select",
            placement: childPlacement ?? undefined,
            option_source: "enrollment_child_status",
        };
    }

    const ocmKey = childPlacement?.ocm_field_key;
    const fallbackSet =
        ocmKey ? fallbackOptionSetKeyForInquiryChildField(ocmKey)
        : inquiryChildPlacementMetadataForRefKey(refKey)?.option_set_key;

    const selectBinding = resolveSelectFieldBinding({
        field_type: fieldDef?.field_type ?? childPlacement?.control_type ?? "select",
        config,
        fallbackOptionSetKey: fallbackSet ?? childPlacement?.option_set_key,
    });

    if (selectBinding.isSelect) {
        return {
            controlType: "select",
            placement: childPlacement ?? undefined,
            option_source: "option_set",
            option_set_key: selectBinding.option_set_key,
        };
    }

    return { controlType: "text" };
}
