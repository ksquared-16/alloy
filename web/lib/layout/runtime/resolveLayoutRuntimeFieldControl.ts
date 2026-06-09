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
import { resolveSelectFieldBinding } from "@/lib/fields/resolveSelectFieldBinding";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";

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
    if (normalized === "child.date_of_birth" || normalized === "inquiry_child.desired_start_date") {
        return { controlType: "date" };
    }

    const placementFromMeta = inquiryChildPlacementMetadataForRefKey(refKey);
    const config = fieldDef?.config ?? null;
    const optionSource = getOptionSourceFromConfig(config) ?? placementFromMeta?.option_source;
    const dependsOn =
        (getDependsOnFieldKeyFromConfig(config) as InquiryChildNativeOcmFieldKey | "")
        || placementFromMeta?.depends_on_field_key;

    if (optionSource && optionSource !== "option_set" && placementFromMeta) {
        return {
            controlType: "select",
            placement: placementFromMeta,
            option_source: optionSource,
            depends_on_field_key: dependsOn || placementFromMeta.depends_on_field_key,
        };
    }

    const ocmKey = placementFromMeta?.ocm_field_key;
    const fallbackSet =
        ocmKey ? fallbackOptionSetKeyForInquiryChildField(ocmKey)
        : inquiryChildPlacementMetadataForRefKey(refKey)?.option_set_key;

    const selectBinding = resolveSelectFieldBinding({
        field_type: fieldDef?.field_type ?? placementFromMeta?.control_type ?? "select",
        config,
        fallbackOptionSetKey: fallbackSet ?? placementFromMeta?.option_set_key,
    });

    if (selectBinding.isSelect) {
        return {
            controlType: "select",
            placement: placementFromMeta ?? undefined,
            option_source: "option_set",
            option_set_key: selectBinding.option_set_key,
        };
    }

    return { controlType: "text" };
}
