"use client";

import { useMemo } from "react";
import {
    layoutRefKeyForInquiryChildOcmField,
    type InquiryChildPlacementFieldMetadata,
} from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import type { InquiryChildNativeOcmFieldKey } from "@/lib/fields/inquiryChildFieldRegistry";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import {
    useLayoutRuntimeOptionSetLoader,
    useLayoutRuntimePlacementData,
} from "@/components/layout/LayoutRuntimePlacementDataProvider";

const INPUT_CLASS =
    "w-full rounded-md border border-admin-border bg-white px-2 py-1 text-sm text-alloy-midnight outline-none focus:border-alloy-juniper/40 focus:ring-1 focus:ring-alloy-juniper/10";

const SELECT_CLASS =
    "min-w-[8rem] w-full rounded-md border border-admin-border bg-white px-2 py-1 text-sm text-alloy-midnight outline-none focus:border-alloy-juniper/40 focus:ring-1 focus:ring-alloy-juniper/10";

type Props = {
    refKey: string;
    value: string;
    onChange: (value: string) => void;
    rowKey?: string;
    getDependentValue?: (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) => string;
    disabled?: boolean;
    /** Compact enrollment grid cell — minimal chrome until focus. */
    compact?: boolean;
    "data-layout-runtime-editable"?: string;
    "data-layout-runtime-ref-key"?: string;
    "data-layout-runtime-row-key"?: string;
};

const COMPACT_INPUT_CLASS =
    "w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-alloy-midnight outline-none transition-colors hover:border-alloy-stone/15 focus:border-alloy-juniper/35 focus:bg-white focus:px-2 focus:shadow-[0_0_0_1px_rgba(0,162,131,0.08)]";

const COMPACT_SELECT_CLASS =
    "min-w-0 w-full max-w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-alloy-midnight outline-none transition-colors hover:border-alloy-stone/15 focus:border-alloy-juniper/35 focus:bg-white focus:px-1.5";

function resolveSelectOptions(
    placement: InquiryChildPlacementFieldMetadata | undefined,
    optionSource: string | undefined,
    optionSetKey: string | null | undefined,
    placementData: ReturnType<typeof useLayoutRuntimePlacementData>,
    optionSetOptions: LayoutRuntimeSelectOption[],
    locationId: string,
    programKey: string,
): { options: LayoutRuntimeSelectOption[]; disabled: boolean; placeholder: string } {
    if (optionSource === "locations") {
        return {
            options: placementData?.siteOptions ?? [],
            disabled: false,
            placeholder: "Select a school",
        };
    }
    if (optionSource === "programs_for_location") {
        const disabled = !locationId.trim();
        return {
            options: placementData?.programOptionsForSite(locationId) ?? [],
            disabled,
            placeholder: disabled ? "Select a school first" : "Select a program",
        };
    }
    if (optionSource === "rooms_for_location_program") {
        const disabled = !locationId.trim();
        return {
            options: placementData?.roomOptionsForSiteAndProgram(locationId, programKey) ?? [],
            disabled,
            placeholder: disabled ? "Select a school first" : "Select a room",
        };
    }
    if (optionSource === "option_set" && optionSetKey) {
        return {
            options: optionSetOptions,
            disabled: false,
            placeholder: "Select…",
        };
    }
    void placement;
    return { options: [], disabled: false, placeholder: "Select…" };
}

type LayoutRuntimeSelectOption = { value: string; label: string };

export default function LayoutRuntimeFieldInput({
    refKey,
    value,
    onChange,
    rowKey,
    getDependentValue,
    disabled = false,
    compact = false,
    ...dataAttrs
}: Props) {
    const control = resolveLayoutRuntimeFieldControl(refKey);
    const placementData = useLayoutRuntimePlacementData();
    const optionSetOptions = useLayoutRuntimeOptionSetLoader(control.option_set_key);
    const inputClass = compact ? COMPACT_INPUT_CLASS : INPUT_CLASS;
    const selectClass = compact ? COMPACT_SELECT_CLASS : SELECT_CLASS;

    const locationId = getDependentValue?.("location_id") ?? "";
    const programKey = getDependentValue?.("desired_program_type") ?? "";

    const selectMeta = useMemo(
        () =>
            resolveSelectOptions(
                control.placement,
                control.option_source,
                control.option_set_key,
                placementData,
                optionSetOptions,
                locationId,
                programKey,
            ),
        [
            control.option_set_key,
            control.option_source,
            control.placement,
            locationId,
            optionSetOptions,
            placementData,
            programKey,
        ],
    );

    if (control.controlType === "date") {
        return (
            <input
                type="date"
                className={inputClass}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                data-layout-runtime-editable="true"
                data-layout-runtime-ref-key={refKey}
                data-layout-runtime-row-key={rowKey}
            />
        );
    }

    if (control.controlType === "select") {
        const fieldDisabled = disabled || selectMeta.disabled || (placementData?.loading && selectMeta.options.length === 0);
        return (
            <select
                className={selectClass}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={fieldDisabled}
                data-layout-runtime-editable="true"
                data-layout-runtime-ref-key={refKey}
                data-layout-runtime-row-key={rowKey}
                aria-label={refKey}
            >
                <option value="">{selectMeta.placeholder}</option>
                {selectMeta.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <input
            type="text"
            className={inputClass}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            {...dataAttrs}
            data-layout-runtime-editable="true"
            data-layout-runtime-ref-key={refKey}
            data-layout-runtime-row-key={rowKey}
        />
    );
}

export function layoutRuntimeDependentValueReader(
    getFieldValue: (refKey: string, fallback: string, rowKey?: string) => string,
    rowKey?: string,
): (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) => string {
    return (dependsOnOcmKey: InquiryChildNativeOcmFieldKey) =>
        getFieldValue(layoutRefKeyForInquiryChildOcmField(dependsOnOcmKey), "", rowKey);
}
